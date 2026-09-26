import { countiesByState } from "./counties.generated";

export type AnswerValue = boolean | number | string;
export type Answers = Record<string, AnswerValue>;
export type ValueType = "boolean" | "integer" | "decimal" | "currency" | "text";

export interface QuestionOption {
  value: string;
  label: string;
}

export interface QuestionDefinition {
  id: string;
  prompt: string;
  valueType: ValueType;
  section: string;
  helpText?: string;
  minimum?: number;
  options?: QuestionOption[];
  optionsForAnswers?: (answers: Answers) => QuestionOption[];
  isApplicable?: (answers: Answers) => boolean;
}

const isMarried = (answers: Answers) => answers.filing_status_married === true;
const doesNotOwnHome = (answers: Answers) => answers.owns_home === false;

const stateOptions = Object.keys(countiesByState).map((state) => ({ value: state, label: state }));
const countyOptions = (answers: Answers) =>
  (countiesByState[String(answers.state_of_residence ?? "")] ?? [])
    .map((county) => ({ value: county, label: county }));
const numericOptions = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => String(start + index))
    .map((value) => ({ value, label: value }));

export const questions: QuestionDefinition[] = [
  { id: "filing_status_married", prompt: "Are you married?", valueType: "boolean", section: "Household" },
  { id: "filing_joint_offer", prompt: "If married, are you filing jointly with your spouse?", valueType: "boolean", section: "Household", isApplicable: isMarried },
  { id: "state_of_residence", prompt: "What state do you live in?", valueType: "text", section: "Household", options: stateOptions },
  { id: "county_of_residence", prompt: "What county do you live in?", valueType: "text", section: "Household", optionsForAnswers: countyOptions },
  { id: "household_size", prompt: "How many people live in your household (incl. you)?", valueType: "integer", section: "Household", minimum: 1, options: numericOptions(1, 50) },
  { id: "dependents_count", prompt: "How many dependents do you claim on your tax return?", valueType: "integer", section: "Household", minimum: 0, options: numericOptions(0, 50) },
  { id: "age_taxpayer", prompt: "What is your age?", valueType: "integer", section: "Household", minimum: 0, options: numericOptions(0, 120) },
  { id: "age_spouse", prompt: "What is your spouse's age (if married)?", valueType: "integer", section: "Household", minimum: 0, isApplicable: isMarried },
  { id: "owns_home", prompt: "Do you own your home?", valueType: "boolean", section: "Housing" },
  { id: "rents_home", prompt: "Do you rent your home?", valueType: "boolean", section: "Housing", isApplicable: doesNotOwnHome },
  { id: "is_wage_earner", prompt: "Do you receive a W-2 paycheck from an employer?", valueType: "boolean", section: "Employment" },
  { id: "is_self_employed", prompt: "Are you self-employed (Schedule C/E/F)?", valueType: "boolean", section: "Employment" },
  { id: "pay_frequency", prompt: "How often are you paid?", valueType: "text", section: "Employment", options: [
    { value: "weekly", label: "Weekly" },
    { value: "biweekly", label: "Every two weeks" },
    { value: "semimonthly", label: "Twice a month" },
    { value: "monthly", label: "Monthly" },
  ] },
  { id: "vehicle_count", prompt: "How many vehicles do you own or lease?", valueType: "integer", section: "Assets", minimum: 0, options: [
    { value: "0", label: "None" },
    { value: "1", label: "1" },
    { value: "2", label: "2" },
    { value: "3", label: "3" },
    { value: "4", label: "4" },
    { value: "5", label: "5" },
    { value: "6", label: "6 or more" },
  ] },
  { id: "has_real_property", prompt: "Do you own any real estate (home, rental, land)?", valueType: "boolean", section: "Assets" },
  { id: "has_retirement_accounts", prompt: "Do you have a 401(k), IRA, or other retirement account?", valueType: "boolean", section: "Assets" },
  { id: "has_life_insurance_cash_value", prompt: "Do you have life insurance with cash value?", valueType: "boolean", section: "Assets" },
  { id: "has_investment_accounts", prompt: "Do you own stocks, bonds, or other investments?", valueType: "boolean", section: "Assets" },
  { id: "all_returns_filed", prompt: "Have you filed all required tax returns?", valueType: "boolean", section: "Compliance" },
  { id: "in_open_bankruptcy", prompt: "Are you currently in an open bankruptcy proceeding?", valueType: "boolean", section: "Compliance" },
  { id: "filed_bankruptcy_past_7yrs", prompt: "Have you filed bankruptcy in the past 7 years?", valueType: "boolean", section: "Compliance" },
  { id: "in_litigation", prompt: "Are you currently a party to a lawsuit?", valueType: "boolean", section: "Compliance" },
  { id: "prior_ia_or_oic_default", prompt: "Have you defaulted on a prior IRS payment plan or offer?", valueType: "boolean", section: "Compliance" },
  { id: "filed_and_paid_timely_last_5_years", prompt: "For the last 5 tax years, did you file and pay the tax shown on time?", valueType: "boolean", section: "Compliance" },
  { id: "installment_agreement_last_5_years", prompt: "Have you had an income-tax installment agreement in the last 5 tax years?", valueType: "boolean", section: "Compliance" },
  { id: "total_tax_owed", prompt: "Total amount owed to the IRS", valueType: "currency", section: "Tax balance", minimum: 0 },
];
