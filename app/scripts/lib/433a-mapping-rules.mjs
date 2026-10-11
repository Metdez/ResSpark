// Reviewed rules that build-433a-seed.mjs turns into supabase/migrations/0009_433a_seed.sql.
// USER ACTION: a CPA/EA reviews these assignments before any real case.

// Census 2025 Gazetteer names that differ from the IRS housing table's own text (07-RESEARCH § County Map).
// Each value is the exact county text of the live housing_utilities_standards row (checked 2026-10-11).
export const COUNTY_OVERRIDES = {
  "02063": "Chugach Census Area, Alaska", // IRS row carries the state name in the county text
  "02066": "Copper River Census Area, Alaska", // same
  "17099": "La Salle County", // Census "LaSalle County"
  "22059": "La Salle Parish", // Census "LaSalle Parish"
  "35011": "DeBaca County", // Census "De Baca County"
  "35013": "Dona Ana County", // Census "Doña Ana County"
};

// USPS codes with no two-letter row in public.state_aliases; the IRS publishes housing standards for them.
export const USPS_EXTRA = { PR: "Puerto Rico" };

// Old Connecticut counties from the Census 2020 county list (codes2020/national_county2020.txt).
// Census replaced them with planning regions 09110-09190 in 2022; they do not map 1:1, so they block.
export const CT_OLD_COUNTIES = {
  "09001": "Fairfield County",
  "09003": "Hartford County",
  "09005": "Litchfield County",
  "09007": "Middlesex County",
  "09009": "New Haven County",
  "09011": "New London County",
  "09013": "Tolland County",
  "09015": "Windham County",
};

export const CT_OLD_NOTE =
  "Connecticut replaced counties with planning regions in 2022; IRS standards use planning regions. Re-verify the address.";

// --- Plaid PFC → 433-A lines (D-08, FORM-07) -----------------------------------
// Lines and reliability from .planning/research/FEATURES.md §(f) "433-A Line-Item Mapping"
// (Form 433-A Rev. 6-2026). `match` is an exact name or a PREFIX_* pattern; first match wins.
const rule = (match, treatment, canonical_column, form_line, reliability, note = null) => ({
  match, treatment, canonical_column, form_line, reliability, note,
});
const NET_DEPOSITS = "Net deposits; cross-check only, never proposed as wages (D-09)";

