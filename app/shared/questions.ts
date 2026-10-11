// Verbatim port of src/questions.py and the question helpers in src/intake_workflow.py.
export type QuestionType = 'bool' | 'int' | 'float' | 'str'

export interface Question {
  readonly id: string
  readonly prompt: string
  readonly type: QuestionType
}

export const QUESTIONS: readonly Question[] = [
  // --- Household (Form 433-A Section 1) ---
  { id: 'filing_status_married', prompt: 'Are you married?', type: 'bool' },
  { id: 'filing_joint_offer', prompt: 'Are you filing jointly with your spouse?', type: 'bool' },
  { id: 'state_of_residence', prompt: 'What state do you live in?', type: 'str' },
  { id: 'county_of_residence', prompt: 'What county do you live in?', type: 'str' },
  { id: 'household_size', prompt: 'How many people live in your household (incl. you)?', type: 'int' },
  { id: 'dependents_count', prompt: 'How many dependents do you claim on your tax return?', type: 'int' },
  { id: 'age_taxpayer', prompt: 'What is your age?', type: 'int' },
  { id: 'age_spouse', prompt: "What is your spouse's age (if married)?", type: 'int' },
  // --- Housing ---
  { id: 'owns_home', prompt: 'Do you own your home?', type: 'bool' },
  { id: 'rents_home', prompt: 'Do you rent your home?', type: 'bool' },
  // --- Employment (Section 2) ---
  { id: 'is_wage_earner', prompt: 'Do you receive a W-2 paycheck from an employer?', type: 'bool' },
  { id: 'is_self_employed', prompt: 'Are you self-employed (Schedule C/E/F)?', type: 'bool' },
  { id: 'pay_frequency', prompt: 'How often are you paid? (weekly/biweekly/semimonthly/monthly)', type: 'str' },
  // --- Vehicles / Assets context ---
  { id: 'vehicle_count', prompt: 'How many vehicles do you own or lease?', type: 'int' },
  { id: 'has_real_property', prompt: 'Do you own any real estate (home, rental, land)?', type: 'bool' },
  { id: 'has_retirement_accounts', prompt: 'Do you have a 401(k), IRA, or other retirement account?', type: 'bool' },
  { id: 'has_life_insurance_cash_value', prompt: 'Do you have life insurance with cash value?', type: 'bool' },
  { id: 'has_investment_accounts', prompt: 'Do you own stocks, bonds, or other investments?', type: 'bool' },
  // --- Compliance / eligibility gates (Section 9) ---
  { id: 'all_returns_filed', prompt: 'Have you filed all required tax returns?', type: 'bool' },
  { id: 'in_open_bankruptcy', prompt: 'Are you currently in an open bankruptcy proceeding?', type: 'bool' },
  { id: 'filed_bankruptcy_past_7yrs', prompt: 'Have you filed bankruptcy in the past 7 years?', type: 'bool' },
  { id: 'in_litigation', prompt: 'Are you currently a party to a lawsuit?', type: 'bool' },
  { id: 'prior_ia_or_oic_default', prompt: 'Have you defaulted on a prior IRS payment plan or offer?', type: 'bool' },
  { id: 'filed_and_paid_timely_last_5_years', prompt: 'For the last 5 tax years, did you file and pay the tax shown on time?', type: 'bool' },
  { id: 'installment_agreement_last_5_years', prompt: 'Have you had an income-tax installment agreement in the last 5 tax years?', type: 'bool' },
  // --- Liability facts (from IRS transcripts, confirmable) ---
  { id: 'total_tax_owed', prompt: 'Total amount owed to the IRS (all years, incl. penalties/interest)?', type: 'float' },
  { id: 'tax_only_balance', prompt: 'Income tax owed before penalties and interest?', type: 'float' },
  { id: 'csed_months_remaining', prompt: 'Months remaining until the IRS collection statute expires (from transcript)?', type: 'int' },
]

export const QUESTION_BY_ID: Readonly<Record<string, Question>> =
  Object.fromEntries(QUESTIONS.map((question) => [question.id, question]))

export const INITIAL_QUESTION_IDS: readonly string[] = [
  'filing_status_married', 'filing_joint_offer', 'state_of_residence',
  'county_of_residence', 'household_size', 'age_taxpayer', 'age_spouse',
  'owns_home', 'rents_home', 'is_wage_earner', 'is_self_employed',
  'vehicle_count', 'has_real_property', 'has_retirement_accounts',
  'has_life_insurance_cash_value', 'has_investment_accounts',
  'all_returns_filed', 'in_open_bankruptcy',
]

// _is_applicable: `is True` / `is False`, so only real booleans count.
export function isApplicable(
  questionId: string,
  row: Readonly<Record<string, unknown>>
): boolean {
  if (questionId === 'filing_joint_offer' || questionId === 'age_spouse') {
    return row.filing_status_married === true
  }
  if (questionId === 'rents_home') return row.owns_home === false
  return true
}

