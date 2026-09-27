


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."canonical_state_name"("input_state" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
    SELECT COALESCE(
        (SELECT canonical_state FROM state_aliases WHERE alias = LOWER(BTRIM(input_state))),
        BTRIM(input_state)
    );
$$;


ALTER FUNCTION "public"."canonical_state_name"("input_state" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_county_name"("input_county" "text") RETURNS "text"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
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


ALTER FUNCTION "public"."normalize_county_name"("input_county" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."case_financial_data" (
    "case_id" "uuid" NOT NULL,
    "filing_status_married" boolean,
    "filing_joint_offer" boolean,
    "state_of_residence" "text",
    "county_of_residence" "text",
    "household_size" integer,
    "dependents_count" integer,
    "age_taxpayer" integer,
    "age_spouse" integer,
    "owns_home" boolean,
    "rents_home" boolean,
    "is_wage_earner" boolean,
    "is_self_employed" boolean,
    "vehicle_count" integer,
    "pay_frequency" "text",
    "has_real_property" boolean,
    "has_retirement_accounts" boolean,
    "has_life_insurance_cash_value" boolean,
    "has_investment_accounts" boolean,
    "gross_wages_taxpayer" numeric(14,2),
    "gross_wages_spouse" numeric(14,2),
    "social_security_income" numeric(14,2),
    "pension_income" numeric(14,2),
    "other_income" numeric(14,2),
    "interest_dividends_royalties" numeric(14,2),
    "distributions_income" numeric(14,2),
    "net_rental_income" numeric(14,2),
    "net_business_income" numeric(14,2),
    "child_support_received" numeric(14,2),
    "alimony_received" numeric(14,2),
    "actual_housing_utilities" numeric(14,2),
    "actual_vehicle_loan_lease" numeric(14,2),
    "actual_vehicle_operating" numeric(14,2),
    "actual_public_transportation" numeric(14,2),
    "actual_health_insurance_premiums" numeric(14,2),
    "actual_court_ordered_payments" numeric(14,2),
    "actual_child_dependent_care" numeric(14,2),
    "actual_life_insurance_premiums" numeric(14,2),
    "actual_current_taxes" numeric(14,2),
    "actual_delinquent_state_local_tax" numeric(14,2),
    "actual_secured_debts_other" numeric(14,2),
    "cash_and_bank_balances" numeric(14,2),
    "investment_accounts_net" numeric(14,2),
    "retirement_accounts_market_value" numeric(14,2),
    "retirement_accounts_loan_balance" numeric(14,2),
    "life_insurance_cash_value" numeric(14,2),
    "life_insurance_loan_balance" numeric(14,2),
    "real_property_market_value" numeric(14,2),
    "real_property_loan_balance" numeric(14,2),
    "vehicle_market_value_total" numeric(14,2),
    "vehicle_loan_balance_total" numeric(14,2),
    "vehicle_market_values" "jsonb",
    "vehicle_loan_balances" "jsonb",
    "other_valuable_assets_value" numeric(14,2),
    "other_valuable_assets_loan" numeric(14,2),
    "all_returns_filed" boolean,
    "in_open_bankruptcy" boolean,
    "filed_bankruptcy_past_7yrs" boolean,
    "in_litigation" boolean,
    "prior_ia_or_oic_default" boolean,
    "filed_and_paid_timely_last_5_years" boolean,
    "installment_agreement_last_5_years" boolean,
    "total_tax_owed" numeric(14,2),
    "tax_only_balance" numeric(14,2),
    "csed_months_remaining" integer,
    "oic_payment_months" integer,
    "ai_flags" "jsonb",
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "case_financial_data_ai_flags_check" CHECK ((("ai_flags" IS NULL) OR ("jsonb_typeof"("ai_flags") = 'array'::"text"))),
    CONSTRAINT "case_financial_data_csed_months_remaining_check" CHECK ((("csed_months_remaining" IS NULL) OR ("csed_months_remaining" >= 0))),
    CONSTRAINT "case_financial_data_dependents_count_check" CHECK ((("dependents_count" IS NULL) OR ("dependents_count" >= 0))),
    CONSTRAINT "case_financial_data_household_size_check" CHECK ((("household_size" IS NULL) OR ("household_size" >= 1))),
    CONSTRAINT "case_financial_data_oic_payment_months_check" CHECK ((("oic_payment_months" IS NULL) OR (("oic_payment_months" >= 1) AND ("oic_payment_months" <= 24)))),
    CONSTRAINT "case_financial_data_vehicle_count_check" CHECK ((("vehicle_count" IS NULL) OR ("vehicle_count" >= 0))),
    CONSTRAINT "case_financial_data_vehicle_loan_balances_check" CHECK ((("vehicle_loan_balances" IS NULL) OR ("jsonb_typeof"("vehicle_loan_balances") = 'array'::"text"))),
    CONSTRAINT "case_financial_data_vehicle_market_values_check" CHECK ((("vehicle_market_values" IS NULL) OR ("jsonb_typeof"("vehicle_market_values") = 'array'::"text")))
);


ALTER TABLE "public"."case_financial_data" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cases" (
    "id" "uuid" NOT NULL,
    "external_reference" "text",
    "status" "text" DEFAULT 'intake'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "cases_status_check" CHECK (("status" = ANY (ARRAY['intake'::"text", 'awaiting_documents'::"text", 'information_needed'::"text", 'ready'::"text", 'ready_for_review'::"text", 'blocked'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."cases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."county_suffixes" (
    "suffix" "text" NOT NULL
);


ALTER TABLE "public"."county_suffixes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."determination_runs" (
    "id" "uuid" NOT NULL,
    "case_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "path" "text",
    "reason" "text",
    "monthly_income" numeric(14,2),
    "monthly_expenses" numeric(14,2),
    "net_disposable_income" numeric(14,2),
    "net_realizable_equity" numeric(14,2),
    "suggested_offer_or_payment" numeric(14,2),
    "needs_manual_review" boolean DEFAULT false NOT NULL,
    "review_notes" "jsonb",
    "financial_data_snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "determination_runs_status_check" CHECK (("status" = ANY (ARRAY['information_needed'::"text", 'ready'::"text", 'ready_for_review'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."determination_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_extractions" (
    "id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "canonical_column" "text" NOT NULL,
    "extracted_value" "jsonb" NOT NULL,
    "confidence" numeric(4,3),
    "page_reference" "text",
    "accepted_into_canonical_data" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "document_extractions_confidence_check" CHECK ((("confidence" >= (0)::numeric) AND ("confidence" <= (1)::numeric)))
);


ALTER TABLE "public"."document_extractions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" NOT NULL,
    "case_id" "uuid" NOT NULL,
    "storage_key" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "document_type" "text",
    "uploaded_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "analysis_status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    CONSTRAINT "documents_analysis_status_check" CHECK (("analysis_status" = ANY (ARRAY['uploaded'::"text", 'processing'::"text", 'complete'::"text", 'needs_review'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."health_care_standards" (
    "minimum_age" smallint NOT NULL,
    "maximum_age" smallint,
    "monthly_amount" numeric(14,2) NOT NULL,
    CONSTRAINT "health_care_standards_check" CHECK ((("maximum_age" IS NULL) OR ("maximum_age" >= "minimum_age"))),
    CONSTRAINT "health_care_standards_minimum_age_check" CHECK (("minimum_age" >= 0)),
    CONSTRAINT "health_care_standards_monthly_amount_check" CHECK (("monthly_amount" >= (0)::numeric))
);


ALTER TABLE "public"."health_care_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."housing_utilities_standards" (
    "source_row" integer NOT NULL,
    "state" "text" NOT NULL,
    "county" "text" NOT NULL,
    "normalized_county" "text" NOT NULL,
    "household_size" smallint NOT NULL,
    "monthly_amount" numeric(14,2) NOT NULL,
    CONSTRAINT "housing_utilities_standards_household_size_check" CHECK (("household_size" >= 1)),
    CONSTRAINT "housing_utilities_standards_monthly_amount_check" CHECK (("monthly_amount" >= (0)::numeric)),
    CONSTRAINT "housing_utilities_standards_source_row_check" CHECK (("source_row" > 0))
);


ALTER TABLE "public"."housing_utilities_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."msa_county_standards" (
    "source_row" integer NOT NULL,
    "state" "text" NOT NULL,
    "county" "text" NOT NULL,
    "normalized_county" "text" NOT NULL,
    "area" "text" NOT NULL,
    CONSTRAINT "msa_county_standards_source_row_check" CHECK (("source_row" > 0))
);


ALTER TABLE "public"."msa_county_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."national_standards" (
    "household_size" smallint NOT NULL,
    "monthly_amount" numeric(14,2) NOT NULL,
    "additional_person_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "national_standards_additional_person_amount_check" CHECK (("additional_person_amount" >= (0)::numeric)),
    CONSTRAINT "national_standards_household_size_check" CHECK (("household_size" >= 1)),
    CONSTRAINT "national_standards_monthly_amount_check" CHECK (("monthly_amount" >= (0)::numeric))
);


ALTER TABLE "public"."national_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."question_definitions" (
    "question_id" "text" NOT NULL,
    "prompt" "text" NOT NULL,
    "value_type" "text" NOT NULL,
    "canonical_column" "text" NOT NULL,
    CONSTRAINT "question_definitions_value_type_check" CHECK (("value_type" = ANY (ARRAY['bool'::"text", 'int'::"text", 'float'::"text", 'str'::"text"])))
);


ALTER TABLE "public"."question_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_aliases" (
    "alias" "text" NOT NULL,
    "canonical_state" "text" NOT NULL
);


ALTER TABLE "public"."state_aliases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."state_region_standards" (
    "state" "text" NOT NULL,
    "region" "text" NOT NULL
);


ALTER TABLE "public"."state_region_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transportation_operating_standards" (
    "area" "text" NOT NULL,
    "vehicle_count" smallint NOT NULL,
    "monthly_amount" numeric(14,2) NOT NULL,
    CONSTRAINT "transportation_operating_standards_monthly_amount_check" CHECK (("monthly_amount" >= (0)::numeric)),
    CONSTRAINT "transportation_operating_standards_vehicle_count_check" CHECK (("vehicle_count" >= 0))
);


ALTER TABLE "public"."transportation_operating_standards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transportation_ownership_standards" (
    "vehicle_count" smallint NOT NULL,
    "monthly_amount" numeric(14,2) NOT NULL,
    CONSTRAINT "transportation_ownership_standards_monthly_amount_check" CHECK (("monthly_amount" >= (0)::numeric)),
    CONSTRAINT "transportation_ownership_standards_vehicle_count_check" CHECK (("vehicle_count" >= 0))
);


ALTER TABLE "public"."transportation_ownership_standards" OWNER TO "postgres";


ALTER TABLE ONLY "public"."case_financial_data"
    ADD CONSTRAINT "case_financial_data_pkey" PRIMARY KEY ("case_id");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_external_reference_key" UNIQUE ("external_reference");



ALTER TABLE ONLY "public"."cases"
    ADD CONSTRAINT "cases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."county_suffixes"
    ADD CONSTRAINT "county_suffixes_pkey" PRIMARY KEY ("suffix");



ALTER TABLE ONLY "public"."determination_runs"
    ADD CONSTRAINT "determination_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_storage_key_key" UNIQUE ("storage_key");



ALTER TABLE ONLY "public"."health_care_standards"
    ADD CONSTRAINT "health_care_standards_pkey" PRIMARY KEY ("minimum_age");



ALTER TABLE ONLY "public"."housing_utilities_standards"
    ADD CONSTRAINT "housing_utilities_standards_pkey" PRIMARY KEY ("source_row", "household_size");



ALTER TABLE ONLY "public"."msa_county_standards"
    ADD CONSTRAINT "msa_county_standards_pkey" PRIMARY KEY ("source_row");



ALTER TABLE ONLY "public"."national_standards"
    ADD CONSTRAINT "national_standards_pkey" PRIMARY KEY ("household_size");



ALTER TABLE ONLY "public"."question_definitions"
    ADD CONSTRAINT "question_definitions_pkey" PRIMARY KEY ("question_id");



ALTER TABLE ONLY "public"."state_aliases"
    ADD CONSTRAINT "state_aliases_pkey" PRIMARY KEY ("alias");



ALTER TABLE ONLY "public"."state_region_standards"
    ADD CONSTRAINT "state_region_standards_pkey" PRIMARY KEY ("state");



ALTER TABLE ONLY "public"."transportation_operating_standards"
    ADD CONSTRAINT "transportation_operating_standards_pkey" PRIMARY KEY ("area", "vehicle_count");



ALTER TABLE ONLY "public"."transportation_ownership_standards"
    ADD CONSTRAINT "transportation_ownership_standards_pkey" PRIMARY KEY ("vehicle_count");



CREATE INDEX "determination_runs_case_id_idx" ON "public"."determination_runs" USING "btree" ("case_id", "created_at" DESC);



CREATE INDEX "document_extractions_document_id_idx" ON "public"."document_extractions" USING "btree" ("document_id");



CREATE INDEX "documents_case_id_idx" ON "public"."documents" USING "btree" ("case_id");



CREATE INDEX "housing_utilities_lookup_idx" ON "public"."housing_utilities_standards" USING "btree" ("state", "normalized_county", "household_size", "source_row");



CREATE INDEX "msa_county_lookup_idx" ON "public"."msa_county_standards" USING "btree" ("state", "normalized_county", "source_row");



ALTER TABLE ONLY "public"."case_financial_data"
    ADD CONSTRAINT "case_financial_data_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."determination_runs"
    ADD CONSTRAINT "determination_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_extractions"
    ADD CONSTRAINT "document_extractions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE CASCADE;



ALTER TABLE "public"."case_financial_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."county_suffixes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."determination_runs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_extractions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."health_care_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."housing_utilities_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."msa_county_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."national_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."question_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_aliases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."state_region_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transportation_operating_standards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."transportation_ownership_standards" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."canonical_state_name"("input_state" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."canonical_state_name"("input_state" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalize_county_name"("input_county" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalize_county_name"("input_county" "text") TO "service_role";



GRANT ALL ON TABLE "public"."case_financial_data" TO "service_role";



GRANT ALL ON TABLE "public"."cases" TO "service_role";



GRANT ALL ON TABLE "public"."county_suffixes" TO "service_role";



GRANT ALL ON TABLE "public"."determination_runs" TO "service_role";



GRANT ALL ON TABLE "public"."document_extractions" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."health_care_standards" TO "service_role";



GRANT ALL ON TABLE "public"."housing_utilities_standards" TO "service_role";



GRANT ALL ON TABLE "public"."msa_county_standards" TO "service_role";



GRANT ALL ON TABLE "public"."national_standards" TO "service_role";



GRANT ALL ON TABLE "public"."question_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."state_aliases" TO "service_role";



GRANT ALL ON TABLE "public"."state_region_standards" TO "service_role";



GRANT ALL ON TABLE "public"."transportation_operating_standards" TO "service_role";



GRANT ALL ON TABLE "public"."transportation_ownership_standards" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







