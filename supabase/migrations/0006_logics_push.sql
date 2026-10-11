-- 0006 Logics push ledger (Phase 5, PostgreSQL 17).
--
-- Data rules:
--   * additive only: no earlier column is dropped, renamed, or retyped;
--   * the ledger is a delivery log, not a copy of the case file: Logics stays
--     the system of record and exposes no document list, so `unknown` is a
--     first-class state that only staff can resolve (D-03, D-04);
--   * request_fingerprint = sha256hex(case_id|document sha256|part_index) is
--     computed by the Worker, so this file needs no pgcrypto;
--   * every state change goes through the RPCs below, guarded by
--     `WHERE state = <from>`, and writes its events row in the same
--     transaction;
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / idempotent
-- REVOKE and GRANT).

BEGIN;

-- D-08: firm-level Logics settings (file_category_id, activity_type, write_enabled).
ALTER TABLE public.firm_integrations
    ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE IF NOT EXISTS public.logics_push_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    case_id UUID NOT NULL REFERENCES public.cases(id),
    request_id UUID NOT NULL REFERENCES public.requests(id),
    logics_case_id BIGINT NOT NULL,
    created_by UUID NOT NULL,
    agent_display_name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('fake','live')),
    file_category_id INT,
    activity_type TEXT NOT NULL DEFAULT 'General',
    activity_state TEXT NOT NULL DEFAULT 'pending'
        CHECK (activity_state IN ('pending','sending','sent','failed','unknown','skipped')),
    logics_activity_id BIGINT,
    activity_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.logics_pushes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    case_id UUID NOT NULL REFERENCES public.cases(id),
    document_id UUID NOT NULL REFERENCES public.documents(id),
    part_index INT NOT NULL DEFAULT 0,
    part_count INT,
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','sent','failed','unknown')),
    mode TEXT NOT NULL CHECK (mode IN ('fake','live')),
    logics_document_id BIGINT,
    request_fingerprint TEXT NOT NULL,
    error_code TEXT,
    error_detail TEXT,
    attempts INT NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL,
    batch_id UUID NOT NULL REFERENCES public.logics_push_batches(id),
    request_id UUID NOT NULL REFERENCES public.requests(id),
    file_name TEXT NOT NULL,
    part_storage_path TEXT,
    part_bytes INT,
    part_sha256 TEXT,
    file_category_id INT,
    needs_manual_compression BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID,
    -- Pitfall 2: `sent` needs proof; resolved_by is the staff "I checked Logics" escape (PUSH-04).
    CONSTRAINT logics_pushes_sent_has_id
        CHECK (state <> 'sent' OR logics_document_id IS NOT NULL OR resolved_by IS NOT NULL)
);

-- D-01: one live row per document part. `unknown` is deliberately outside the
-- index so a staff resend can queue a new row once the old one is `failed`.
CREATE UNIQUE INDEX IF NOT EXISTS logics_pushes_fingerprint_live
    ON public.logics_pushes (request_fingerprint) WHERE state IN ('queued','sending','sent');
CREATE INDEX IF NOT EXISTS logics_pushes_case_state_idx ON public.logics_pushes (case_id, state);
CREATE INDEX IF NOT EXISTS logics_pushes_batch_idx ON public.logics_pushes (batch_id, created_at, part_index, id);
CREATE INDEX IF NOT EXISTS logics_pushes_document_idx ON public.logics_pushes (document_id);
CREATE INDEX IF NOT EXISTS logics_push_batches_request_idx
    ON public.logics_push_batches (request_id, created_at DESC, id DESC);

