CREATE OR REPLACE FUNCTION public.canonical_state_name(input_state TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT canonical_state FROM public.state_aliases WHERE alias = LOWER(BTRIM(input_state))),
        BTRIM(input_state)
    );
$$;

CREATE OR REPLACE FUNCTION public.normalize_county_name(input_county TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
    WITH input_value AS (SELECT LOWER(BTRIM(input_county)) AS county)
    SELECT COALESCE(
        (
            SELECT BTRIM(LEFT(input_value.county, CHAR_LENGTH(input_value.county) - CHAR_LENGTH(suffix)))
            FROM input_value
            JOIN public.county_suffixes ON input_value.county LIKE '%' || suffix
            ORDER BY CHAR_LENGTH(suffix) DESC
            LIMIT 1
        ),
        (SELECT county FROM input_value)
    );
$$;

REVOKE EXECUTE ON FUNCTION public.canonical_state_name(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_county_name(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_state_name(TEXT) TO service_role, resspark_api;
GRANT EXECUTE ON FUNCTION public.normalize_county_name(TEXT) TO service_role, resspark_api;
