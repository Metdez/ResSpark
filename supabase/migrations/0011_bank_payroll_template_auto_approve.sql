-- 0011 bank and payroll template; done connections approve their item (PostgreSQL 17).
--
-- Source: ValorTax call, Oct 12 2026 (.planning/Client/call2.md). The default
-- packet should be only "connect your bank" and "connect your payroll", and a
-- finished connection should read green/done for the client and for staff, not
-- amber "waiting on staff" / "with your agent".
--
-- Data rules:
--   * additive only: one new global template row and one function body; no
--     column is dropped, renamed, or retyped, and templates a001/a002 stay as
--     they are (the Standard packet still carries address, ID, signature and
--     intake);
--   * a provider-reported done bank or payroll connection is the client's
--     completed step, so connection_set_status() moves the item to approved on
--     done and logs item.approved with actor type provider (mirroring
--     item_approve, 0004); staff can still Reject (item_reject accepts
--     approved). A done signature connection (DocuSeal) still submits for staff
--     review; connected/syncing still submit; pending still starts the item;
--   * the item only moves forward and approved is never regressed (WEBH-03);
--   * the Worker (service_role) stays the only reader and writer; anon and
--     authenticated get nothing.
--
-- Every statement is re-runnable (ON CONFLICT DO NOTHING / OR REPLACE /
-- idempotent REVOKE and GRANT).

BEGIN;

-- (a) Third global template: the default packet after the Oct 12 call --------
INSERT INTO public.request_templates (id, firm_id, name, items) VALUES
('00000000-0000-0000-0000-00000000a003', NULL, 'Bank and payroll', '[
    {"kind": "bank_connect", "label": "Connect your bank", "required": true, "config": {}},
    {"kind": "payroll_connect", "label": "Connect your payroll", "required": true, "config": {}}
]')
ON CONFLICT (id) DO NOTHING;

-- (b) connection_set_status: same signature, locks, rank rules and
-- connection.<status> event as 0005. Only the item mapping block changed:
-- done now approves the item and logs item.approved.
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
    SELECT it.id, it.status, it.label INTO i FROM public.request_items it WHERE it.id = c.request_item_id FOR UPDATE;

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

    -- WEBH-03 + Oct 12 call: the item moves forward only. pending -> in_progress;
    -- connected/syncing -> submitted (from pending, in_progress, rejected);
    -- done -> approved (from pending, in_progress, submitted, rejected): a
    -- provider-reported done connection is the client's completed step, so it
    -- reads green instead of waiting on staff. approved is never regressed;
    -- staff can still Reject (item_reject accepts approved).
    -- Only bank and payroll finish on their own; a signature (kind 'signature',
    -- DocuSeal) still submits for staff review as in Phase 6.
    v_item := CASE
        WHEN p_new_status = 'done' AND c.kind IN ('bank','payroll') THEN 'approved'
        WHEN p_new_status IN ('connected','syncing','done') THEN 'submitted'
        WHEN p_new_status = 'pending' THEN 'in_progress'
    END;
    IF v_item IS NOT NULL THEN
        UPDATE public.request_items
        SET status = v_item,
            rejection_note = CASE WHEN v_item IN ('submitted','approved') THEN NULL ELSE rejection_note END
        WHERE id = i.id
          AND (status = 'pending'
               OR (v_item = 'submitted' AND status IN ('in_progress','rejected'))
               OR (v_item = 'approved' AND status IN ('in_progress','submitted','rejected')));
        -- Mirrors item_approve's event (0004) so the audit log shows what approved (PLAT-04).
        IF v_item = 'approved' AND FOUND THEN
            PERFORM public.log_event(c.firm_id, c.case_id, c.request_id, 'provider', COALESCE(p_actor_id, c.provider),
                'item.approved', jsonb_build_object('request_item_id', i.id, 'label', i.label, 'auto', true));
        END IF;
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

-- Revoking PUBLIC also removes the Worker's implicit grant, so service_role gets
-- an explicit one (0005 pattern). OR REPLACE keeps the existing ACL; these are
-- restated so a fresh database ends in the same state.
REVOKE EXECUTE ON FUNCTION public.connection_set_status(UUID, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connection_set_status(UUID, TEXT, JSONB, TEXT) TO service_role;

COMMIT;
