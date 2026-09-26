import { describe, expect, it } from "vitest";

import { getDocumentRequests } from "./requests";

describe("document request selection", () => {
  it("always requests IRS and bank documents", () => {
    expect(getDocumentRequests({}).map((request) => request.code)).toEqual([
      "irs_transcripts",
      "bank_statements",
      "health_insurance_statement",
    ]);
  });

  it("adds only example-backed documents that match the answers", () => {
    const requests = getDocumentRequests({
      is_wage_earner: true,
      owns_home: false,
      rents_home: true,
      vehicle_count: 2,
      has_retirement_accounts: true,
    });

    expect(requests.map((request) => request.code)).toEqual([
      "irs_transcripts",
      "bank_statements",
      "pay_stubs",
      "lease_statement",
      "auto_loan_statement",
      "health_insurance_statement",
    ]);
  });
});
