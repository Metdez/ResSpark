import type { Answers } from "../questions";

export type ResolutionPathId =
  | "cnc"
  | "simple_plan"
  | "non_simple_installment"
  | "manual_equity"
  | "manual_payment"
  | "blocked";

export interface ResolutionOutcome {
  id: ResolutionPathId;
  path: string;
  shortLabel: string;
  status: "potential_match" | "manual_review" | "blocked";
  reason: string;
  nextStep: string;
  requirements: string[];
  monthlyIncome: number;
  monthlyExpenses: number;
  netDisposableIncome: number;
  netRealizableEquity: number;
  suggestedOfferOrPayment: number;
  reviewNotes: string[];
}

export interface FinancialField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  format?: "currency" | "boolean" | "number" | "text";
}

export interface FinancialSection {
  id: string;
  title: string;
  description: string;
  fields: FinancialField[];
}

export interface UploadedDocument {
  category: string;
  categoryLabel: string;
  name: string;
  type: string;
  size: number;
}

export interface ResolutionCaseResult {
  caseLabel: string;
  generatedAt: string;
  isSandbox: boolean;
  outcome: ResolutionOutcome;
  availableOutcomes: ResolutionOutcome[];
  documents: UploadedDocument[];
  financialSections: FinancialSection[];
}

const outcome = (
  id: ResolutionPathId,
  path: string,
  shortLabel: string,
  status: ResolutionOutcome["status"],
  reason: string,
  nextStep: string,
  amounts: Pick<ResolutionOutcome, "monthlyIncome" | "monthlyExpenses" | "netDisposableIncome" | "netRealizableEquity" | "suggestedOfferOrPayment">,
  requirements: string[],
  reviewNotes: string[] = [],
): ResolutionOutcome => ({ id, path, shortLabel, status, reason, nextStep, requirements, ...amounts, reviewNotes });

export const sandboxOutcomes: ResolutionOutcome[] = [
  outcome("cnc", "Currently Not Collectible (CNC / Status 53)", "Currently Not Collectible", "potential_match", "Allowable expenses consume all monthly income and the case has no meaningful realizable equity.", "A tax professional should verify the hardship calculation and supporting documents before requesting CNC status.", { monthlyIncome: 4_820, monthlyExpenses: 4_965, netDisposableIncome: 0, netRealizableEquity: 280, suggestedOfferOrPayment: 0 }, ["All required tax returns are filed", "No open bankruptcy proceeding", "No monthly disposable income remains after allowable expenses", "Net realizable equity is $500 or less"]),
  outcome("simple_plan", "Simple Payment Plan", "Simple payment plan", "potential_match", "The balance is $50,000 or less and available monthly income can pay it before the collection statute expires.", "A tax professional should confirm the collection deadline and proposed monthly payment before contacting the IRS.", { monthlyIncome: 7_850, monthlyExpenses: 6_430, netDisposableIncome: 1_420, netRealizableEquity: 3_200, suggestedOfferOrPayment: 625 }, ["All required tax returns are filed", "No open bankruptcy proceeding", "Total assessed balance is $50,000 or less", "Collection statute has time remaining", "Available monthly income can fully pay the balance by the collection deadline"]),
  outcome("non_simple_installment", "Non-Simple Installment Agreement", "Installment agreement", "potential_match", "The balance can be paid before the collection statute expires, but the case falls outside the simple-plan rules.", "A tax professional should review the financial statement and negotiate the agreement terms with the IRS.", { monthlyIncome: 12_400, monthlyExpenses: 9_950, netDisposableIncome: 2_450, netRealizableEquity: 18_700, suggestedOfferOrPayment: 1_875 }, ["All required tax returns are filed", "No open bankruptcy proceeding", "Collection statute has time remaining", "Available monthly income can fully pay the balance by the collection deadline", "Case falls outside one or more simple-plan conditions"]),
  outcome("manual_equity", "MANUAL REVIEW — negative income, meaningful equity present", "Equity or hardship review", "manual_review", "There is no monthly disposable income, but realizable equity exceeds $500.", "A tax professional must compare a possible equity-funded offer with hardship CNC treatment.", { monthlyIncome: 5_100, monthlyExpenses: 5_480, netDisposableIncome: 0, netRealizableEquity: 14_200, suggestedOfferOrPayment: 14_200 }, ["All required tax returns are filed", "No open bankruptcy proceeding", "No monthly disposable income remains", "Net realizable equity is greater than $500", "CPA or EA judgment is required before selecting a path"], ["Equity-funded OIC versus CNC requires professional judgment."]),
  outcome("manual_payment", "MANUAL REVIEW — payment resolution needs review", "Payment resolution review", "manual_review", "The available data does not support an automatic payment-resolution selection.", "A tax professional should verify the transcript, collection deadline, and complete financial record.", { monthlyIncome: 6_750, monthlyExpenses: 5_980, netDisposableIncome: 770, netRealizableEquity: 8_400, suggestedOfferOrPayment: 0 }, ["All required tax returns are filed", "No open bankruptcy proceeding", "Case does not satisfy an automatic payment-path branch", "Transcript and collection deadline must be verified", "CPA or EA review is required"], ["No automatic payment path was selected."]),
  outcome("blocked", "BLOCKED — Compliance gate failed", "Compliance action needed", "blocked", "Not all required tax returns are filed, or the taxpayer is currently in an open bankruptcy proceeding.", "Resolve the compliance issue before evaluating a collection alternative.", { monthlyIncome: 4_820, monthlyExpenses: 4_965, netDisposableIncome: -145, netRealizableEquity: 280, suggestedOfferOrPayment: 0 }, ["File all required tax returns", "Resolve or exit any open bankruptcy proceeding", "Run the screening calculation again after compliance is restored"], ["Compliance must be resolved before a path can be suggested."]),
];