-- Batch + one queued part-0 row per document, all or nothing (PUSH-01).
CREATE OR REPLACE FUNCTION public.logics_push_create_batch(
    p_firm_id UUID,
    p_request_id UUID,
    p_actor_id UUID,
    p_agent_display_name TEXT,
    p_mode TEXT,
    p_file_category_id INT,
    p_activity_type TEXT,
    p_items JSONB,
    p_push_again UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    r RECORD;
    it JSONB;
    v_batch_id UUID;
    v_doc_id UUID;
    v_fp TEXT;
    v_push_id UUID;
    v_ids JSONB := '[]'::JSONB;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'no_items';
    END IF;

    SELECT req.id, req.case_id, c.logics_case_id INTO r
    FROM public.requests req JOIN public.cases c ON c.id = req.case_id
    WHERE req.id = p_request_id AND req.firm_id = p_firm_id
    FOR UPDATE OF req;
    IF NOT FOUND OR r.logics_case_id IS NULL THEN
        RAISE EXCEPTION 'request_not_found';
    END IF;

    INSERT INTO public.logics_push_batches
        (firm_id, case_id, request_id, logics_case_id, created_by, agent_display_name, mode,
         file_category_id, activity_type)
    VALUES (p_firm_id, r.case_id, r.id, r.logics_case_id, p_actor_id, p_agent_display_name, p_mode,
         p_file_category_id, COALESCE(NULLIF(p_activity_type, ''), 'General'))
    RETURNING id INTO v_batch_id;

    FOR it IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_doc_id := (it->>'document_id')::UUID;
        v_fp := it->>'fingerprint';
        PERFORM 1
        FROM public.documents d JOIN public.request_items ri ON ri.id = d.request_item_id
        WHERE d.id = v_doc_id AND d.status = 'ready' AND d.size_bytes > 0 AND d.sha256 IS NOT NULL
          AND ri.request_id = r.id AND ri.status = 'approved';
        IF NOT FOUND OR COALESCE(v_fp, '') = '' THEN
            RAISE EXCEPTION 'not_pushable';
        END IF;
        IF NOT (v_doc_id = ANY (COALESCE(p_push_again, '{}'::UUID[]))) AND EXISTS (
            SELECT 1 FROM public.logics_pushes lp
            WHERE lp.request_fingerprint = v_fp AND lp.state IN ('queued','sending','sent','unknown')
        ) THEN
            RAISE EXCEPTION 'already_pushed';
        END IF;
        -- A `sent` fingerprint re-pushed via push_again still hits the partial
        -- unique index (23505); the Worker maps that to already_pushed.
        INSERT INTO public.logics_pushes
            (batch_id, firm_id, case_id, request_id, document_id, part_index, file_name, state, mode,
             request_fingerprint, file_category_id, created_by)
        VALUES (v_batch_id, p_firm_id, r.case_id, r.id, v_doc_id, 0,
             left(COALESCE(NULLIF(it->>'file_name', ''), 'document.pdf'), 200), 'queued', p_mode,
             v_fp, p_file_category_id, p_actor_id)
        RETURNING id INTO v_push_id;
        PERFORM public.log_event(p_firm_id, r.case_id, r.id, 'staff', p_actor_id::TEXT, 'logics.push_queued',
            jsonb_build_object('push_id', v_push_id, 'document_id', v_doc_id, 'part_index', 0, 'mode', p_mode));
        v_ids := v_ids || to_jsonb(v_push_id);
    END LOOP;

    RETURN jsonb_build_object('batch_id', v_batch_id, 'push_ids', v_ids);
END
$$;

-- D-02: queued -> sending only when no sibling of the same case is sending.
-- The per-case advisory lock makes the NOT EXISTS check race-free between two
-- different rows of one case; it is released at commit, never held across HTTP.
CREATE OR REPLACE FUNCTION public.logics_push_claim(p_push_id UUID)
RETURNS public.logics_pushes
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_case_id UUID;
    r public.logics_pushes;
BEGIN
    SELECT lp.case_id INTO v_case_id FROM public.logics_pushes lp WHERE lp.id = p_push_id;
    IF NOT FOUND THEN
        RETURN r;
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended('logics_push:' || v_case_id::TEXT, 0));

    UPDATE public.logics_pushes lp
    SET state = 'sending', claimed_at = now(), attempts = lp.attempts + 1, updated_at = now()
    WHERE lp.id = p_push_id AND lp.state = 'queued'
      AND NOT EXISTS (SELECT 1 FROM public.logics_pushes o WHERE o.case_id = lp.case_id AND o.state = 'sending')
    RETURNING * INTO r;
    IF r.id IS NOT NULL THEN
        PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'system', 'queue', 'logics.push_sending',
            jsonb_build_object('push_id', r.id, 'document_id', r.document_id, 'part_index', r.part_index,
                'attempts', r.attempts));
    END IF;
    RETURN r;
