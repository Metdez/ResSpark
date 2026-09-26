export type AnswerValue = boolean | number | string;
export type Answers = Record<string, AnswerValue>;
export type ValueType = "boolean" | "integer" | "decimal" | "text";

export interface QuestionDefinition {
  id: string;
  prompt: string;
  valueType: ValueType;
  section: string;
  helpText?: string;
  minimum?: number;
  isApplicable?: (answers: Answers) => boolean;
}

const isMarried = (answers: Answers) => answers.filing_status_married === true;
const doesNotOwnHome = (answers: Answers) => answers.owns_home === false;

export const questions: QuestionDefinition[] = [
  { id: "filing_status_married", prompt: "Are you married?", valueType: "boolean", section: "Household" },
  { id: "filing_joint_offer", prompt: "If married, are you filing jointly with your spouse?", valueType: "boolean", section: "Household", isApplicable: isMarried },
  { id: "state_of_residence", prompt: "What state do you live in?", valueType: "text", section: "Household" },
  { id: "county_of_residence", prompt: "What county do you live in?", valueType: "text", section: "Household" },
  { id: "household_size", prompt: "How many people live in your household, including you?", valueType: "integer", section: "Household", minimum: 1 },
  { id: "dependents_count", prompt: "How many dependents do you claim on your tax return?", valueType: "integer", section: "Household", minimum: 0 },
  { id: "age_taxpayer", prompt: "What is your age?", valueType: "integer", section: "Household", minimum: 0 },
  { id: "age_spouse", prompt: "What is your spouse's age?", valueType: "integer", section: "Household", minimum: 0, isApplicable: isMarried },
  { id: "owns_home", prompt: "Do you own your home?", valueType: "boolean", section: "Housing" },
  { id: "rents_home", prompt: "Do you rent your home?", valueType: "boolean", section: "Housing", isApplicable: doesNotOwnHome },
  { id: "is_wage_earner", prompt: "Do you receive a W-2 paycheck from an employer?", valueType: "boolean", section: "Employment" },
  { id: "is_self_employed", prompt: "Are you self-employed, including Schedule C, E, or F work?", valueType: "boolean", section: "Employment" },
  { id: "pay_frequency", prompt: "How often are you paid?", valueType: "text", section: "Employment", helpText: "For example: weekly, biweekly, semimonthly, or monthly." },
  { id: "vehicle_count", prompt: "How many vehicles do you own or lease?", valueType: "integer", section: "Assets", minimum: 0 },
  { id: "has_real_property", prompt: "Do you own any real estate, such as a home, rental, or land?", valueType: "boolean", section: "Assets" },
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
  { id: "total_tax_owed", prompt: "What is the total amount owed to the IRS, including penalties and interest?", valueType: "decimal", section: "Tax balance", minimum: 0 },
  { id: "tax_only_balance", prompt: "How much income tax is owed before penalties and interest?", valueType: "decimal", section: "Tax balance", minimum: 0 },
  { id: "csed_months_remaining", prompt: "How many months remain until the IRS collection deadline expires?", valueType: "integer", section: "Tax balance", minimum: 0, helpText: "Use the number shown on your IRS transcript if available." },
];
