-- 0005 connections (Phase 4, PostgreSQL 17).
--
-- Data rules:
--   * additive only: no earlier column is dropped, renamed, or retyped;
--   * connections is the generalized representation of every provider link
--     (provider plaid|truv|teller x kind bank|payroll). Provider-specific
--     shapes (Truv employers, Plaid institution, sync state) live in
--     data jsonb and inside the Worker adapters, never as provider-named
--     columns;
--   * NULL external_id means the vendor has not issued an id yet;
--   * connections.status is written by connection_set_status() only, which
--     is monotonic by status_rank() and moves the request item and request
--     status forward in the same transaction (D-03, WEBH-03);
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / idempotent
-- REVOKE and GRANT).

BEGIN;

CREATE TABLE IF NOT EXISTS public.connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    request_item_id UUID NOT NULL REFERENCES public.request_items(id) ON DELETE CASCADE,
    case_id UUID NOT NULL REFERENCES public.cases(id),
    provider TEXT NOT NULL CHECK (provider IN ('plaid','truv','teller')),
    kind TEXT NOT NULL CHECK (kind IN ('bank','payroll')),
    external_id TEXT,
    link_ref TEXT,
    return_nonce TEXT UNIQUE,
    return_nonce_used_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','connected','syncing','done','error','removed')),
    data JSONB NOT NULL DEFAULT '{}',
    error JSONB,
    sync_cursor TEXT,
    last_webhook_at TIMESTAMPTZ,
    last_polled_at TIMESTAMPTZ,
    connected_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    remove_after TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS connections_provider_external_idx
    ON public.connections (provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS connections_link_ref_idx ON public.connections (link_ref) WHERE link_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS connections_item_idx ON public.connections (request_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS connections_request_idx ON public.connections (request_id);
CREATE INDEX IF NOT EXISTS connections_status_idx ON public.connections (status, last_polled_at);

DROP TRIGGER IF EXISTS connections_touch_updated_at ON public.connections;
CREATE TRIGGER connections_touch_updated_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- AES-GCM sealed provider access token (Plan 04); one row per connection.
CREATE TABLE IF NOT EXISTS public.connection_secrets (
    connection_id UUID PRIMARY KEY REFERENCES public.connections(id) ON DELETE CASCADE,
    key_version SMALLINT NOT NULL DEFAULT 1,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    external_account_id TEXT NOT NULL,
    mask TEXT,
    name TEXT,
    official_name TEXT,
    type TEXT,
    subtype TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bank_accounts_connection_account_key UNIQUE (connection_id, external_account_id)
);

CREATE TABLE IF NOT EXISTS public.bank_statement_months (
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    year INT NOT NULL,
    month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
    status TEXT NOT NULL CHECK (status IN ('pending','available','not_supported','manual','missing')),
    document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bank_account_id, year, month)
);

CREATE INDEX IF NOT EXISTS bank_statement_months_document_idx
    ON public.bank_statement_months (document_id) WHERE document_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id) ON DELETE CASCADE,
    plaid_transaction_id TEXT NOT NULL UNIQUE,
    amount NUMERIC(14,2) NOT NULL,
    iso_currency_code TEXT,
    date DATE NOT NULL,
    authorized_date DATE,
    name TEXT,
    merchant_name TEXT,
    category_primary TEXT,
    category_detailed TEXT,
    pending BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bank_transactions_conn_date_idx
    ON public.bank_transactions (connection_id, date DESC, plaid_transaction_id);
CREATE INDEX IF NOT EXISTS bank_transactions_account_idx ON public.bank_transactions (bank_account_id);

-- D-01 ledger: one row per verified delivery; the unique key makes redelivery a no-op.
-- payload is the verified body; headers (signatures) are never stored.
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('plaid','truv','docuseal')),
    event_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','ignored','dead')),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    processed_at TIMESTAMPTZ,
    CONSTRAINT webhook_events_provider_event_key_key UNIQUE (provider, event_key)
);

CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON public.webhook_events (status, received_at);

-- D-12 / BANK-05: one row per link, kind and consent text version.
CREATE TABLE IF NOT EXISTS public.consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    link_id UUID NOT NULL REFERENCES public.client_links(id) ON DELETE CASCADE,
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('bank_data','payroll_data')),
    text_version TEXT NOT NULL,
    agreed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_class TEXT,
    user_agent_class TEXT,
    CONSTRAINT consents_link_kind_version_key UNIQUE (link_id, kind, text_version)
);

CREATE INDEX IF NOT EXISTS consents_request_idx ON public.consents (request_id);

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS documents_connection_id_idx
    ON public.documents (connection_id) WHERE connection_id IS NOT NULL;