END
$$;

-- PUSH-04: the allowed pairs only; anything else returns false and writes nothing.
-- No pair leaves `sent`; queued -> sending belongs to logics_push_claim.
CREATE OR REPLACE FUNCTION public.logics_push_transition(
    p_push_id UUID,
    p_from TEXT,
    p_to TEXT,
    p_logics_document_id BIGINT,
    p_error_code TEXT,
    p_error_detail TEXT,
    p_needs_manual BOOLEAN,
    p_actor_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    r public.logics_pushes;
    v_staff BOOLEAN := p_actor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
    IF NOT COALESCE((p_from || '>' || p_to) = ANY (ARRAY[
        'sending>sent', 'sending>failed', 'sending>unknown', 'unknown>sent', 'unknown>failed', 'failed>failed'
    ]), false) THEN
        RETURN false;
    END IF;

    UPDATE public.logics_pushes
    SET state = p_to,
        logics_document_id = COALESCE(p_logics_document_id, logics_document_id),
        error_code = p_error_code,
        error_detail = left(p_error_detail, 500),
        needs_manual_compression = COALESCE(p_needs_manual, needs_manual_compression),
        sent_at = CASE WHEN p_to = 'sent' THEN now() ELSE sent_at END,
        resolved_by = CASE WHEN p_from = 'unknown' AND COALESCE(v_staff, false) THEN p_actor_id::UUID ELSE resolved_by END,
        updated_at = now()
    WHERE id = p_push_id AND state = p_from
    RETURNING * INTO r;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    PERFORM public.log_event(r.firm_id, r.case_id, r.request_id,
        CASE WHEN COALESCE(v_staff, false) THEN 'staff' ELSE 'system' END, COALESCE(p_actor_id, 'queue'),
        'logics.push_' || p_to,
        jsonb_build_object('push_id', r.id, 'document_id', r.document_id, 'part_index', r.part_index,
            'error_code', r.error_code, 'logics_document_id', r.logics_document_id));
    RETURN true;
END
$$;

-- Plan 03 seam: the part-0 row (sending) records its normalized bytes and
-- queues sibling rows for parts 1..n-1. Re-runs skip existing fingerprints.
CREATE OR REPLACE FUNCTION public.logics_push_add_parts(p_push_id UUID, p_part_count INT, p_parts JSONB)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    r public.logics_pushes;
    p JSONB;
    v_id UUID;
    v_ids UUID[] := '{}'::UUID[];
BEGIN
    SELECT * INTO r FROM public.logics_pushes WHERE id = p_push_id FOR UPDATE;
    IF NOT FOUND OR r.state <> 'sending' THEN
        RAISE EXCEPTION 'not_sending';
    END IF;

    FOR p IN SELECT value FROM jsonb_array_elements(COALESCE(p_parts, '[]'::JSONB)) LOOP
        IF (p->>'part_index')::INT = 0 THEN
            UPDATE public.logics_pushes
            SET part_count = p_part_count,
                file_name = COALESCE(NULLIF(p->>'file_name', ''), file_name),
                part_storage_path = p->>'storage_path',
                part_bytes = (p->>'bytes')::INT,
                part_sha256 = p->>'sha256',
                updated_at = now()
            WHERE id = r.id;
        ELSIF NOT EXISTS (SELECT 1 FROM public.logics_pushes lp WHERE lp.request_fingerprint = p->>'fingerprint') THEN
            INSERT INTO public.logics_pushes
                (batch_id, firm_id, case_id, request_id, document_id, part_index, part_count, file_name,
                 part_storage_path, part_bytes, part_sha256, state, mode, request_fingerprint,
                 file_category_id, created_by)
            VALUES (r.batch_id, r.firm_id, r.case_id, r.request_id, r.document_id, (p->>'part_index')::INT,
                 p_part_count, p->>'file_name', p->>'storage_path', (p->>'bytes')::INT, p->>'sha256', 'queued',
                 r.mode, p->>'fingerprint', r.file_category_id, r.created_by)
            RETURNING id INTO v_id;
            PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'system', 'queue', 'logics.push_queued',
                jsonb_build_object('push_id', v_id, 'document_id', r.document_id,
                    'part_index', (p->>'part_index')::INT, 'mode', r.mode));
            v_ids := v_ids || v_id;
        END IF;
    END LOOP;
    RETURN v_ids;
