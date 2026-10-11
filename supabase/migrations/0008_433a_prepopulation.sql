-- 0008_433a_prepopulation: Phase 7 schema (433-A pre-population).
--
-- Additive and backward compatible with the deployed Worker. Standards amounts are
-- untouched; the only standards-data statement is the names-only Connecticut fix.
-- financial_value_decide is the only writer of case_financial_data (D-06).
-- Every statement is re-runnable.
BEGIN;

-- (a) Columns ---------------------------------------------------------------
ALTER TABLE public.cases
    ADD COLUMN IF NOT EXISTS financials_settings JSONB NOT NULL DEFAULT '{}'
        CHECK (jsonb_typeof(financials_settings) = 'object');
ALTER TABLE public.bank_accounts
    ADD COLUMN IF NOT EXISTS balance_current NUMERIC(14, 2), ADD COLUMN IF NOT EXISTS balance_available NUMERIC(14, 2),
    ADD COLUMN IF NOT EXISTS balance_as_of TIMESTAMPTZ;
-- D-15: a run records its inputs and engine version.
ALTER TABLE public.determination_runs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.determination_runs
    ADD COLUMN IF NOT EXISTS firm_id UUID REFERENCES public.firms(id),
    ADD COLUMN IF NOT EXISTS created_by UUID,
    ADD COLUMN IF NOT EXISTS allowable_breakdown JSONB,
    ADD COLUMN IF NOT EXISTS nre_lines JSONB,
    ADD COLUMN IF NOT EXISTS standards_inputs JSONB,
    ADD COLUMN IF NOT EXISTS standards_effective_date DATE,
    ADD COLUMN IF NOT EXISTS engine_version TEXT;

-- (b) Tables ----------------------------------------------------------------
-- D-05: the evidence trail behind every confirmed 433-A value.
CREATE TABLE IF NOT EXISTS public.financial_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id UUID NOT NULL REFERENCES public.firms(id),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    canonical_column TEXT NOT NULL,
    proposed_value JSONB NOT NULL CHECK (jsonb_typeof(proposed_value) <> 'null'),
    source TEXT NOT NULL CHECK (source IN ('truv','plaid','intake','logics','address','document','staff')),
    source_refs JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(source_refs) = 'array'),
    method TEXT NOT NULL,
    window_start DATE, window_end DATE,
    reliability TEXT NOT NULL CHECK (reliability IN ('A','B','C')),
    status TEXT NOT NULL DEFAULT 'proposed'
        CHECK (status IN ('proposed','accepted','edited','rejected','superseded')),
    decided_value JSONB, decision_note TEXT, decided_by UUID, decided_at TIMESTAMPTZ,
    generator_version TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS financial_proposals_one_proposed
    ON public.financial_proposals (case_id, canonical_column, source) WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS financial_proposals_case_column
    ON public.financial_proposals (case_id, canonical_column, created_at DESC);

