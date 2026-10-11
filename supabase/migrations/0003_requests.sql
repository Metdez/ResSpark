-- 0003 requests (Phase 2, PostgreSQL 17).
--
-- Data rules:
--   * additive only: no baseline or Phase 1 column is dropped, renamed, or
--     retyped; the one tightening (client_links.request_id NOT NULL) raises
--     instead of deleting rows;
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing;
--   * every request state change goes through one of the RPCs below, which
--     writes its events row in the same transaction;
--   * NULL means unknown; an explicit value means known.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO
-- NOTHING / guarded DO blocks / idempotent REVOKE).

BEGIN;

CREATE TABLE IF NOT EXISTS public.firm_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    provider TEXT NOT NULL CHECK (provider IN ('logics')),
    base_url TEXT NOT NULL DEFAULT 'https://valortax.logiqsapi.com/publicapi/V4/',
    api_key_ciphertext TEXT,
    secret_ciphertext TEXT,
    key_hint TEXT,
    last_test_at TIMESTAMPTZ,
    last_test_ok BOOLEAN,
    updated_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT firm_integrations_firm_provider_key UNIQUE (firm_id, provider)
);

-- firm_id NULL = a global template every firm sees.
CREATE TABLE IF NOT EXISTS public.request_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID REFERENCES public.firms(id),
    name TEXT NOT NULL,
    items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array' AND jsonb_array_length(items) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- contact_email / contact_phone_e164: the destination staff confirmed at send time.
CREATE TABLE IF NOT EXISTS public.requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    template_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'opened', 'in_progress', 'waiting_on_staff', 'complete', 'revoked')),
    contact_email TEXT,
    contact_phone_e164 TEXT,
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    agent_display_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- position is unique per request; kind and label may repeat.
CREATE TABLE IF NOT EXISTS public.request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
    position INT NOT NULL,
    kind TEXT NOT NULL
        CHECK (kind IN ('bank_connect', 'payroll_connect', 'address', 'upload', 'signature', 'intake')),
    label TEXT NOT NULL,
    required BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'submitted', 'approved', 'rejected')),
    config JSONB NOT NULL DEFAULT '{}',
    rejection_note TEXT,
    CONSTRAINT request_items_request_position_key UNIQUE (request_id, position)
);

CREATE TABLE IF NOT EXISTS public.client_sessions (
    link_id UUID PRIMARY KEY REFERENCES public.client_links(id) ON DELETE CASCADE,
    last_step TEXT,
    last_error TEXT,
    user_agent_class TEXT CHECK (user_agent_class IN ('phone', 'tablet', 'desktop')),
    seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS requests_touch_updated_at ON public.requests;
CREATE TRIGGER requests_touch_updated_at
    BEFORE UPDATE ON public.requests
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS logics_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS logics_fetched_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS phone_e164 TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS cases_firm_logics_case_idx
    ON public.cases (firm_id, logics_case_id) WHERE logics_case_id IS NOT NULL;

-- Phase 1 never wrote client_links; refuse rather than delete if that changed.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.client_links WHERE request_id IS NULL) THEN
        RAISE EXCEPTION 'client_links has rows without request_id; backfill or delete them before 0003';
    END IF;
END
$$;
ALTER TABLE public.client_links ALTER COLUMN request_id SET NOT NULL;

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'client_links_request_id_fkey' AND conrelid = 'public.client_links'::regclass
    ) THEN
        ALTER TABLE public.client_links
            ADD CONSTRAINT client_links_request_id_fkey
            FOREIGN KEY (request_id) REFERENCES public.requests(id) ON DELETE CASCADE;
    END IF;
END
$$;

-- One link per request; regenerate bumps version on that row (D-08).
CREATE UNIQUE INDEX IF NOT EXISTS client_links_request_id_key ON public.client_links (request_id);
CREATE INDEX IF NOT EXISTS requests_firm_status_idx ON public.requests (firm_id, status);
CREATE INDEX IF NOT EXISTS requests_case_id_idx ON public.requests (case_id);
CREATE INDEX IF NOT EXISTS request_items_request_id_idx ON public.request_items (request_id);

