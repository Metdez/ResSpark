-- Server-only database login used by the Vercel screening function.
-- Its password is managed as a deployment secret and is never committed.
DO $$
BEGIN
    CREATE ROLE resspark_api
        WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM resspark_api;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM resspark_api;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM resspark_api;

GRANT USAGE ON SCHEMA public TO resspark_api;
GRANT SELECT ON TABLE
    public.state_aliases,
    public.county_suffixes,
    public.housing_utilities_standards,
    public.msa_county_standards,
    public.state_region_standards,
    public.national_standards,
    public.health_care_standards,
    public.transportation_ownership_standards,
    public.transportation_operating_standards
TO resspark_api;
GRANT EXECUTE ON FUNCTION public.canonical_state_name(TEXT) TO resspark_api;
GRANT EXECUTE ON FUNCTION public.normalize_county_name(TEXT) TO resspark_api;

ALTER ROLE resspark_api SET statement_timeout = '15s';
ALTER ROLE resspark_api SET idle_in_transaction_session_timeout = '15s';
