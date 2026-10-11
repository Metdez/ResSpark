-- 0010 staff accounts (PostgreSQL 17): public firm sign-up and staff invites.
--
-- Data rules:
--   * additive only: one new table and three new functions; no existing
--     column is dropped, renamed, or retyped;
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing (D-12);
--   * auth users are created by the Worker through the Auth admin API; these
--     functions only write the firm, the staff profile, the invite, and the
--     audit event, each in one transaction;
--   * invite tokens are stored as SHA-256 hex only; the raw token is never
--     written anywhere.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / idempotent REVOKE).

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    email TEXT NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
    role TEXT NOT NULL CHECK (role IN ('staff', 'admin')),
    token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS staff_invites_firm_id_idx ON public.staff_invites (firm_id);
-- One open invite per address per firm; staff_invite_create revokes the old one first.
CREATE UNIQUE INDEX IF NOT EXISTS staff_invites_open_email_idx
    ON public.staff_invites (firm_id, email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Creates the firm and its first admin profile for a just-created auth user.
CREATE OR REPLACE FUNCTION public.firm_create_with_admin(
    p_user_id UUID,
    p_firm_name TEXT,
    p_display_name TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_firm_id UUID;
BEGIN
    INSERT INTO public.firms (name) VALUES (p_firm_name) RETURNING id INTO v_firm_id;
    INSERT INTO public.staff_profiles (user_id, firm_id, role, display_name)
        VALUES (p_user_id, v_firm_id, 'admin', p_display_name);
    PERFORM public.log_event(v_firm_id, NULL, NULL, 'staff', p_user_id::TEXT, 'firm.created', '{}'::JSONB);
    RETURN v_firm_id;
END;
$$;

-- Revokes any open invite for the address, then records the new one.
CREATE OR REPLACE FUNCTION public.staff_invite_create(
    p_firm_id UUID,
    p_email TEXT,
    p_role TEXT,
    p_token_hash TEXT,
    p_invited_by UUID,
    p_ttl_days INT
) RETURNS TABLE (id UUID, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
    v_expires TIMESTAMPTZ := CURRENT_TIMESTAMP + make_interval(days => p_ttl_days);
BEGIN
    UPDATE public.staff_invites s SET revoked_at = CURRENT_TIMESTAMP
        WHERE s.firm_id = p_firm_id AND s.email = p_email
          AND s.accepted_at IS NULL AND s.revoked_at IS NULL;
    INSERT INTO public.staff_invites (firm_id, email, role, token_hash, invited_by, expires_at)
        VALUES (p_firm_id, p_email, p_role, p_token_hash, p_invited_by, v_expires)
        RETURNING staff_invites.id INTO v_id;
    PERFORM public.log_event(p_firm_id, NULL, NULL, 'staff', p_invited_by::TEXT, 'staff.invited',
        jsonb_build_object('invite_id', v_id, 'role', p_role));
    RETURN QUERY SELECT v_id, v_expires;
END;
$$;

-- Accepts an open, unexpired invite for a just-created auth user. Raises
-- 'invite_invalid' when the invite was revoked, used, or expired meanwhile.
CREATE OR REPLACE FUNCTION public.staff_invite_accept(
    p_token_hash TEXT,
    p_user_id UUID,
    p_display_name TEXT
) RETURNS TABLE (firm_id UUID, role TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_invite public.staff_invites%ROWTYPE;
BEGIN
    SELECT * INTO v_invite FROM public.staff_invites s
        WHERE s.token_hash = p_token_hash AND s.accepted_at IS NULL AND s.revoked_at IS NULL
          AND s.expires_at > CURRENT_TIMESTAMP
        FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'invite_invalid';
    END IF;
    INSERT INTO public.staff_profiles (user_id, firm_id, role, display_name)
        VALUES (p_user_id, v_invite.firm_id, v_invite.role, p_display_name);
    UPDATE public.staff_invites SET accepted_at = CURRENT_TIMESTAMP, accepted_by = p_user_id
        WHERE staff_invites.id = v_invite.id;
    PERFORM public.log_event(v_invite.firm_id, NULL, NULL, 'staff', p_user_id::TEXT, 'staff.invite_accepted',
        jsonb_build_object('invite_id', v_invite.id, 'role', v_invite.role));
    RETURN QUERY SELECT v_invite.firm_id, v_invite.role;
END;
$$;

ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_invites FROM anon, authenticated;

-- Functions are executable by PUBLIC unless revoked; anon and authenticated inherit that.
REVOKE EXECUTE ON FUNCTION public.firm_create_with_admin(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_invite_create(UUID, TEXT, TEXT, TEXT, UUID, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_invite_accept(TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.firm_create_with_admin(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite_create(UUID, TEXT, TEXT, TEXT, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.staff_invite_accept(TEXT, UUID, TEXT) TO service_role;

COMMIT;