END
$$;

-- PUSH-03: pending -> sending exactly once, only when every part is terminal.
-- The winner writes the activity note; an all-failed batch is skipped (nothing
-- reached Logics, so no "Documents uploaded" note).
CREATE OR REPLACE FUNCTION public.logics_push_finalize_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    b public.logics_push_batches;
    v_sent JSONB;
    v_unknown JSONB;
    v_all_failed BOOLEAN;
BEGIN
    UPDATE public.logics_push_batches SET activity_state='sending', updated_at = now()
    WHERE id = p_batch_id AND activity_state = 'pending'
      AND NOT EXISTS (SELECT 1 FROM public.logics_pushes WHERE batch_id = p_batch_id AND state IN ('queued','sending'))
    RETURNING * INTO b;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        COALESCE(jsonb_agg(jsonb_build_object('file_name', lp.file_name, 'part_index', lp.part_index,
            'part_count', lp.part_count, 'document_id', lp.document_id)
            ORDER BY lp.created_at, lp.part_index, lp.id) FILTER (WHERE lp.state = 'sent'), '[]'::JSONB),
        COALESCE(jsonb_agg(jsonb_build_object('file_name', lp.file_name, 'part_index', lp.part_index,
            'part_count', lp.part_count, 'document_id', lp.document_id)
            ORDER BY lp.created_at, lp.part_index, lp.id) FILTER (WHERE lp.state = 'unknown'), '[]'::JSONB)
    INTO v_sent, v_unknown
    FROM public.logics_pushes lp WHERE lp.batch_id = p_batch_id;

    v_all_failed := jsonb_array_length(v_sent) = 0 AND jsonb_array_length(v_unknown) = 0;
    IF v_all_failed THEN
        UPDATE public.logics_push_batches SET activity_state = 'skipped', updated_at = now()
        WHERE id = p_batch_id RETURNING * INTO b;
    END IF;

    RETURN jsonb_build_object('batch', to_jsonb(b), 'sent', v_sent, 'unknown', v_unknown, 'all_failed', v_all_failed);
END
$$;

CREATE OR REPLACE FUNCTION public.logics_push_batch_activity(
    p_batch_id UUID,
    p_state TEXT,
    p_activity_id BIGINT,
    p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    b public.logics_push_batches;
BEGIN
    IF p_state IS NULL OR p_state NOT IN ('sent','failed','unknown','skipped') THEN
        RETURN false;
    END IF;
    UPDATE public.logics_push_batches
    SET activity_state = p_state, logics_activity_id = p_activity_id, activity_error = left(p_error, 500),
        updated_at = now()
    WHERE id = p_batch_id AND activity_state = 'sending'
    RETURNING * INTO b;
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    PERFORM public.log_event(b.firm_id, b.case_id, b.request_id, 'system', 'queue',
        CASE WHEN p_state = 'sent' THEN 'logics.activity_sent' ELSE 'logics.activity_failed' END,
        jsonb_build_object('batch_id', b.id, 'activity_id', p_activity_id, 'state', p_state, 'error_code', p_error));
    RETURN true;
END
$$;

-- D-04: staff resolution. mark_sent: unknown -> sent. resend: the old row
-- becomes failed first, then a NEW queued row with the same fingerprint.
CREATE OR REPLACE FUNCTION public.logics_push_resolve(
    p_push_id UUID,
    p_firm_id UUID,
    p_action TEXT,
    p_actor_id UUID,
    p_logics_document_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    r public.logics_pushes;
    v_new UUID;
BEGIN
    SELECT * INTO r FROM public.logics_pushes WHERE id = p_push_id AND firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not_found';
    END IF;

    IF p_action = 'mark_sent' THEN
        IF r.state <> 'unknown' THEN
            RAISE EXCEPTION 'not_resolvable';
        END IF;
        UPDATE public.logics_pushes
        SET state = 'sent', logics_document_id = p_logics_document_id, resolved_by = p_actor_id, sent_at = now(),
            updated_at = now()
        WHERE id = r.id;
        PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'staff', p_actor_id::TEXT, 'logics.push_resolved',
            jsonb_build_object('push_id', r.id, 'resolution', 'mark_sent', 'logics_document_id', p_logics_document_id));
        RETURN jsonb_build_object('state', 'sent', 'new_push_id', NULL);
    ELSIF p_action = 'resend' THEN
        IF NOT (r.state = 'unknown' OR (r.state = 'failed' AND NOT r.needs_manual_compression)) THEN
            RAISE EXCEPTION 'not_resolvable';
        END IF;
        UPDATE public.logics_pushes
        SET state = 'failed', error_code = 'resent_by_staff', resolved_by = p_actor_id, updated_at = now()
        WHERE id = r.id;
        INSERT INTO public.logics_pushes
            (batch_id, firm_id, case_id, request_id, document_id, part_index, part_count, file_name,
             part_storage_path, part_bytes, part_sha256, file_category_id, mode, request_fingerprint, state,
             created_by)
        VALUES (r.batch_id, r.firm_id, r.case_id, r.request_id, r.document_id, r.part_index, r.part_count,
             r.file_name, r.part_storage_path, r.part_bytes, r.part_sha256, r.file_category_id, r.mode,
             r.request_fingerprint, 'queued', p_actor_id)
        RETURNING id INTO v_new;
        PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'staff', p_actor_id::TEXT, 'logics.push_resolved',
            jsonb_build_object('push_id', r.id, 'resolution', 'resend', 'new_push_id', v_new));
        PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'staff', p_actor_id::TEXT, 'logics.push_queued',
            jsonb_build_object('push_id', v_new, 'document_id', r.document_id, 'part_index', r.part_index,
                'mode', r.mode));
        RETURN jsonb_build_object('state', 'failed', 'new_push_id', v_new);
    END IF;
    RAISE EXCEPTION 'bad_action';
