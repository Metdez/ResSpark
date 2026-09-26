-- V5 simple canonical data schema (PostgreSQL 14+).
--
-- Source of truth:
--   * one case_financial_data row is the current official data for a case;
--   * NULL means unknown; an explicit 0 means known to be zero;
--   * document_extractions are supporting evidence, never competing values.
--
-- This schema defines the current taxpayer questions and deterministic
-- screening inputs.

BEGIN;

CREATE TABLE cases (
    id UUID PRIMARY KEY,
    external_reference TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'intake'
        CHECK (status IN ('intake', 'awaiting_documents', 'information_needed', 'ready', 'ready_for_review', 'blocked', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- All 28 taxpayer-facing questions. canonical_column is the exact field in
-- case_financial_data where its current answer is stored.
CREATE TABLE question_definitions (
    question_id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    value_type TEXT NOT NULL CHECK (value_type IN ('bool', 'int', 'float', 'str')),
    canonical_column TEXT NOT NULL
);

INSERT INTO question_definitions (question_id, prompt, value_type, canonical_column) VALUES
('filing_status_married', 'Are you married?', 'bool', 'filing_status_married'),
('filing_joint_offer', 'If married, are you filing jointly with your spouse?', 'bool', 'filing_joint_offer'),
('state_of_residence', 'What state do you live in?', 'str', 'state_of_residence'),
('county_of_residence', 'What county do you live in?', 'str', 'county_of_residence'),
('household_size', 'How many people live in your household (incl. you)?', 'int', 'household_size'),
('dependents_count', 'How many dependents do you claim on your tax return?', 'int', 'dependents_count'),
('age_taxpayer', 'What is your age?', 'int', 'age_taxpayer'),
('age_spouse', 'What is your spouse''s age (if married)?', 'int', 'age_spouse'),
('owns_home', 'Do you own your home?', 'bool', 'owns_home'),
('rents_home', 'Do you rent your home?', 'bool', 'rents_home'),
('is_wage_earner', 'Do you receive a W-2 paycheck from an employer?', 'bool', 'is_wage_earner'),
('is_self_employed', 'Are you self-employed (Schedule C/E/F)?', 'bool', 'is_self_employed'),
('pay_frequency', 'How often are you paid? (weekly/biweekly/semimonthly/monthly)', 'str', 'pay_frequency'),
('vehicle_count', 'How many vehicles do you own or lease?', 'int', 'vehicle_count'),
('has_real_property', 'Do you own any real estate (home, rental, land)?', 'bool', 'has_real_property'),
('has_retirement_accounts', 'Do you have a 401(k), IRA, or other retirement account?', 'bool', 'has_retirement_accounts'),
('has_life_insurance_cash_value', 'Do you have life insurance with cash value?', 'bool', 'has_life_insurance_cash_value'),
('has_investment_accounts', 'Do you own stocks, bonds, or other investments?', 'bool', 'has_investment_accounts'),
('all_returns_filed', 'Have you filed all required tax returns?', 'bool', 'all_returns_filed'),
('in_open_bankruptcy', 'Are you currently in an open bankruptcy proceeding?', 'bool', 'in_open_bankruptcy'),
('filed_bankruptcy_past_7yrs', 'Have you filed bankruptcy in the past 7 years?', 'bool', 'filed_bankruptcy_past_7yrs'),
('in_litigation', 'Are you currently a party to a lawsuit?', 'bool', 'in_litigation'),
('prior_ia_or_oic_default', 'Have you defaulted on a prior IRS payment plan or offer?', 'bool', 'prior_ia_or_oic_default'),
('filed_and_paid_timely_last_5_years', 'For the last 5 tax years, did you file and pay the tax shown on time?', 'bool', 'filed_and_paid_timely_last_5_years'),
('installment_agreement_last_5_years', 'Have you had an income-tax installment agreement in the last 5 tax years?', 'bool', 'installment_agreement_last_5_years'),
('total_tax_owed', 'Total amount owed to the IRS (all years, incl. penalties/interest)?', 'float', 'total_tax_owed'),
('tax_only_balance', 'Income tax owed before penalties and interest?', 'float', 'tax_only_balance'),
('csed_months_remaining', 'Months remaining until the IRS collection statute expires (from transcript)?', 'int', 'csed_months_remaining');

-- The canonical record. It mirrors all FinancialData fields except that the
-- five questionnaire-only values (pay_frequency and the four has_* flags) are
-- added so every current taxpayer question has one official storage location.
CREATE TABLE case_financial_data (
    case_id UUID PRIMARY KEY REFERENCES cases(id) ON DELETE CASCADE,

    -- Household / profile (FinancialData)
    filing_status_married BOOLEAN,
    filing_joint_offer BOOLEAN,
    state_of_residence TEXT,
    county_of_residence TEXT,
    household_size INTEGER,
    dependents_count INTEGER,
    age_taxpayer INTEGER,
    age_spouse INTEGER,
    owns_home BOOLEAN,
    rents_home BOOLEAN,
    is_wage_earner BOOLEAN,
    is_self_employed BOOLEAN,
    vehicle_count INTEGER,

    -- Questionnaire-only fields that are upload/follow-up triggers
    pay_frequency TEXT,
    has_real_property BOOLEAN,
    has_retirement_accounts BOOLEAN,
    has_life_insurance_cash_value BOOLEAN,
    has_investment_accounts BOOLEAN,

    -- Section 7 Box D: monthly income
    gross_wages_taxpayer NUMERIC(14, 2),
    gross_wages_spouse NUMERIC(14, 2),
    social_security_income NUMERIC(14, 2),
    pension_income NUMERIC(14, 2),
    other_income NUMERIC(14, 2),
    interest_dividends_royalties NUMERIC(14, 2),
    distributions_income NUMERIC(14, 2),
    net_rental_income NUMERIC(14, 2),
    net_business_income NUMERIC(14, 2),
    child_support_received NUMERIC(14, 2),
    alimony_received NUMERIC(14, 2),

    -- Section 7 Box E: monthly expenses
    actual_housing_utilities NUMERIC(14, 2),
    actual_vehicle_loan_lease NUMERIC(14, 2),
    actual_vehicle_operating NUMERIC(14, 2),
    actual_public_transportation NUMERIC(14, 2),
    actual_health_insurance_premiums NUMERIC(14, 2),
    actual_court_ordered_payments NUMERIC(14, 2),
    actual_child_dependent_care NUMERIC(14, 2),
    actual_life_insurance_premiums NUMERIC(14, 2),
    actual_current_taxes NUMERIC(14, 2),
    actual_delinquent_state_local_tax NUMERIC(14, 2),
    actual_secured_debts_other NUMERIC(14, 2),

    -- Section 3: assets
    cash_and_bank_balances NUMERIC(14, 2),
    investment_accounts_net NUMERIC(14, 2),
    retirement_accounts_market_value NUMERIC(14, 2),
    retirement_accounts_loan_balance NUMERIC(14, 2),
    life_insurance_cash_value NUMERIC(14, 2),
    life_insurance_loan_balance NUMERIC(14, 2),
    real_property_market_value NUMERIC(14, 2),
    real_property_loan_balance NUMERIC(14, 2),
    vehicle_market_value_total NUMERIC(14, 2),
    vehicle_loan_balance_total NUMERIC(14, 2),
    vehicle_market_values JSONB,
    vehicle_loan_balances JSONB,
    other_valuable_assets_value NUMERIC(14, 2),
    other_valuable_assets_loan NUMERIC(14, 2),

    -- Section 9: compliance
    all_returns_filed BOOLEAN,
    in_open_bankruptcy BOOLEAN,
    filed_bankruptcy_past_7yrs BOOLEAN,
    in_litigation BOOLEAN,
    prior_ia_or_oic_default BOOLEAN,
    filed_and_paid_timely_last_5_years BOOLEAN,
    installment_agreement_last_5_years BOOLEAN,

    -- IRS liability
    total_tax_owed NUMERIC(14, 2),
    tax_only_balance NUMERIC(14, 2),
    csed_months_remaining INTEGER,
    oic_payment_months INTEGER,

    -- FinancialData review field
    ai_flags JSONB,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CHECK (household_size IS NULL OR household_size >= 1),
    CHECK (dependents_count IS NULL OR dependents_count >= 0),
    CHECK (vehicle_count IS NULL OR vehicle_count >= 0),
    CHECK (csed_months_remaining IS NULL OR csed_months_remaining >= 0),
    CHECK (oic_payment_months IS NULL OR oic_payment_months BETWEEN 1 AND 24),
    CHECK (vehicle_market_values IS NULL OR jsonb_typeof(vehicle_market_values) = 'array'),
    CHECK (vehicle_loan_balances IS NULL OR jsonb_typeof(vehicle_loan_balances) = 'array'),
    CHECK (ai_flags IS NULL OR jsonb_typeof(ai_flags) = 'array')
);

-- Dynamic IRS standards. Python reads these tables through
-- PostgresStandardsRepository; it contains no standard amounts or location maps.
CREATE TABLE state_aliases (
    alias TEXT PRIMARY KEY,
    canonical_state TEXT NOT NULL
);

CREATE TABLE county_suffixes (
    suffix TEXT PRIMARY KEY
);

CREATE FUNCTION canonical_state_name(input_state TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(
        (SELECT canonical_state FROM state_aliases WHERE alias = LOWER(BTRIM(input_state))),
        BTRIM(input_state)
    );
$$;

CREATE FUNCTION normalize_county_name(input_county TEXT)
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
    WITH input_value AS (SELECT LOWER(BTRIM(input_county)) AS county)
    SELECT COALESCE(
        (
            SELECT BTRIM(LEFT(input_value.county, CHAR_LENGTH(input_value.county) - CHAR_LENGTH(suffix)))
            FROM input_value
            JOIN county_suffixes ON input_value.county LIKE '%' || suffix
            ORDER BY CHAR_LENGTH(suffix) DESC
            LIMIT 1
        ),
        (SELECT county FROM input_value)
    );
$$;

CREATE TABLE housing_utilities_standards (
    source_row INTEGER NOT NULL CHECK (source_row > 0),
    state TEXT NOT NULL,
    county TEXT NOT NULL,
    normalized_county TEXT NOT NULL,
    household_size SMALLINT NOT NULL CHECK (household_size >= 1),
    monthly_amount NUMERIC(14, 2) NOT NULL CHECK (monthly_amount >= 0),
    PRIMARY KEY (source_row, household_size)
);

CREATE INDEX housing_utilities_lookup_idx
    ON housing_utilities_standards (state, normalized_county, household_size, source_row);

CREATE TABLE msa_county_standards (
    source_row INTEGER PRIMARY KEY CHECK (source_row > 0),
    state TEXT NOT NULL,
    county TEXT NOT NULL,
    normalized_county TEXT NOT NULL,
    area TEXT NOT NULL
);

CREATE INDEX msa_county_lookup_idx
    ON msa_county_standards (state, normalized_county, source_row);

CREATE TABLE state_region_standards (
    state TEXT PRIMARY KEY,
    region TEXT NOT NULL
);

CREATE TABLE national_standards (
    household_size SMALLINT PRIMARY KEY CHECK (household_size >= 1),
    monthly_amount NUMERIC(14, 2) NOT NULL CHECK (monthly_amount >= 0),
    additional_person_amount NUMERIC(14, 2) NOT NULL DEFAULT 0
        CHECK (additional_person_amount >= 0)
);

CREATE TABLE health_care_standards (
    minimum_age SMALLINT PRIMARY KEY CHECK (minimum_age >= 0),
    maximum_age SMALLINT CHECK (maximum_age IS NULL OR maximum_age >= minimum_age),
    monthly_amount NUMERIC(14, 2) NOT NULL CHECK (monthly_amount >= 0)
);

CREATE TABLE transportation_ownership_standards (
    vehicle_count SMALLINT PRIMARY KEY CHECK (vehicle_count >= 0),
    monthly_amount NUMERIC(14, 2) NOT NULL CHECK (monthly_amount >= 0)
);

CREATE TABLE transportation_operating_standards (
    area TEXT NOT NULL,
    vehicle_count SMALLINT NOT NULL CHECK (vehicle_count >= 0),
    monthly_amount NUMERIC(14, 2) NOT NULL CHECK (monthly_amount >= 0),
    PRIMARY KEY (area, vehicle_count)
);

-- Files and raw AI extraction are supporting evidence. A value affects screening only
-- after it has been saved into case_financial_data above.
CREATE TABLE documents (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    document_type TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    analysis_status TEXT NOT NULL DEFAULT 'uploaded'
        CHECK (analysis_status IN ('uploaded', 'processing', 'complete', 'needs_review', 'failed'))
);

CREATE TABLE document_extractions (
    id UUID PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    canonical_column TEXT NOT NULL,
    extracted_value JSONB NOT NULL,
    confidence NUMERIC(4, 3) CHECK (confidence BETWEEN 0 AND 1),
    page_reference TEXT,
    accepted_into_canonical_data BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A decision run is immutable and records exactly what screening returned.
CREATE TABLE determination_runs (
    id UUID PRIMARY KEY,
    case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('information_needed', 'ready', 'ready_for_review', 'blocked')),
    path TEXT,
    reason TEXT,
    monthly_income NUMERIC(14, 2),
    monthly_expenses NUMERIC(14, 2),
    net_disposable_income NUMERIC(14, 2),
    net_realizable_equity NUMERIC(14, 2),
    suggested_offer_or_payment NUMERIC(14, 2),
    needs_manual_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_notes JSONB,
    financial_data_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX documents_case_id_idx ON documents(case_id);
CREATE INDEX document_extractions_document_id_idx ON document_extractions(document_id);
CREATE INDEX determination_runs_case_id_idx ON determination_runs(case_id, created_at DESC);

COMMIT;