const answer = (answers: Answers, key: string, fallback: string | number | boolean | null) =>
  answers[key] ?? fallback;

export function createSandboxCase(
  answers: Answers,
  documents: UploadedDocument[],
  pathId: ResolutionPathId = "simple_plan",
): ResolutionCaseResult {
  const selected = sandboxOutcomes.find((item) => item.id === pathId) ?? sandboxOutcomes[0];
  const currency = (key: string, label: string, value: number): FinancialField => ({ key, label, value, format: "currency" });

  return {
    caseLabel: "Tax resolution screening",
    generatedAt: new Date().toISOString(),
    isSandbox: true,
    outcome: selected,
    availableOutcomes: sandboxOutcomes,
    documents,
    financialSections: [
      {
        id: "profile", title: "Household & profile", description: "Questionnaire facts used for standards and eligibility.", fields: [
          { key: "filing_status_married", label: "Married", value: answer(answers, "filing_status_married", false), format: "boolean" },
          { key: "filing_joint_offer", label: "Joint offer", value: answer(answers, "filing_joint_offer", false), format: "boolean" },
          { key: "state_of_residence", label: "State", value: answer(answers, "state_of_residence", "Florida") },
          { key: "county_of_residence", label: "County", value: answer(answers, "county_of_residence", "Miami-Dade County") },
          { key: "household_size", label: "Household size", value: answer(answers, "household_size", 2), format: "number" },
          { key: "dependents_count", label: "Dependents", value: answer(answers, "dependents_count", 1), format: "number" },
          { key: "age_taxpayer", label: "Taxpayer age", value: answer(answers, "age_taxpayer", 42), format: "number" },
          { key: "age_spouse", label: "Spouse age", value: answer(answers, "age_spouse", 0), format: "number" },
          { key: "owns_home", label: "Owns home", value: answer(answers, "owns_home", false), format: "boolean" },
          { key: "rents_home", label: "Rents home", value: answer(answers, "rents_home", true), format: "boolean" },
          { key: "is_wage_earner", label: "Wage earner", value: answer(answers, "is_wage_earner", true), format: "boolean" },
          { key: "is_self_employed", label: "Self-employed", value: answer(answers, "is_self_employed", false), format: "boolean" },
          { key: "pay_frequency", label: "Pay frequency", value: answer(answers, "pay_frequency", "Every two weeks") },
          { key: "vehicle_count", label: "Vehicles", value: answer(answers, "vehicle_count", 1), format: "number" },
          { key: "has_real_property", label: "Has real property", value: answer(answers, "has_real_property", false), format: "boolean" },
          { key: "has_retirement_accounts", label: "Has retirement accounts", value: answer(answers, "has_retirement_accounts", true), format: "boolean" },
          { key: "has_life_insurance_cash_value", label: "Life insurance has cash value", value: answer(answers, "has_life_insurance_cash_value", false), format: "boolean" },
          { key: "has_investment_accounts", label: "Has investment accounts", value: answer(answers, "has_investment_accounts", false), format: "boolean" },
        ],
      },
      {
        id: "income", title: "Monthly household income", description: "Form 433-A (OIC), Section 7, Box D.", fields: [
          currency("gross_wages_taxpayer", "Taxpayer wages", selected.monthlyIncome),
          currency("gross_wages_spouse", "Spouse wages", 0), currency("social_security_income", "Social Security", 0),
          currency("pension_income", "Pension", 0), currency("other_income", "Other income", 0),
          currency("interest_dividends_royalties", "Interest, dividends & royalties", 0),
          currency("distributions_income", "Distributions", 0), currency("net_rental_income", "Net rental income", 0),
          currency("net_business_income", "Net business income", 0), currency("child_support_received", "Child support received", 0),
          currency("alimony_received", "Alimony received", 0),
        ],
      },
      {
        id: "expenses", title: "Monthly household expenses", description: "Actual expenses and IRS-standard allowances used by the screening calculation.", fields: [
          currency("actual_housing_utilities", "Housing & utilities", 2_150), currency("actual_vehicle_loan_lease", "Vehicle loan or lease", 485),
          currency("actual_vehicle_operating", "Vehicle operating", 325), currency("actual_public_transportation", "Public transportation", 0),
          currency("actual_health_insurance_premiums", "Health insurance", 540), currency("actual_court_ordered_payments", "Court-ordered payments", 0),
          currency("actual_child_dependent_care", "Child/dependent care", 350), currency("actual_life_insurance_premiums", "Life insurance", 65),
          currency("actual_current_taxes", "Current taxes", 910), currency("actual_delinquent_state_local_tax", "Delinquent state/local tax", 0),
          currency("actual_secured_debts_other", "Other secured debts", 0),
        ],
      },
      {
        id: "assets", title: "Assets & equity", description: "Form 433-A (OIC), Section 3 values before determination adjustments.", fields: [
          currency("cash_and_bank_balances", "Cash & bank balances", 2_480), currency("investment_accounts_net", "Investment accounts", 0),
          currency("retirement_accounts_market_value", "Retirement market value", 8_200), currency("retirement_accounts_loan_balance", "Retirement loans", 0),
          currency("life_insurance_cash_value", "Life insurance cash value", 0), currency("life_insurance_loan_balance", "Life insurance loans", 0),
          currency("real_property_market_value", "Real property market value", 0), currency("real_property_loan_balance", "Real property loans", 0),
          currency("vehicle_market_value_total", "Vehicle market value", 14_500), currency("vehicle_loan_balance_total", "Vehicle loans", 10_900),
          { key: "vehicle_market_values", label: "Per-vehicle market values", value: "$14,500" },
          { key: "vehicle_loan_balances", label: "Per-vehicle loan balances", value: "$10,900" },
          currency("other_valuable_assets_value", "Other valuable assets", 0), currency("other_valuable_assets_loan", "Other asset loans", 0),
        ],
      },
      {
        id: "compliance", title: "Compliance & liability", description: "Eligibility gates and transcript-derived liability facts.", fields: [
          { key: "all_returns_filed", label: "All returns filed", value: answer(answers, "all_returns_filed", true), format: "boolean" },
          { key: "in_open_bankruptcy", label: "Open bankruptcy", value: answer(answers, "in_open_bankruptcy", false), format: "boolean" },
          { key: "filed_bankruptcy_past_7yrs", label: "Bankruptcy in past 7 years", value: answer(answers, "filed_bankruptcy_past_7yrs", false), format: "boolean" },
          { key: "in_litigation", label: "Current litigation", value: answer(answers, "in_litigation", false), format: "boolean" },
          { key: "prior_ia_or_oic_default", label: "Prior IA/OIC default", value: answer(answers, "prior_ia_or_oic_default", false), format: "boolean" },
          { key: "filed_and_paid_timely_last_5_years", label: "Filed and paid timely for 5 years", value: answer(answers, "filed_and_paid_timely_last_5_years", true), format: "boolean" },
          { key: "installment_agreement_last_5_years", label: "Installment agreement in past 5 years", value: answer(answers, "installment_agreement_last_5_years", false), format: "boolean" },
          currency("total_tax_owed", "Total tax owed", Number(answer(answers, "total_tax_owed", 37_500))),
          currency("tax_only_balance", "Tax-only balance", 31_800),
          { key: "csed_months_remaining", label: "CSED months remaining", value: 60, format: "number" },
          { key: "oic_payment_months", label: "OIC payment months", value: null, format: "number" },
          { key: "ai_flags", label: "Extraction review flags", value: "None" },
        ],
      },
    ],
  };
}
