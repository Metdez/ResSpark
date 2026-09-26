import type { Answers } from "../questions";

export interface DocumentRequest {
  code: string;
  title: string;
  detail: string;
  required: boolean;
  maxFiles?: number;
}

interface DocumentRule {
  request: DocumentRequest;
  applies: (answers: Answers) => boolean;
}

const required = (code: string, title: string, detail: string): DocumentRequest => ({
  code,
  title,
  detail,
  required: true,
});

const always = () => true;

const documentRules: DocumentRule[] = [
  {
    request: required(
      "irs_transcripts",
      "IRS account transcript",
      "Upload an IRS account transcript or balance notice. Include a wage and income transcript here if you have it.",
    ),
    applies: always,
  },
  {
    request: {
      code: "bank_statements",
      title: "Recent personal bank statements",
      detail: "Upload statements for each of the most recent three months.",
      required: true,
      maxFiles: 3,
    },
    applies: always,
  },
  {
    request: required("pay_stubs", "Recent pay stubs and W-2", "Upload your recent pay stubs and latest W-2."),
    applies: (answers) => answers.is_wage_earner === true,
  },
  {
    request: required("self_employment", "Self-employment records", "Upload a recent profit-and-loss report, business bank statements, and the applicable Schedule C, E, or F."),
    applies: (answers) => answers.is_self_employed === true,
  },
  {
    request: required("real_property", "Real-property records", "Upload a mortgage or HELOC statement if applicable, plus a property valuation or tax assessment."),
    applies: (answers) => answers.owns_home === true || answers.has_real_property === true,
  },
  {
    request: required("lease", "Lease agreement", "Upload your current residential lease agreement."),
    applies: (answers) => answers.owns_home === false && answers.rents_home === true,
  },
  {
    request: {
      code: "housing_utilities",
      title: "Recent utility statement",
      detail: "Optionally upload a recent utility statement for your residence.",
      required: false,
    },
    applies: (answers) => answers.owns_home === true
      || (answers.owns_home === false && answers.rents_home === true),
  },
  {
    request: required("vehicle", "Vehicle records", "Upload registration and a current valuation for each vehicle. Include a loan or lease statement only when one exists."),
    applies: (answers) => typeof answers.vehicle_count === "number" && answers.vehicle_count > 0,
  },
  {
    request: required("retirement", "Retirement-account records", "Upload recent retirement-account and retirement-loan statements."),
    applies: (answers) => answers.has_retirement_accounts === true,
  },
  {
    request: required("insurance", "Life-insurance records", "Upload a cash-value statement and any policy-loan statement."),
    applies: (answers) => answers.has_life_insurance_cash_value === true,
  },
  {
    request: required("investments", "Investment-account records", "Upload recent brokerage or investment-account statements."),
    applies: (answers) => answers.has_investment_accounts === true,
  },
  {
    request: required("bankruptcy", "Bankruptcy records", "Upload the bankruptcy petition and a current case-status document."),
    applies: (answers) => answers.in_open_bankruptcy === true,
  },
];

export function getDocumentRequests(answers: Answers): DocumentRequest[] {
  return documentRules.filter((rule) => rule.applies(answers)).map((rule) => rule.request);
}