// type(value).__name__ for the values JSON can carry.
const pythonTypeName = (value: unknown): string => {
  if (value == null) return 'NoneType'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float'
  if (typeof value === 'string') return 'str'
  return Array.isArray(value) ? 'list' : 'dict'
}

const VALID: Record<QuestionType, (value: unknown) => boolean> = {
  bool: (value) => typeof value === 'boolean',
  int: (value) => typeof value === 'number' && Number.isInteger(value),
  // float accepts int or float, never bool (validate_answer).
  float: (value) => typeof value === 'number' && Number.isFinite(value),
  str: (value) => typeof value === 'string',
}

export function validateAnswer(questionId: string, value: unknown): void {
  const question = QUESTIONS.find((candidate) => candidate.id === questionId)
  if (!question) throw new Error(`Unknown question: ${questionId}`)
  if (!VALID[question.type](value)) {
    throw new TypeError(
      `${questionId} requires ${question.type}; got ${pythonTypeName(value)}`
    )
  }
}

// --- Client intake (07 D-13): UI metadata and the portal's question rules. ---
export type QuestionControlKind = 'yes_no' | 'stepper' | 'number' | 'choice'

export interface QuestionUi {
  readonly section: string
  readonly control: QuestionControlKind
  readonly options?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  readonly minimum?: number
  readonly maximum?: number
  readonly helpText?: string
}

const yesNo = (section: string): QuestionUi => ({ section, control: 'yes_no' })
const count = (minimum: number): QuestionUi => ({ section: 'Household', control: 'stepper', minimum, maximum: 50 })
const age: QuestionUi = { section: 'Household', control: 'number', minimum: 0, maximum: 120 }

// Sections and pay-frequency labels from the frozen src/frontend/src/questions.ts. Only the 23
// client questions have an entry: state and county come from the address step, and the three
// transcript facts are staff-only.
export const QUESTION_UI: Readonly<Record<string, QuestionUi>> = {
  filing_status_married: yesNo('Household'),
  filing_joint_offer: yesNo('Household'),
  household_size: count(1),
  dependents_count: count(0),
  age_taxpayer: age,
  age_spouse: age,
  owns_home: yesNo('Housing'),
  rents_home: yesNo('Housing'),
  is_wage_earner: yesNo('Employment'),
  is_self_employed: yesNo('Employment'),
  pay_frequency: {
    section: 'Employment',
    control: 'choice',
    options: [
      { value: 'weekly', label: 'Weekly' },
      { value: 'biweekly', label: 'Every two weeks' },
      { value: 'semimonthly', label: 'Twice a month' },
      { value: 'monthly', label: 'Monthly' },
    ],
  },
  vehicle_count: { ...count(0), section: 'Assets' },
  has_real_property: yesNo('Assets'),
  has_retirement_accounts: yesNo('Assets'),
  has_life_insurance_cash_value: yesNo('Assets'),
  has_investment_accounts: yesNo('Assets'),
  all_returns_filed: yesNo('Compliance'),
  in_open_bankruptcy: yesNo('Compliance'),
  filed_bankruptcy_past_7yrs: yesNo('Compliance'),
  in_litigation: yesNo('Compliance'),
  prior_ia_or_oic_default: yesNo('Compliance'),
  filed_and_paid_timely_last_5_years: yesNo('Compliance'),
  installment_agreement_last_5_years: yesNo('Compliance'),
}

const isClientQuestion = (id: string) => Object.prototype.hasOwnProperty.call(QUESTION_UI, id)

export const CLIENT_QUESTION_IDS: readonly string[] = QUESTIONS.map((q) => q.id).filter(isClientQuestion)

// Only these may be prefilled, and only from A-reliability Truv or Logics proposals.
export const PREFILL_COLUMNS: readonly string[] = ['is_wage_earner', 'pay_frequency', 'filing_status_married', 'age_taxpayer']

// INITIAL_QUESTION_IDS first, then the rest in QUESTIONS order. Besides Python's rules, the portal
// skips pay_frequency for a non-wage-earner; staff mark that line "Not applicable".
export function clientQuestionOrder(answers: Readonly<Record<string, unknown>>): string[] {
  const initial = INITIAL_QUESTION_IDS.filter(isClientQuestion)
  return [...initial, ...CLIENT_QUESTION_IDS.filter((id) => !initial.includes(id))].filter(
    (id) => isApplicable(id, answers) && !(id === 'pay_frequency' && answers.is_wage_earner === false)
  )
}

export function validateClientAnswer(questionId: string, value: unknown): 'unknown_question' | 'bad_value' | null {
  if (!isClientQuestion(questionId)) return 'unknown_question'
  try {
    validateAnswer(questionId, value)
  } catch {
    return 'bad_value'
  }
  const ui = QUESTION_UI[questionId]
  if (typeof value === 'number' && (value < (ui.minimum ?? -Infinity) || value > (ui.maximum ?? Infinity))) return 'bad_value'
  if (ui.options && !ui.options.some((o) => o.value === value)) return 'bad_value'
  return null
}