INSERT INTO public.request_templates (id, firm_id, name, items) VALUES
('00000000-0000-0000-0000-00000000a001', NULL, 'Standard resolution packet', '[
    {"kind": "bank_connect", "label": "Connect your bank", "required": true, "config": {}},
    {"kind": "payroll_connect", "label": "Connect your payroll", "required": true, "config": {}},
    {"kind": "address", "label": "Confirm your address", "required": true, "config": {}},
    {"kind": "upload", "label": "Government ID", "required": true, "config": {"doc_code": "government_id"}},
    {"kind": "signature", "label": "Engagement letter", "required": true, "config": {"template": "engagement_letter"}}
]'),
('00000000-0000-0000-0000-00000000a002', NULL, 'Documents only', '[
    {"kind": "upload", "label": "Government ID", "required": true, "config": {"doc_code": "government_id"}},
    {"kind": "upload", "label": "Last 3 bank statements", "required": true, "config": {"doc_code": "bank_statements"}},
    {"kind": "upload", "label": "Last 2 pay stubs", "required": true, "config": {"doc_code": "pay_stubs"}}
]')
ON CONFLICT (id) DO NOTHING;

-- RPCs: SECURITY INVOKER (service_role's own grants apply), search_path '' with
-- every name qualified, and each RAISE is a bare token the Worker maps to an
-- error code. Lock order is always requests row, then client_links row.

CREATE OR REPLACE FUNCTION public.case_confirm_logics(
    p_firm_id UUID,
    p_logics_case_id BIGINT,
    p_first_name TEXT,
    p_last_name TEXT,
    p_email TEXT,
    p_phone_e164 TEXT,
    p_snapshot JSONB,
    p_actor_id UUID,
    p_search_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_case_id UUID;
BEGIN
    INSERT INTO public.cases AS c
        (id, firm_id, logics_case_id, first_name, last_name, email, phone_e164, logics_snapshot, logics_fetched_at)
    VALUES
        (gen_random_uuid(), p_firm_id, p_logics_case_id, p_first_name, p_last_name, p_email, p_phone_e164, p_snapshot, now())
    ON CONFLICT (firm_id, logics_case_id) WHERE logics_case_id IS NOT NULL DO UPDATE SET
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        phone_e164 = EXCLUDED.phone_e164,
        logics_snapshot = EXCLUDED.logics_snapshot,
        logics_fetched_at = now(),
        updated_at = now()
    RETURNING c.id INTO v_case_id;

    PERFORM public.log_event(p_firm_id, v_case_id, NULL, 'staff', p_actor_id::TEXT, 'case.looked_up',
        jsonb_build_object('search_type', p_search_type, 'logics_case_id', p_logics_case_id));
    RETURN v_case_id;
END
$$;

CREATE OR REPLACE FUNCTION public.request_create(
    p_firm_id UUID,
    p_case_id UUID,
    p_template_name TEXT,
    p_items JSONB,
    p_created_by UUID,
    p_agent_display_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'no_items';
    END IF;
    PERFORM 1 FROM public.cases WHERE id = p_case_id AND firm_id = p_firm_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'case_not_found';
    END IF;

    INSERT INTO public.requests (firm_id, case_id, template_name, created_by, agent_display_name)
    VALUES (p_firm_id, p_case_id, p_template_name, p_created_by, p_agent_display_name)
    RETURNING id INTO v_id;

    INSERT INTO public.request_items (request_id, position, kind, label, required, config)
    SELECT v_id, t.ord, t.item->>'kind', t.item->>'label',
           COALESCE((t.item->>'required')::BOOLEAN, true), COALESCE(t.item->'config', '{}'::JSONB)
    FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);

    PERFORM public.log_event(p_firm_id, p_case_id, v_id, 'staff', p_created_by::TEXT, 'request.created',
        jsonb_build_object('template_name', p_template_name, 'item_count', jsonb_array_length(p_items)));
    RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION public.request_send(
    p_request_id UUID,
    p_firm_id UUID,
    p_actor_id UUID,
    p_contact_email TEXT,
    p_contact_phone_e164 TEXT,
    p_expires_in_days INT DEFAULT 14,
    p_payload JSONB DEFAULT '{}'
)
RETURNS TABLE (link_id UUID, version INT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT r.case_id, r.status INTO v_req
    FROM public.requests r WHERE r.id = p_request_id AND r.firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;
    IF v_req.status <> 'draft' THEN
        RAISE EXCEPTION 'request_not_draft';
    END IF;

    -- Output columns share names with client_links columns, so qualify with cl.
    INSERT INTO public.client_links AS cl (firm_id, request_id, version, expires_at, created_by)
    VALUES (p_firm_id, p_request_id, 1, now() + make_interval(days => p_expires_in_days), p_actor_id)
    RETURNING cl.id, cl.version, cl.expires_at INTO link_id, version, expires_at;

    UPDATE public.requests
    SET status = 'sent', sent_at = now(), contact_email = p_contact_email, contact_phone_e164 = p_contact_phone_e164
    WHERE id = p_request_id;

    PERFORM public.log_event(p_firm_id, v_req.case_id, p_request_id, 'staff', p_actor_id::TEXT, 'request.sent', p_payload);
    RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION public.request_regenerate_link(
    p_request_id UUID,
    p_firm_id UUID,
    p_actor_id UUID,
    p_expires_in_days INT DEFAULT 14
)
RETURNS TABLE (link_id UUID, version INT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT r.case_id, r.status INTO v_req
    FROM public.requests r WHERE r.id = p_request_id AND r.firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;
    IF v_req.status NOT IN ('sent', 'opened', 'in_progress', 'waiting_on_staff') THEN
        RAISE EXCEPTION 'request_not_active';
    END IF;

    UPDATE public.client_links AS cl
    SET version = cl.version + 1, expires_at = now() + make_interval(days => p_expires_in_days)
    WHERE cl.request_id = p_request_id
    RETURNING cl.id, cl.version, cl.expires_at INTO link_id, version, expires_at;

    PERFORM public.log_event(p_firm_id, v_req.case_id, p_request_id, 'staff', p_actor_id::TEXT,
        'request.link_regenerated', jsonb_build_object('version', version));
    RETURN NEXT;
END
$$;

CREATE OR REPLACE FUNCTION public.request_revoke(
    p_request_id UUID,
    p_firm_id UUID,
    p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_req RECORD;
BEGIN
    SELECT r.case_id, r.status INTO v_req
    FROM public.requests r WHERE r.id = p_request_id AND r.firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;
    IF v_req.status = 'revoked' THEN
        RAISE EXCEPTION 'request_revoked';
    END IF;

    UPDATE public.client_links SET revoked_at = now() WHERE request_id = p_request_id AND revoked_at IS NULL;
    UPDATE public.requests SET status = 'revoked' WHERE id = p_request_id;
    PERFORM public.log_event(p_firm_id, v_req.case_id, p_request_id, 'staff', p_actor_id::TEXT, 'request.revoked', '{}');
END
$$;

-- Called by the client portal: the link id comes from a verified token, so no firm argument.
CREATE OR REPLACE FUNCTION public.request_open(p_link_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_request_id UUID;
    v_req RECORD;
    v_link RECORD;
    v_opened TIMESTAMPTZ;
BEGIN
    SELECT l.request_id INTO v_request_id FROM public.client_links l WHERE l.id = p_link_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'link_inactive';
    END IF;
    SELECT r.firm_id, r.case_id INTO v_req FROM public.requests r WHERE r.id = v_request_id FOR UPDATE;
    SELECT l.opened_at, l.revoked_at, l.expires_at INTO v_link
    FROM public.client_links l WHERE l.id = p_link_id FOR UPDATE;
    IF v_link.revoked_at IS NOT NULL OR v_link.expires_at <= now() THEN
        RAISE EXCEPTION 'link_inactive';
    END IF;

    IF v_link.opened_at IS NOT NULL THEN
        RETURN v_link.opened_at;
    END IF;

    UPDATE public.client_links SET opened_at = now()
    WHERE id = p_link_id AND opened_at IS NULL
    RETURNING opened_at INTO v_opened;
    UPDATE public.requests SET status = 'opened', opened_at = v_opened
    WHERE id = v_request_id AND status = 'sent';
    PERFORM public.log_event(v_req.firm_id, v_req.case_id, v_request_id, 'client', p_link_id::TEXT, 'request.opened', '{}');
    RETURN v_opened;
END
$$;

-- Deny by default (RESEARCH F-6), same block as 0002: RLS on every new table,
-- revoke what exists, keep the default privileges revoked. No policies for
-- anon/authenticated (D-12).
ALTER TABLE public.firm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Functions are executable by PUBLIC unless revoked; anon and authenticated inherit that.
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.case_confirm_logics(UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_create(UUID, UUID, TEXT, JSONB, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_send(UUID, UUID, UUID, TEXT, TEXT, INT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_regenerate_link(UUID, UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_revoke(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_open(UUID) FROM PUBLIC, anon, authenticated;
-- With PUBLIC revoked, the Worker's role needs explicit grants (trigger firing needs none).
GRANT EXECUTE ON FUNCTION public.case_confirm_logics(UUID, BIGINT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_create(UUID, UUID, TEXT, JSONB, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_send(UUID, UUID, UUID, TEXT, TEXT, INT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_regenerate_link(UUID, UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_revoke(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_open(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