export const PFC_RULES = [
  rule("INCOME_INTEREST_EARNED", "income", "interest_dividends_royalties", "23", "B"),
  rule("INCOME_DIVIDENDS", "income", "interest_dividends_royalties", "23", "B"),
  rule("INCOME_RETIREMENT_PENSION", "income", "pension_income", "27-28", "B"),
  rule("INCOME_CHILD_SUPPORT", "income", "child_support_received", "31", "B"),
  rule("INCOME_UNEMPLOYMENT", "income", "other_income", "33-34", "B"),
  rule("INCOME_LONG_TERM_DISABILITY", "income", "other_income", "33-34", "B"),
  rule("INCOME_MILITARY", "income", "other_income", "33-34", "B"),
  rule("INCOME_OTHER", "income", "other_income", "33-34", "B"),
  rule("INCOME_OTHER_INCOME", "income", "other_income", "33-34", "B", "PFC v1 name"),
  rule("INCOME_SALARY", "informational", "gross_wages_taxpayer", "21-22", "B", NET_DEPOSITS),
  rule("INCOME_WAGES", "informational", "gross_wages_taxpayer", "21-22", "B", `PFC v1 name. ${NET_DEPOSITS}`),
  rule("INCOME_CONTRACTOR", "informational", "net_business_income", "24", "B", "Gross receipts only; net needs expenses"),
  rule("INCOME_GIG_ECONOMY", "informational", "net_business_income", "24", "B", "Gross receipts only; net needs expenses"),
  rule("INCOME_RENTAL", "informational", "net_rental_income", "25", "B", "Gross rent only; net needs expenses"),
  rule("INCOME_TAX_REFUND", "exclude", null, null, "A", "Not income"),
  rule("RENT_AND_UTILITIES_*", "expense", "actual_housing_utilities", "37", "B", "Escrowed property tax and insurance are invisible; ask"),
  rule("LOAN_PAYMENTS_MORTGAGE_PAYMENT", "expense", "actual_housing_utilities", "37", "B", "Escrowed property tax and insurance are invisible; ask"),
  rule("LOAN_PAYMENTS_CAR_PAYMENT", "expense", "actual_vehicle_loan_lease", "38", "B"),
  rule("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT", "exclude", null, null, "A", "Card purchases are categorized individually"),
  rule("TRANSPORTATION_GAS", "expense", "actual_vehicle_operating", "39", "B"),
  rule("TRANSPORTATION_PARKING", "expense", "actual_vehicle_operating", "39", "B"),
  rule("TRANSPORTATION_TOLLS", "expense", "actual_vehicle_operating", "39", "B"),
  rule("GENERAL_SERVICES_AUTOMOTIVE", "expense", "actual_vehicle_operating", "39", "B"),
  rule("TRANSPORTATION_PUBLIC_TRANSIT", "expense", "actual_public_transportation", "40", "B"),
  rule("GENERAL_SERVICES_CHILDCARE", "expense", "actual_child_dependent_care", "44", "B"),
  rule("TRANSFER_IN_*", "exclude", null, null, "A", "Transfer, not income"),
  rule("TRANSFER_OUT_*", "exclude", null, null, "A", "Transfer, not an expense"),
  rule("LOAN_DISBURSEMENTS_*", "exclude", null, null, "A", "Loan proceeds, not income"),
  rule("GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT", "informational", null, "46/48", null,
    "Recipient unknown: IRS payments are what the resolution replaces; staff decide"),
  rule("GENERAL_SERVICES_INSURANCE", "informational", null, "39/41/45", null,
    "Auto, health or life cannot be told apart; staff assign"),
  rule("FOOD_AND_DRINK_*", "informational", null, "36", null, "National Standard; informational only"),
  rule("GENERAL_MERCHANDISE_*", "informational", null, "36", null, "National Standard; informational only"),
  rule("PERSONAL_CARE_*", "informational", null, "36", null, "National Standard; informational only"),
  rule("MEDICAL_*", "informational", null, "42", null, "National Standard; informational only"),
];

// Every PFC name no rule covers; transfers and loan proceeds are never income or expense.
export const pfcDefault = (primary) => ({
  treatment: ["TRANSFER_IN", "TRANSFER_OUT", "LOAN_DISBURSEMENTS"].includes(primary) ? "exclude" : "informational",
  canonical_column: null,
  form_line: null,
  reliability: null,
  note: null,
});

// --- Truv pay-stub deductions → 433-A lines (D-08) ------------------------------
// Categories per docs.truv.com (memo, medicare, retirement, benefit, socialsec, federal, state, garnishment,
// local, other); name_pattern is ILIKE on the deduction name; lowest priority wins per deduction.
const truv = (truv_category, name_pattern, priority, treatment, canonical_column, form_line, reliability, note = null) => ({
  truv_category, name_pattern, priority, treatment, canonical_column, form_line, reliability, note,
});
const TAXES = ["federal", "state", "local", "socialsec", "medicare"];

export const TRUV_ROWS = [
  ...TAXES.map((category) => truv(category, "%", 10, "expense", "actual_current_taxes", "46", "A")),
  truv("garnishment", "%", 10, "expense", "actual_court_ordered_payments", "43", "B"),
  ...["%health%", "%medical%", "%dental%", "%vision%"].map((pattern, index) =>
    truv("benefit", pattern, 10 + index, "expense", "actual_health_insurance_premiums", "41", "B")),
  truv("benefit", "%life%", 20, "expense", "actual_life_insurance_premiums", "45", "C",
    "Term life only; staff confirm term vs whole life"),
  truv("benefit", "%", 99, "informational", null, null, null, "Other benefit; staff classify"),
  truv("retirement", "%", 99, "informational", null, "49", null, "Required vs voluntary unknown; voluntary 401(k) is not allowable"),
  truv("other", "%", 99, "informational", null, null, null, "Staff classify by name"),
  truv("memo", "%", 99, "informational", null, null, null, "Memo line, not a deduction"),
];
