-- 0002 platform foundation (Phase 1, PostgreSQL 17).
--
-- Data rules:
--   * additive only: the 15 baseline tables and the IRS standards rows are
--     never dropped, renamed, or retyped;
--   * the Worker (service_role) is the only reader and writer; anon and
--     authenticated get nothing;
--   * events is append-only: rows are inserted through log_event() and a
--     trigger rejects UPDATE and DELETE;
--   * NULL means unknown; an explicit value means known.
--
-- Every statement is re-runnable (IF NOT EXISTS / OR REPLACE / idempotent
-- REVOKE), so applying this file twice is safe.

BEGIN;

CREATE TABLE IF NOT EXISTS public.app_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.firms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.staff_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    role TEXT NOT NULL CHECK (role IN ('staff', 'admin')),
    display_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- id is the stable order (identity, monotonic); created_at is for display.
CREATE TABLE IF NOT EXISTS public.events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    case_id UUID REFERENCES public.cases(id),
    request_id UUID,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('staff', 'client', 'system', 'provider')),
    actor_id TEXT,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.client_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    request_id UUID,
    version INT NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Nullable on purpose (single firm today). Onboarding a second firm needs a
-- backfill and then firm_id NOT NULL.
ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id),
    ADD COLUMN IF NOT EXISTS logics_case_id BIGINT,
    ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS events_firm_created_idx ON public.events (firm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS events_case_id_idx ON public.events (case_id);
CREATE INDEX IF NOT EXISTS staff_profiles_firm_id_idx ON public.staff_profiles (firm_id);
CREATE INDEX IF NOT EXISTS client_links_request_id_idx ON public.client_links (request_id);

-- SECURITY INVOKER: the caller's own grants apply; only service_role can insert.
CREATE OR REPLACE FUNCTION public.log_event(
    p_firm_id UUID,
    p_case_id UUID,
    p_request_id UUID,
    p_actor_type TEXT,
    p_actor_id TEXT,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}'
)
RETURNS BIGINT
LANGUAGE SQL
SECURITY INVOKER
SET search_path = ''
AS $$
    INSERT INTO public.events (firm_id, case_id, request_id, actor_type, actor_id, action, payload)
    VALUES (p_firm_id, p_case_id, p_request_id, p_actor_type, p_actor_id, p_action, COALESCE(p_payload, '{}'::JSONB))
    RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.events_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'events is append-only';
END
$$;

DROP TRIGGER IF EXISTS events_append_only ON public.events;
CREATE TRIGGER events_append_only
    BEFORE UPDATE OR DELETE ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.events_append_only();

INSERT INTO public.firms (id, name, settings)
VALUES ('00000000-0000-0000-0000-000000000001', 'ValorTax', '{"logics": {"api_key_set": false}}')
ON CONFLICT (id) DO NOTHING;

-- Deny by default (RESEARCH F-6): pg_default_acl for postgres in public
-- granted anon/authenticated everything on NEW tables, sequences and functions.
-- Enable RLS on the new tables, revoke what exists, and change the defaults so
-- tables created by later migrations also start denied. No policies for
-- anon/authenticated (D-12).
ALTER TABLE public.app_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- Functions are executable by PUBLIC unless revoked; anon and authenticated inherit that.
REVOKE EXECUTE ON FUNCTION public.log_event(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.events_append_only() FROM PUBLIC, anon, authenticated;
-- With PUBLIC revoked, the Worker's role needs an explicit grant (trigger firing needs none).
GRANT EXECUTE ON FUNCTION public.log_event(UUID, UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;