-- error (45) sits below done (50) so a stale error can never undo completion,
-- and above syncing so an error is not cleared by a stale pending; a later
-- connected/syncing/done may still clear it (ITEM_LOGIN_REQUIRED, then repaired)
-- through the explicit exception in connection_set_status().
CREATE OR REPLACE FUNCTION public.status_rank(s TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT CASE s
        WHEN 'pending' THEN 10
        WHEN 'connected' THEN 30
        WHEN 'syncing' THEN 40
        WHEN 'error' THEN 45
        WHEN 'done' THEN 50
        WHEN 'removed' THEN 60
        ELSE -1
    END;
$$;

-- D-03 / WEBH-03: the only writer of connections.status.
-- Lock order matches 0004 (requests row, then request_items row), with the
-- connection row between them, so this RPC and upload_complete/item_approve
-- serialize on the same request instead of deadlocking.
CREATE OR REPLACE FUNCTION public.connection_set_status(
    p_connection_id UUID,
    p_new_status TEXT,
    p_detail JSONB DEFAULT '{}',
    p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_request_id UUID;
    v_detail JSONB := COALESCE(p_detail, '{}'::JSONB);
    r RECORD;
    c RECORD;
    i RECORD;
    v_item TEXT;
    v_item_status TEXT;
    v_req TEXT;
BEGIN
    SELECT con.request_id INTO v_request_id FROM public.connections con WHERE con.id = p_connection_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'connection_not_found';
    END IF;
    IF public.status_rank(p_new_status) < 0 THEN
        RAISE EXCEPTION 'bad_status';
    END IF;

    SELECT req.id, req.status INTO r FROM public.requests req WHERE req.id = v_request_id FOR UPDATE;
    SELECT con.* INTO c FROM public.connections con WHERE con.id = p_connection_id FOR UPDATE;
    SELECT it.id, it.status INTO i FROM public.request_items it WHERE it.id = c.request_item_id FOR UPDATE;

    -- Equal status is an idempotent no-op that writes no second event, except
    -- error -> error: a new error reason is new information, so it is stored and logged.
    IF c.status = p_new_status AND p_new_status <> 'error' THEN
        RETURN jsonb_build_object('applied', true, 'status', c.status, 'item_status', i.status,
            'request_status', r.status);
    END IF;

    -- "out-of-order events never regress a step": a lower rank is ignored, except
    -- that an error is repairable by connected/syncing/done. removed (60) is terminal.
    IF public.status_rank(p_new_status) < public.status_rank(c.status)
        AND NOT (c.status = 'error' AND public.status_rank(p_new_status) >= public.status_rank('connected')) THEN
        RETURN jsonb_build_object('applied', false, 'status', c.status, 'item_status', i.status,
            'request_status', r.status);
    END IF;

    UPDATE public.connections
    SET status = p_new_status,
        error = CASE WHEN p_new_status = 'error' THEN v_detail ELSE NULL END,
        connected_at = COALESCE(connected_at, CASE WHEN p_new_status IN ('connected','syncing','done') THEN now() END),
        completed_at = CASE WHEN p_new_status = 'done' THEN COALESCE(completed_at, now()) ELSE completed_at END,
        removed_at = CASE WHEN p_new_status = 'removed' THEN now() ELSE removed_at END,
        last_polled_at = now()
    WHERE id = c.id;

    -- WEBH-03: the item moves forward only (pending -> in_progress; pending,
    -- in_progress or rejected -> submitted); approved is never touched.
    v_item := CASE
        WHEN p_new_status IN ('connected','syncing','done') THEN 'submitted'
        WHEN p_new_status = 'pending' THEN 'in_progress'
    END;
    IF v_item IS NOT NULL THEN
        UPDATE public.request_items
        SET status = v_item,
            rejection_note = CASE WHEN v_item = 'submitted' THEN NULL ELSE rejection_note END
        WHERE id = i.id
          AND (status = 'pending' OR (v_item = 'submitted' AND status IN ('in_progress','rejected')));
    END IF;
    SELECT it.status INTO v_item_status FROM public.request_items it WHERE it.id = i.id;

    PERFORM public.log_event(c.firm_id, c.case_id, c.request_id, 'provider', COALESCE(p_actor_id, c.provider),
        'connection.' || p_new_status,
        v_detail || jsonb_build_object('connection_id', c.id, 'provider', c.provider, 'kind', c.kind));
    v_req := public.request_apply_status(c.request_id);
    RETURN jsonb_build_object('applied', true, 'status', p_new_status, 'item_status', v_item_status,
        'request_status', v_req);
END
$$;

CREATE OR REPLACE FUNCTION public.connection_record_event(
    p_connection_id UUID,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}',
    p_actor_type TEXT DEFAULT 'provider',
    p_actor_id TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    c RECORD;
BEGIN
    SELECT con.id, con.firm_id, con.case_id, con.request_id, con.provider INTO c
    FROM public.connections con WHERE con.id = p_connection_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'connection_not_found';
    END IF;
    RETURN public.log_event(c.firm_id, c.case_id, c.request_id, p_actor_type, COALESCE(p_actor_id, c.provider),
        p_action, COALESCE(p_payload, '{}'::JSONB) || jsonb_build_object('connection_id', c.id));
END
$$;

-- Deny by default (Supabase SKILL security checklist): RLS on with no
-- policies, no table grants for anon/authenticated, and functions revoked
-- from PUBLIC (new functions are PUBLIC-executable by default). All three
-- functions are SECURITY INVOKER: the Worker runs as service_role and needs
-- no definer rights.
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.connections FROM anon, authenticated;
REVOKE ALL ON public.connection_secrets FROM anon, authenticated;
REVOKE ALL ON public.bank_accounts FROM anon, authenticated;
REVOKE ALL ON public.bank_statement_months FROM anon, authenticated;
REVOKE ALL ON public.bank_transactions FROM anon, authenticated;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;
REVOKE ALL ON public.consents FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.status_rank(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.connection_set_status(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.connection_record_event(UUID, TEXT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- With PUBLIC revoked, the Worker's role needs explicit grants (01-04 pattern).
GRANT EXECUTE ON FUNCTION public.status_rank(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.connection_set_status(UUID, TEXT, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.connection_record_event(UUID, TEXT, JSONB, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
