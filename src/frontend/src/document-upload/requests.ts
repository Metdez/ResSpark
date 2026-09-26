import type { Answers } from "../questions";

export interface DocumentRequest {
  code: string;
  title: string;
  detail: string;
  required: boolean;
}

const required = (code: string, title: string, detail: string): DocumentRequest => ({
  code,
  title,
  detail,
  required: true,
});

export function getDocumentRequests(answers: Answers): DocumentRequest[] {
  const requests = [
    required(
      "irs_transcripts",
      "IRS account transcript",
      "Upload an IRS account transcript or balance notice. Include a wage and income transcript here if you have it.",
    ),
    required(
      "bank_statements",
      "Recent personal bank statements",
      "Upload statements for the most recent three months.",
    ),
  ];

  if (answers.is_wage_earner === true) {
    requests.push(required("pay_stubs", "Recent pay stub", "Upload your most recent pay stub."));
  }
  if (answers.owns_home === true || answers.has_real_property === true) {
    requests.push(required("mortgage_statement", "Mortgage statement", "Upload your most recent mortgage statement."));
  } else if (answers.rents_home === true) {
    requests.push(required("lease_statement", "Lease statement", "Upload your current lease statement."));
  }
  if (typeof answers.vehicle_count === "number" && answers.vehicle_count > 0) {
    requests.push(required("auto_loan_statement", "Auto loan statement", "Upload the most recent statement for each vehicle loan or lease."));
  }

  // This packet type is present in every supplied example, but the current
  // questionnaire does not establish whether a taxpayer has coverage.
  requests.push({
    code: "health_insurance_statement",
    title: "Health insurance statement",
    detail: "Upload a recent statement if you have health insurance coverage.",
    required: false,
  });

  return requests;
}