END
$$;

-- T-05-08: stale `sending` -> unknown (consumer_lost); lists orphaned queued
-- rows to re-enqueue (safe because the claim is state-guarded). Plan 03 wires
-- this to the cron.
CREATE OR REPLACE FUNCTION public.logics_push_sweep(p_stale_minutes INT DEFAULT 10, p_orphan_minutes INT DEFAULT 5)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    r public.logics_pushes;
    n INT := 0;
BEGIN
    FOR r IN
        UPDATE public.logics_pushes
        SET state = 'unknown', error_code = 'consumer_lost', updated_at = now()
        WHERE state = 'sending' AND claimed_at < now() - make_interval(mins => p_stale_minutes)
        RETURNING *
    LOOP
        PERFORM public.log_event(r.firm_id, r.case_id, r.request_id, 'system', 'cron', 'logics.push_unknown',
            jsonb_build_object('push_id', r.id, 'document_id', r.document_id, 'part_index', r.part_index,
                'error_code', 'consumer_lost'));
        n := n + 1;
    END LOOP;
    RETURN jsonb_build_object('swept', n, 'requeue', (
        SELECT COALESCE(jsonb_agg(lp.id), '[]'::JSONB) FROM public.logics_pushes lp
        WHERE lp.state = 'queued' AND lp.updated_at < now() - make_interval(mins => p_orphan_minutes)
    ));
END
$$;

-- Deny by default (Supabase SKILL security checklist): RLS on with no
-- policies, no table grants for anon/authenticated, and functions revoked
-- from PUBLIC (new functions are PUBLIC-executable by default). All eight
-- functions are SECURITY INVOKER: the Worker runs as service_role.
ALTER TABLE public.logics_push_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logics_pushes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.logics_push_batches, public.logics_pushes FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.logics_push_create_batch(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, JSONB, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_claim(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_transition(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_add_parts(UUID, INT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_finalize_batch(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_batch_activity(UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_resolve(UUID, UUID, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.logics_push_sweep(INT, INT) FROM PUBLIC, anon, authenticated;
-- With PUBLIC revoked, the Worker's role needs explicit grants (01-04 pattern).
GRANT EXECUTE ON FUNCTION public.logics_push_create_batch(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, JSONB, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_claim(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_transition(UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_add_parts(UUID, INT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_finalize_batch(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_batch_activity(UUID, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_resolve(UUID, UUID, TEXT, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.logics_push_sweep(INT, INT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
