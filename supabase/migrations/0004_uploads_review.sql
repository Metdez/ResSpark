-- 0004 uploads and review (Phase 3, PostgreSQL 17).
--
-- Data rules:
--   * additive only: no baseline, Phase 1 or Phase 2 column is dropped,
--     renamed, or retyped (D-04);
--   * documents.storage_key holds the Storage object path in bucket
--     case-documents (D-01); documents.mime_type holds the declared type,
--     verified by magic bytes before status becomes 'ready' (D-03);
--   * NULL size_bytes / sha256 means "not finalized";
--   * request status is derived by request_status() only (D-06); every RPC
--     below writes its events row and re-applies that status in the same
--     transaction;
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing, in Postgres and in Storage.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / ON CONFLICT DO
-- NOTHING / idempotent REVOKE and GRANT).

BEGIN;

ALTER TABLE public.documents ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.documents
    ADD COLUMN IF NOT EXISTS request_item_id UUID REFERENCES public.request_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS sha256 TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'uploading'
        CHECK (status IN ('uploading','ready','rejected','deleted')),
    ADD COLUMN IF NOT EXISTS uploaded_by_actor TEXT,
    ADD COLUMN IF NOT EXISTS rejection_note TEXT;

CREATE INDEX IF NOT EXISTS documents_request_item_id_idx ON public.documents (request_item_id, uploaded_at, id);
CREATE INDEX IF NOT EXISTS events_request_created_idx ON public.events (request_id, created_at DESC);