CREATE TABLE IF NOT EXISTS public.plaid_category_map (
    pfc_detailed TEXT PRIMARY KEY,
    pfc_primary TEXT NOT NULL,
    taxonomy_version TEXT NOT NULL CHECK (taxonomy_version IN ('v2','v1')),
    treatment TEXT NOT NULL CHECK (treatment IN ('income','expense','exclude','informational')),
    canonical_column TEXT, form_line TEXT, reliability TEXT CHECK (reliability IN ('A','B','C')), note TEXT,
    CHECK (treatment NOT IN ('income','expense') OR canonical_column IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.truv_deduction_map (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    truv_category TEXT NOT NULL,
    name_pattern TEXT NOT NULL DEFAULT '%',
    priority INT NOT NULL,
    treatment TEXT NOT NULL CHECK (treatment IN ('expense','informational')),
    canonical_column TEXT, form_line TEXT, reliability TEXT CHECK (reliability IN ('A','B','C')), note TEXT,
    UNIQUE (truv_category, name_pattern)
);

-- county NULL = a known FIPS with no IRS row (old Connecticut counties): "Needs data".
CREATE TABLE IF NOT EXISTS public.county_fips_map (
    county_fips TEXT PRIMARY KEY CHECK (county_fips ~ '^[0-9]{5}$'),
    state TEXT NOT NULL,
    county TEXT, normalized_county TEXT, note TEXT
);

CREATE TABLE IF NOT EXISTS public.standards_versions (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    effective_date DATE NOT NULL, source_url TEXT NOT NULL, checked_on DATE NOT NULL, note TEXT
);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['financial_proposals','plaid_category_map','truv_deduction_map','county_fips_map',
                             'standards_versions'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    END LOOP;
END
$$;

-- (c) Column whitelist and value checks (T-07-04) ---------------------------
-- data_type of a writable case_financial_data column; NULL for anything else.
CREATE OR REPLACE FUNCTION public.financial_column_type(p_column TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT c.data_type::TEXT FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'case_financial_data'
      AND c.column_name = p_column AND c.column_name NOT IN ('case_id', 'updated_at', 'ai_flags')
$$;

CREATE OR REPLACE FUNCTION public.financial_value_check(p_column TEXT, p_value JSONB)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_type TEXT := public.financial_column_type(p_column); n NUMERIC;
BEGIN
    IF v_type IS NULL THEN RAISE EXCEPTION 'bad_column'; END IF;
    IF p_value IS NULL OR jsonb_typeof(p_value) = 'null' THEN RAISE EXCEPTION 'bad_value'; END IF;
    IF v_type = 'boolean' THEN
        IF jsonb_typeof(p_value) <> 'boolean' THEN RAISE EXCEPTION 'bad_value'; END IF;
    ELSIF v_type = 'integer' THEN
        IF jsonb_typeof(p_value) <> 'number' THEN RAISE EXCEPTION 'bad_value'; END IF;
        n := p_value::NUMERIC;
        IF n <> trunc(n) OR abs(n) >= 2147483648 THEN RAISE EXCEPTION 'bad_value'; END IF;
    ELSIF v_type = 'numeric' THEN
        IF jsonb_typeof(p_value) <> 'number' THEN RAISE EXCEPTION 'bad_value'; END IF;
        n := p_value::NUMERIC;
        IF n <> round(n, 2) OR abs(n) >= 1e12 THEN RAISE EXCEPTION 'bad_value'; END IF;
    ELSIF v_type = 'text' THEN
        IF jsonb_typeof(p_value) <> 'string' OR length(p_value #>> '{}') > 200 THEN RAISE EXCEPTION 'bad_value'; END IF;
    ELSIF v_type = 'jsonb' THEN
        -- The two per-vehicle lists: up to 20 non-negative amounts with cents.
        IF jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 20 THEN RAISE EXCEPTION 'bad_value'; END IF;
        IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_value) AS e(x)
                   WHERE CASE WHEN jsonb_typeof(x) <> 'number' THEN true
                              ELSE x::NUMERIC < 0 OR x::NUMERIC <> round(x::NUMERIC, 2) OR x::NUMERIC >= 1e12 END) THEN
            RAISE EXCEPTION 'bad_value'; END IF;
    ELSE RAISE EXCEPTION 'bad_value';
    END IF;
END
$$;

-- (d) The one write path into case_financial_data (D-06, open question 2) ----
CREATE OR REPLACE FUNCTION public.financial_value_decide(
    p_firm_id UUID, p_case_id UUID, p_column TEXT, p_action TEXT, p_value JSONB,
    p_proposal_id UUID, p_note TEXT, p_actor_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    v_type TEXT; v JSONB; pr public.financial_proposals; v_pid UUID; v_source TEXT; v_total TEXT; v_derived TEXT;
    v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
    v_input JSONB := NULLIF(p_value, 'null'::JSONB);
BEGIN
    PERFORM 1 FROM public.cases WHERE id = p_case_id AND firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
    IF p_action IS NULL OR p_action NOT IN ('accept','edit','known_zero','not_applicable','unknown','reject')
        THEN RAISE EXCEPTION 'bad_action'; END IF;
    v_type := public.financial_column_type(p_column);
    IF v_type IS NULL THEN RAISE EXCEPTION 'bad_column'; END IF;
    IF p_action IN ('edit','not_applicable') AND v_note IS NULL THEN RAISE EXCEPTION 'note_required'; END IF;
    IF p_action IN ('accept','reject') AND p_proposal_id IS NULL THEN RAISE EXCEPTION 'proposal_stale'; END IF;
    IF p_proposal_id IS NOT NULL AND p_action IN ('accept','reject','edit') THEN
        SELECT * INTO pr FROM public.financial_proposals
        WHERE id = p_proposal_id AND case_id = p_case_id AND canonical_column = p_column AND status = 'proposed'
        FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'proposal_stale'; END IF;
    END IF;
    v := CASE p_action
        WHEN 'accept' THEN pr.proposed_value
        WHEN 'edit' THEN v_input
        WHEN 'known_zero' THEN '0'::JSONB
        WHEN 'not_applicable' THEN COALESCE(v_input, CASE v_type
            WHEN 'boolean' THEN 'false' WHEN 'text' THEN '"not_applicable"' WHEN 'jsonb' THEN '[]' ELSE '0' END::JSONB)
        ELSE NULL END;
    IF p_action NOT IN ('unknown','reject') THEN
        PERFORM public.financial_value_check(p_column, v);
    END IF;
    IF p_action <> 'reject' THEN
        INSERT INTO public.case_financial_data (case_id) VALUES (p_case_id) ON CONFLICT (case_id) DO NOTHING;
        -- %I plus jsonb_populate_record: the column is whitelisted and the value typed by the table.
        EXECUTE format('UPDATE public.case_financial_data SET %I = ($1).%I, updated_at = now() WHERE case_id = $2', p_column, p_column)
            USING jsonb_populate_record(NULL::public.case_financial_data, jsonb_build_object(p_column, v)), p_case_id;
        IF p_column IN ('vehicle_market_values','vehicle_loan_balances') THEN
            v_total := CASE p_column WHEN 'vehicle_market_values' THEN 'vehicle_market_value_total'
                                     ELSE 'vehicle_loan_balance_total' END;
            EXECUTE format('UPDATE public.case_financial_data SET %I = CASE WHEN $1 IS NULL THEN NULL ELSE '
                           'COALESCE((SELECT sum(e.x::NUMERIC) FROM jsonb_array_elements_text($1) AS e(x)), 0) END '
                           'WHERE case_id = $2', v_total)
                USING v, p_case_id;
            v_derived := 'per_vehicle_list';
        END IF;
    END IF;
    IF pr.id IS NOT NULL THEN
        UPDATE public.financial_proposals SET
            status = CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'edit' THEN 'edited' ELSE 'rejected' END,
            decided_value = CASE WHEN p_action = 'reject' THEN NULL ELSE v END,
            decision_note = v_note, decided_by = p_actor_id, decided_at = now()
        WHERE id = pr.id;
        v_pid := pr.id; v_source := pr.source;
    ELSIF v IS NOT NULL THEN
        -- No proposal: staff entered the value, so it leaves its own evidence row (T-07-08).
        -- `unknown` writes NULL and is recorded by the event only (proposed_value cannot be null).
        INSERT INTO public.financial_proposals
            (firm_id, case_id, canonical_column, proposed_value, source, method, reliability, status,
             decided_value, decision_note, decided_by, decided_at, generator_version)
        VALUES (p_firm_id, p_case_id, p_column, v, 'staff', 'staff_' || p_action, 'A',
             CASE p_action WHEN 'edit' THEN 'edited' ELSE 'accepted' END, v, v_note, p_actor_id, now(), 'staff')
        RETURNING id INTO v_pid;
        v_source := 'staff';
    END IF;
    -- D-20: the event names the column, never the value.
    PERFORM public.log_event(p_firm_id, p_case_id, NULL, 'staff', p_actor_id::TEXT, 'financial.value_' || p_action,
        jsonb_strip_nulls(jsonb_build_object('column', p_column, 'proposal_id', v_pid, 'source', v_source,
            'derived_from', v_derived)));
    RETURN jsonb_build_object('column', p_column, 'action', p_action, 'proposal_id', v_pid);
END
$$;

-- (e) Generators write proposals, never case values (D-05, D-07) -------------
CREATE OR REPLACE FUNCTION public.financial_proposals_upsert(
    p_firm_id UUID, p_case_id UUID, p_source TEXT, p_generator_version TEXT, p_proposals JSONB,
    p_scope_columns TEXT[] DEFAULT NULL, p_actor_type TEXT DEFAULT 'system', p_actor_id TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    e JSONB; v_col TEXT; v_val JSONB; v_method TEXT; v_rel TEXT; v_refs JSONB; cur public.financial_proposals;
    v_cols TEXT[] := '{}'; v_ins INT := 0; v_kept INT := 0; v_sup INT := 0; v_n INT;
BEGIN
    -- The per-case lock serializes concurrent runs, so the partial unique index never raises 23505.
    PERFORM 1 FROM public.cases WHERE id = p_case_id AND firm_id = p_firm_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'case_not_found'; END IF;
    IF p_source IS NULL OR p_source NOT IN ('truv','plaid','intake','logics','address','document') THEN
        RAISE EXCEPTION 'bad_source';
    END IF;
    IF p_proposals IS NULL OR jsonb_typeof(p_proposals) <> 'array'
       OR NULLIF(btrim(COALESCE(p_generator_version, '')), '') IS NULL THEN
        RAISE EXCEPTION 'bad_value';
    END IF;
    FOR e IN SELECT value FROM jsonb_array_elements(p_proposals) LOOP
        v_col := e->>'canonical_column';
        v_val := e->'proposed_value';
        v_method := NULLIF(btrim(COALESCE(e->>'method', '')), '');
        v_rel := e->>'reliability';
        v_refs := COALESCE(e->'source_refs', '[]'::JSONB);
        IF public.financial_column_type(v_col) IS NULL THEN RAISE EXCEPTION 'bad_column'; END IF;
        IF v_col = ANY (v_cols) THEN RAISE EXCEPTION 'bad_value'; END IF;
        v_cols := v_cols || v_col;
        PERFORM public.financial_value_check(v_col, v_val);
        IF v_method IS NULL OR v_rel IS NULL OR v_rel NOT IN ('A','B','C') OR jsonb_typeof(v_refs) <> 'array' THEN
            RAISE EXCEPTION 'bad_value';
        END IF;
        SELECT * INTO cur FROM public.financial_proposals
        WHERE case_id = p_case_id AND canonical_column = v_col AND source = p_source AND status = 'proposed';
        IF FOUND AND cur.proposed_value = v_val AND cur.method = v_method THEN
            v_kept := v_kept + 1;
            CONTINUE;
        END IF;
        IF FOUND THEN
            UPDATE public.financial_proposals SET status = 'superseded' WHERE id = cur.id;
            v_sup := v_sup + 1;
        END IF;
        -- Staff already decided this exact value from this source: do not ask again.
        IF EXISTS (SELECT 1 FROM (
                SELECT fp.proposed_value, fp.method FROM public.financial_proposals fp
                WHERE fp.case_id = p_case_id AND fp.canonical_column = v_col AND fp.source = p_source
                  AND fp.status IN ('accepted','edited')
                ORDER BY fp.decided_at DESC NULLS LAST, fp.created_at DESC LIMIT 1) last
            WHERE last.proposed_value = v_val AND last.method = v_method) THEN
            v_kept := v_kept + 1;
            CONTINUE;
        END IF;
        INSERT INTO public.financial_proposals
            (firm_id, case_id, canonical_column, proposed_value, source, source_refs, method,
             window_start, window_end, reliability, generator_version)
        VALUES (p_firm_id, p_case_id, v_col, v_val, p_source, v_refs, v_method,
             (e->>'window_start')::DATE, (e->>'window_end')::DATE, v_rel, p_generator_version);
        v_ins := v_ins + 1;
    END LOOP;
    UPDATE public.financial_proposals SET status = 'superseded'
    WHERE case_id = p_case_id AND source = p_source AND status = 'proposed'
      AND NOT (canonical_column = ANY (v_cols))
      AND (p_scope_columns IS NULL OR canonical_column = ANY (p_scope_columns));
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_sup := v_sup + v_n;
    IF v_ins + v_sup > 0 THEN
        PERFORM public.log_event(p_firm_id, p_case_id, NULL, COALESCE(p_actor_type, 'system'), p_actor_id,
            'financials.proposals_updated',
            jsonb_build_object('source', p_source, 'inserted', v_ins, 'kept', v_kept, 'superseded', v_sup));
    END IF;
    RETURN jsonb_build_object('inserted', v_ins, 'kept', v_kept, 'superseded', v_sup);
END
$$;

-- (f) Standards lookups: the src/standards_repository.py queries, NULL instead of raising (D-11).
CREATE OR REPLACE FUNCTION public.standards_national_amount(p_household_size INT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH requested AS (SELECT GREATEST(p_household_size, 1) AS household_size)
    SELECT standard.monthly_amount
           + GREATEST(requested.household_size - standard.household_size, 0) * standard.additional_person_amount
    FROM public.national_standards AS standard CROSS JOIN requested
    WHERE standard.household_size <= requested.household_size
    ORDER BY standard.household_size DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.standards_health_care_amount(p_age INT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT monthly_amount FROM public.health_care_standards
    WHERE minimum_age <= p_age AND (maximum_age IS NULL OR maximum_age >= p_age)
    ORDER BY minimum_age DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.standards_transportation_area(p_state TEXT, p_county TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT COALESCE(
        (SELECT area FROM public.msa_county_standards
         WHERE state = public.canonical_state_name(p_state)
           AND normalized_county = public.normalize_county_name(p_county)
         ORDER BY source_row LIMIT 1),
        (SELECT region FROM public.state_region_standards WHERE state = public.canonical_state_name(p_state)))
$$;

CREATE OR REPLACE FUNCTION public.standards_transportation_ownership_amount(p_vehicle_count INT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT monthly_amount FROM public.transportation_ownership_standards
    WHERE vehicle_count = LEAST(GREATEST(p_vehicle_count, 0),
        (SELECT MAX(vehicle_count) FROM public.transportation_ownership_standards))
$$;

CREATE OR REPLACE FUNCTION public.standards_transportation_operating_amount(p_area TEXT, p_vehicle_count INT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    SELECT monthly_amount FROM public.transportation_operating_standards
    WHERE area = p_area AND vehicle_count = LEAST(GREATEST(p_vehicle_count, 0),
        (SELECT MAX(vehicle_count) FROM public.transportation_operating_standards))
$$;

CREATE OR REPLACE FUNCTION public.standards_housing_amount(p_state TEXT, p_county TEXT, p_household_size INT)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH requested AS (SELECT GREATEST(p_household_size, 1) AS household_size)
    SELECT standard.monthly_amount
    FROM public.housing_utilities_standards AS standard CROSS JOIN requested
    WHERE standard.state = public.canonical_state_name(p_state)
      AND standard.normalized_county = public.normalize_county_name(p_county)
    ORDER BY CASE WHEN standard.household_size <= requested.household_size THEN 0 ELSE 1 END,
             standard.household_size DESC, standard.source_row ASC
    LIMIT 1
$$;

-- D-11: with 0 vehicles there is no area and operating is the seeded zero-vehicle amount.
CREATE OR REPLACE FUNCTION public.standards_bundle(p_state TEXT, p_county TEXT, p_household_size INT, p_vehicle_count INT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
    WITH a AS (
        SELECT CASE WHEN p_vehicle_count <> 0 THEN public.standards_transportation_area(p_state, p_county) ELSE '' END AS area
    )
    SELECT jsonb_build_object(
        'state', p_state, 'county', p_county, 'household_size', p_household_size, 'vehicle_count', p_vehicle_count,
        'national', public.standards_national_amount(p_household_size),
        'health_under_65', public.standards_health_care_amount(30),
        'health_65_plus', public.standards_health_care_amount(65),
        'transportation_area', a.area,
        'ownership', public.standards_transportation_ownership_amount(p_vehicle_count),
        'operating', CASE WHEN p_vehicle_count <> 0
            THEN public.standards_transportation_operating_amount(a.area, p_vehicle_count)
            ELSE (SELECT o.monthly_amount FROM public.transportation_operating_standards o
                  WHERE o.vehicle_count = 0 ORDER BY o.area LIMIT 1) END,
        'housing', public.standards_housing_amount(p_state, p_county, p_household_size))
    FROM a
$$;

-- (g) Monthly bank totals per mapped 433-A column (D-09) --------------------
CREATE OR REPLACE FUNCTION public.financial_bank_monthly(p_firm_id UUID, p_case_id UUID, p_window_start DATE, p_window_end DATE)
RETURNS TABLE (canonical_column TEXT, treatment TEXT, form_line TEXT, reliability TEXT, month DATE,
               amount_cents BIGINT, txn_count INT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
    -- Plaid: negative amount = money in. Inflow columns count -amount, all others amount.
    SELECT m.canonical_column, m.treatment, m.form_line, m.reliability, date_trunc('month', t.date)::DATE,
           round(sum(CASE WHEN m.treatment = 'income' OR (m.treatment = 'informational' AND m.pfc_primary = 'INCOME')
                          THEN -t.amount ELSE t.amount END) * 100)::BIGINT,
           count(*)::INT
    FROM public.bank_transactions t
    JOIN public.connections c ON c.id = t.connection_id
    JOIN public.plaid_category_map m ON m.pfc_detailed = t.category_detailed
    WHERE c.case_id = p_case_id AND c.firm_id = p_firm_id AND c.kind = 'bank' AND c.status <> 'removed'
      AND NOT t.pending AND t.date BETWEEN p_window_start AND p_window_end
      AND m.canonical_column IS NOT NULL AND m.treatment IN ('income','expense','informational')
      AND CASE WHEN m.treatment = 'income' OR (m.treatment = 'informational' AND m.pfc_primary = 'INCOME')
               THEN t.amount < 0 ELSE t.amount > 0 END
    GROUP BY 1, 2, 3, 4, 5
$$;

-- (h) Client submits the intake item (RESEARCH Open Question 4) -------------
CREATE OR REPLACE FUNCTION public.intake_submit(p_item_id UUID, p_request_id UUID, p_link_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    i RECORD;
BEGIN
    SELECT ri.id, ri.status, r.id AS request_id, r.firm_id, r.case_id, r.status AS request_status INTO i
    FROM public.request_items ri JOIN public.requests r ON r.id = ri.request_id
    WHERE ri.id = p_item_id AND ri.request_id = p_request_id AND ri.kind = 'intake'
    FOR UPDATE OF ri;
    IF NOT FOUND THEN RAISE EXCEPTION 'item_not_found'; END IF;
    IF i.status IN ('submitted','approved') THEN
        RETURN jsonb_build_object('item_status', i.status, 'request_status', i.request_status, 'already', true);
    END IF;
    UPDATE public.request_items SET status = 'submitted', rejection_note = NULL WHERE id = i.id;
    PERFORM public.log_event(i.firm_id, i.case_id, i.request_id, 'client', p_link_id::TEXT, 'intake.submitted',
        jsonb_build_object('request_item_id', i.id));
    RETURN jsonb_build_object('item_status', 'submitted', 'request_status', public.request_apply_status(i.request_id));
END
$$;

-- (i) Phase 5 push batch, body copied from 0006 with one change (D-16, open question 3):
-- a generated worksheet_433a with no request item is pushable when it belongs to the request's case.
CREATE OR REPLACE FUNCTION public.logics_push_create_batch(
    p_firm_id UUID, p_request_id UUID, p_actor_id UUID, p_agent_display_name TEXT, p_mode TEXT,
    p_file_category_id INT, p_activity_type TEXT, p_items JSONB, p_push_again UUID[]
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    r RECORD; it JSONB; v_batch_id UUID; v_doc_id UUID; v_fp TEXT; v_push_id UUID; v_ids JSONB := '[]'::JSONB;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'no_items'; END IF;
    SELECT req.id, req.case_id, c.logics_case_id INTO r
    FROM public.requests req JOIN public.cases c ON c.id = req.case_id
    WHERE req.id = p_request_id AND req.firm_id = p_firm_id
    FOR UPDATE OF req;
    IF NOT FOUND OR r.logics_case_id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
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
        FROM public.documents d LEFT JOIN public.request_items ri ON ri.id = d.request_item_id
        WHERE d.id = v_doc_id AND d.status = 'ready' AND d.size_bytes > 0 AND d.sha256 IS NOT NULL
          AND ((ri.request_id = r.id AND ri.status = 'approved')
               OR (d.document_type = 'worksheet_433a' AND d.request_item_id IS NULL AND d.case_id = r.case_id));
        IF NOT FOUND OR COALESCE(v_fp, '') = '' THEN RAISE EXCEPTION 'not_pushable'; END IF;
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

-- (j) Connecticut names only (open question 1). Source: IRS Local Standards: Housing and Utilities,
-- https://www.irs.gov/businesses/small-businesses-self-employed/local-standards-housing-and-utilities
-- (effective 2026-06-29), Census planning regions 09130/09150/09170/09180 (Federal Register 2022-12063).
-- Verified by household-1 amount: 312=2388, 314=2026, 316=2359, 317=2157. Amounts unchanged.
UPDATE public.housing_utilities_standards SET county = v.name, normalized_county = public.normalize_county_name(v.name)
FROM (VALUES (312, 'Lower Connecticut River Valley Planning Region'),
             (314, 'Northeastern Connecticut Planning Region'),
             (316, 'South Central Connecticut Planning Region'),
             (317, 'Southeastern Connecticut Planning Region')) AS v(source_row, name)
WHERE housing_utilities_standards.state = 'Connecticut'
  AND housing_utilities_standards.source_row = v.source_row
  AND housing_utilities_standards.county IN ('Planning Region', 'Region');

-- (k) Template intake item and the standards version row --------------------
UPDATE public.request_templates
SET items = items || '[{"kind":"intake","label":"Answer a few questions","required":true,"config":{}}]'::JSONB
WHERE id = '00000000-0000-0000-0000-00000000a001' AND NOT items @> '[{"kind":"intake"}]'::JSONB;

INSERT INTO public.standards_versions (id, effective_date, source_url, checked_on, note)
VALUES (1, DATE '2026-06-29',
        'https://www.irs.gov/businesses/small-businesses-self-employed/collection-financial-standards',
        DATE '2026-10-11', 'IRS Collection Financial Standards effective 2026-06-29')
ON CONFLICT (id) DO NOTHING;

-- (l) Revoking PUBLIC also removes the Worker's implicit grant, so service_role gets an explicit one (0002).
-- Each function is listed in full as FROM PUBLIC, anon, authenticated / TO service_role below.
DO $$
DECLARE f TEXT;
BEGIN
    FOREACH f IN ARRAY ARRAY['financial_column_type(TEXT)', 'financial_value_check(TEXT, JSONB)',
        'financial_value_decide(UUID, UUID, TEXT, TEXT, JSONB, UUID, TEXT, UUID)',
        'financial_proposals_upsert(UUID, UUID, TEXT, TEXT, JSONB, TEXT[], TEXT, TEXT)',
        'standards_national_amount(INT)', 'standards_health_care_amount(INT)', 'standards_transportation_area(TEXT, TEXT)',
        'standards_transportation_ownership_amount(INT)', 'standards_transportation_operating_amount(TEXT, INT)',
        'standards_housing_amount(TEXT, TEXT, INT)', 'standards_bundle(TEXT, TEXT, INT, INT)',
        'financial_bank_monthly(UUID, UUID, DATE, DATE)', 'intake_submit(UUID, UUID, UUID)',
        'logics_push_create_batch(UUID, UUID, UUID, TEXT, TEXT, INT, TEXT, JSONB, UUID[])'] LOOP
        EXECUTE 'REVOKE EXECUTE ON FUNCTION public.' || f || ' FROM PUBLIC, anon, authenticated';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || f || ' TO service_role';
    END LOOP;
END
$$;

COMMIT;