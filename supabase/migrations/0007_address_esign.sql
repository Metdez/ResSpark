-- 0007_address_esign: Phase 6 groundwork (address step + e-sign).
--
-- Additive only: no new tables, no dropped columns. Backward compatible with the
-- deployed Worker (it never reads the new columns; the widened CHECKs only accept more).
--   * cases gains the 13 D-02 address columns. NULL means unknown, never ''.
--   * The Phase 4 inline CHECKs are widened for DocuSeal. Names confirmed in
--     pg_constraint before this file was written (2026-10-11):
--       connections_provider_check  CHECK (provider IN ('plaid','truv','teller'))
--       connections_kind_check      CHECK (kind IN ('bank','payroll'))
--       consents_kind_check         CHECK (kind IN ('bank_data','payroll_data'))
--   * case_confirm_address: the one write path for a client-confirmed address.
-- Every statement is re-runnable.

BEGIN;

ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS address_line1 TEXT,
    ADD COLUMN IF NOT EXISTS address_line2 TEXT,
    ADD COLUMN IF NOT EXISTS city TEXT,
    ADD COLUMN IF NOT EXISTS state_code TEXT CHECK (state_code ~ '^[A-Z]{2}$'),
    ADD COLUMN IF NOT EXISTS zip5 TEXT CHECK (zip5 ~ '^\d{5}$'),
    ADD COLUMN IF NOT EXISTS zip4 TEXT CHECK (zip4 ~ '^\d{4}$'),
    ADD COLUMN IF NOT EXISTS county_name TEXT,
    ADD COLUMN IF NOT EXISTS county_fips TEXT CHECK (county_fips ~ '^\d{5}$'),
    ADD COLUMN IF NOT EXISTS address_rdi TEXT CHECK (address_rdi IN ('Residential', 'Commercial')),
    ADD COLUMN IF NOT EXISTS address_dpv TEXT CHECK (address_dpv IN ('Y', 'N', 'S', 'D')),
    ADD COLUMN IF NOT EXISTS address_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS address_source TEXT CHECK (address_source IN ('smarty', 'manual')),
    ADD COLUMN IF NOT EXISTS address_confirmed_at TIMESTAMPTZ;

ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_provider_check,
    ADD CONSTRAINT connections_provider_check CHECK (provider IN ('plaid', 'truv', 'teller', 'docuseal'));
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_kind_check,
    ADD CONSTRAINT connections_kind_check CHECK (kind IN ('bank', 'payroll', 'signature'));
ALTER TABLE public.consents DROP CONSTRAINT IF EXISTS consents_kind_check,
    ADD CONSTRAINT consents_kind_check CHECK (kind IN ('bank_data', 'payroll_data', 'esign'));

-- Locks the request, then the item (same order as upload_complete), so concurrent
-- calls serialize instead of deadlocking.
CREATE OR REPLACE FUNCTION public.case_confirm_address(p_item_id UUID, p_link_id UUID, p_address JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_request_id UUID;
    r RECORD;
    i RECORD;
    v_source TEXT := p_address->>'source';
    v_verified BOOLEAN := COALESCE((p_address->>'verified')::BOOLEAN, false);
    v_item_status TEXT;
BEGIN
    -- D-02: only a live link may write (missing, revoked, or expired → link_inactive).
    SELECT l.request_id INTO v_request_id
    FROM public.client_links l
    WHERE l.id = p_link_id AND l.revoked_at IS NULL AND l.expires_at > now();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'link_inactive';
    END IF;

    SELECT req.id, req.firm_id, req.case_id INTO r
    FROM public.requests req WHERE req.id = v_request_id FOR UPDATE;

    -- D-02: the item must be this link's request's address item.
    SELECT it.id, it.status INTO i
    FROM public.request_items it
    WHERE it.id = p_item_id AND it.request_id = v_request_id AND it.kind = 'address'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'item_not_found';
    END IF;
    -- D-02: an approved address is frozen.
    IF i.status = 'approved' THEN
        RAISE EXCEPTION 'item_approved';
    END IF;

    -- D-06: a manual address is never verified and carries no county, FIPS, RDI, or DPV.
    IF v_source IS NULL OR v_source NOT IN ('smarty', 'manual') THEN
        RAISE EXCEPTION 'bad_address';
    END IF;
    IF v_source = 'manual' AND (v_verified
        OR NULLIF(p_address->>'county_name', '') IS NOT NULL
        OR NULLIF(p_address->>'county_fips', '') IS NOT NULL
        OR NULLIF(p_address->>'rdi', '') IS NOT NULL
        OR NULLIF(p_address->>'dpv', '') IS NOT NULL) THEN
        RAISE EXCEPTION 'bad_address';
    END IF;

    -- D-02: blanks land as NULL (unknown), never ''.
    UPDATE public.cases SET
        address_line1 = NULLIF(p_address->>'line1', ''),
        address_line2 = NULLIF(p_address->>'line2', ''),
        city = NULLIF(p_address->>'city', ''),
        state_code = NULLIF(p_address->>'state_code', ''),
        zip5 = NULLIF(p_address->>'zip5', ''),
        zip4 = NULLIF(p_address->>'zip4', ''),
        county_name = NULLIF(p_address->>'county_name', ''),
        county_fips = NULLIF(p_address->>'county_fips', ''),
        address_rdi = NULLIF(p_address->>'rdi', ''),
        address_dpv = NULLIF(p_address->>'dpv', ''),
        address_verified = v_verified,
        address_source = v_source,
        address_confirmed_at = now()
    WHERE id = r.case_id;

    -- D-02: the item only moves forward, and only as far as submitted.
    IF i.status IN ('pending', 'in_progress', 'rejected') THEN
        UPDATE public.request_items SET status = 'submitted', rejection_note = NULL WHERE id = i.id;
        v_item_status := 'submitted';
    ELSE
        v_item_status := i.status;
    END IF;

    -- D-02: the event carries no street, unit, city, or ZIP text.
    PERFORM public.log_event(r.firm_id, r.case_id, r.id, 'client', p_link_id::TEXT, 'address.confirmed',
        jsonb_build_object('source', v_source, 'verified', v_verified,
            'county_fips', NULLIF(p_address->>'county_fips', ''), 'rdi', NULLIF(p_address->>'rdi', '')));

    RETURN jsonb_build_object('item_status', v_item_status, 'request_status', public.request_apply_status(r.id));
END
$$;

-- Revoking PUBLIC also removes the Worker's implicit grant, so service_role gets an explicit one (0002).
REVOKE EXECUTE ON FUNCTION public.case_confirm_address(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.case_confirm_address(UUID, UUID, JSONB) TO service_role;

COMMIT;