-- Private bucket; no storage.objects policies and no grants: the Worker's secret
-- key is the only Storage principal. Bytes arrive through Worker-minted signed
-- upload tokens bound to one object path.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('case-documents', 'case-documents', false, 26214400, ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

-- D-06: the single source of truth for requests.status.
CREATE OR REPLACE FUNCTION public.request_status(p_request_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT CASE
        -- staff-owned states are never overridden by item activity
        WHEN r.status IN ('draft', 'revoked') THEN r.status
        -- "complete when every required item is approved"; a request with no
        -- required items is complete only when every item is approved, and a
        -- request with no items never is
        WHEN a.n_items > 0 AND a.n_required_open = 0 AND (a.n_required > 0 OR a.n_open = 0) THEN 'complete'
        -- "waiting_on_staff when any item is submitted"
        WHEN a.n_submitted > 0 THEN 'waiting_on_staff'
        -- "in_progress when any item is in_progress/submitted/rejected after open"
        WHEN r.opened_at IS NOT NULL AND a.n_active > 0 THEN 'in_progress'
        -- "else opened/sent"
        WHEN r.opened_at IS NOT NULL THEN 'opened'
        WHEN r.sent_at IS NOT NULL THEN 'sent'
        ELSE 'draft'
    END
    FROM public.requests r
    CROSS JOIN LATERAL (
        SELECT
            count(*) AS n_items,
            count(*) FILTER (WHERE i.required) AS n_required,
            count(*) FILTER (WHERE i.required AND i.status <> 'approved') AS n_required_open,
            count(*) FILTER (WHERE i.status <> 'approved') AS n_open,
            count(*) FILTER (WHERE i.status = 'submitted') AS n_submitted,
            count(*) FILTER (WHERE i.status IN ('in_progress', 'submitted', 'rejected')) AS n_active
        FROM public.request_items i
        WHERE i.request_id = r.id
    ) a
    WHERE r.id = p_request_id;
$$;

CREATE OR REPLACE FUNCTION public.request_apply_status(p_request_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v TEXT;
BEGIN
    v := public.request_status(p_request_id);
    UPDATE public.requests
    SET status = v,
        completed_at = CASE WHEN v = 'complete' THEN COALESCE(completed_at, now()) ELSE NULL END
    WHERE id = p_request_id;
    RETURN v;
END
$$;

-- Lock order in all three RPCs: requests row, then request_items row, then
-- documents rows (0003 locks requests first too), so concurrent calls
-- serialize instead of deadlocking; the last writer recomputes the status.

CREATE OR REPLACE FUNCTION public.upload_complete(
    p_document_id UUID,
    p_request_id UUID,
    p_size_bytes BIGINT,
    p_sha256 TEXT,
    p_actor_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_item_id UUID;
    r RECORD;
    i RECORD;
    d RECORD;
    v TEXT;
BEGIN
    SELECT doc.request_item_id INTO v_item_id
    FROM public.documents doc
    JOIN public.request_items it ON it.id = doc.request_item_id
    WHERE doc.id = p_document_id AND it.request_id = p_request_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'document_not_found';
    END IF;

    SELECT req.id, req.firm_id, req.case_id, req.status INTO r
    FROM public.requests req WHERE req.id = p_request_id FOR UPDATE;
    SELECT it.id, it.status INTO i
    FROM public.request_items it WHERE it.id = v_item_id FOR UPDATE;
    SELECT doc.id, doc.status, doc.mime_type INTO d
    FROM public.documents doc WHERE doc.id = p_document_id FOR UPDATE;

    IF d.status = 'ready' THEN
        RETURN jsonb_build_object('document_status', 'ready', 'item_status', i.status,
            'request_status', r.status, 'already', true);
    END IF;
    IF d.status <> 'uploading' THEN
        RAISE EXCEPTION 'document_not_uploading';
    END IF;

    UPDATE public.documents
    SET status = 'ready', size_bytes = p_size_bytes, sha256 = p_sha256, uploaded_at = now()
    WHERE id = d.id;
    UPDATE public.request_items SET status = 'submitted', rejection_note = NULL WHERE id = i.id;
    PERFORM public.log_event(r.firm_id, r.case_id, r.id, 'client', p_actor_id, 'document.uploaded',
        jsonb_build_object('document_id', d.id, 'request_item_id', i.id, 'size_bytes', p_size_bytes,
            'mime_type', d.mime_type));
    v := public.request_apply_status(r.id);
    RETURN jsonb_build_object('document_status', 'ready', 'item_status', 'submitted', 'request_status', v);
END
$$;

CREATE OR REPLACE FUNCTION public.item_approve(p_item_id UUID, p_firm_id UUID, p_actor_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_request_id UUID;
    r RECORD;
    i RECORD;
    v TEXT;
BEGIN
    SELECT it.request_id INTO v_request_id
    FROM public.request_items it JOIN public.requests req ON req.id = it.request_id
    WHERE it.id = p_item_id AND req.firm_id = p_firm_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_not_found';
    END IF;

    SELECT req.id, req.firm_id, req.case_id, req.status INTO r
    FROM public.requests req WHERE req.id = v_request_id FOR UPDATE;
    SELECT it.id, it.status, it.label INTO i
    FROM public.request_items it WHERE it.id = p_item_id FOR UPDATE;

    IF i.status = 'approved' THEN
        RETURN jsonb_build_object('item_status', 'approved', 'request_status', r.status, 'already', true);
    END IF;
    IF i.status NOT IN ('submitted', 'rejected') THEN
        RAISE EXCEPTION 'item_not_submitted';
    END IF;

    UPDATE public.request_items SET status = 'approved', rejection_note = NULL WHERE id = i.id;
    PERFORM public.log_event(r.firm_id, r.case_id, r.id, 'staff', p_actor_id, 'item.approved',
        jsonb_build_object('request_item_id', i.id, 'label', i.label));
    v := public.request_apply_status(r.id);
    RETURN jsonb_build_object('item_status', 'approved', 'request_status', v);
END
$$;

CREATE OR REPLACE FUNCTION public.item_reject(p_item_id UUID, p_firm_id UUID, p_note TEXT, p_actor_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_request_id UUID;
    v_note TEXT := btrim(coalesce(p_note, ''));
    r RECORD;
    i RECORD;
    v TEXT;
BEGIN
    IF length(v_note) = 0 THEN
        RAISE EXCEPTION 'note_required';
    END IF;

    SELECT it.request_id INTO v_request_id
    FROM public.request_items it JOIN public.requests req ON req.id = it.request_id
    WHERE it.id = p_item_id AND req.firm_id = p_firm_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_not_found';
    END IF;

    SELECT req.id, req.firm_id, req.case_id, req.status INTO r
    FROM public.requests req WHERE req.id = v_request_id FOR UPDATE;
    SELECT it.id, it.status, it.label INTO i
    FROM public.request_items it WHERE it.id = p_item_id FOR UPDATE;

    IF i.status NOT IN ('submitted', 'approved', 'rejected') THEN
        RAISE EXCEPTION 'item_not_submitted';
    END IF;

    UPDATE public.request_items SET status = 'rejected', rejection_note = v_note WHERE id = i.id;
    UPDATE public.documents SET status = 'rejected', rejection_note = v_note
    WHERE request_item_id = i.id AND status = 'ready';
    PERFORM public.log_event(r.firm_id, r.case_id, r.id, 'staff', p_actor_id, 'item.rejected',
        jsonb_build_object('request_item_id', i.id, 'label', i.label, 'note', v_note));
    v := public.request_apply_status(r.id);
    RETURN jsonb_build_object('item_status', 'rejected', 'request_status', v);
END
$$;

-- D-07: overdue = sent 3+ days ago and not complete. created_at and expires_at
-- are kept because Phase 2's GET /api/admin/requests already returns them.
CREATE OR REPLACE VIEW public.request_dashboard_v WITH (security_invoker = true) AS
SELECT
    r.id, r.firm_id, r.case_id, r.status, r.template_name, r.agent_display_name,
    r.created_at, r.sent_at, r.opened_at, r.completed_at,
    c.first_name, c.last_name, c.email,
    l.expires_at,
    (SELECT max(e.created_at) FROM public.events e WHERE e.request_id = r.id) AS last_activity_at,
    (r.sent_at IS NOT NULL AND r.sent_at <= now() - interval '3 days' AND r.status NOT IN ('complete', 'revoked')) AS overdue
FROM public.requests r
JOIN public.cases c ON c.id = r.case_id
LEFT JOIN LATERAL (
    SELECT cl.expires_at FROM public.client_links cl
    WHERE cl.request_id = r.id ORDER BY cl.version DESC LIMIT 1
) l ON true;

-- Deny by default (RESEARCH F-6, Supabase SKILL security checklist): views
-- bypass RLS unless security_invoker, and functions are executable by PUBLIC
-- unless revoked (the Phase 1 default-privilege revoke does not cover PUBLIC).
REVOKE ALL ON public.request_dashboard_v FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_status(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.request_apply_status(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upload_complete(UUID, UUID, BIGINT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.item_approve(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.item_reject(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- With PUBLIC revoked, the Worker's role needs explicit grants (01-04 pattern).
GRANT SELECT ON public.request_dashboard_v TO service_role;
GRANT EXECUTE ON FUNCTION public.request_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_apply_status(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upload_complete(UUID, UUID, BIGINT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.item_approve(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.item_reject(UUID, UUID, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
