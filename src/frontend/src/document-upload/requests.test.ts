import { describe, expect, it } from "vitest";

import { getDocumentRequests } from "./requests";

describe("document request selection", () => {
  it("requests only the universal documents without matching answers", () => {
    const requests = getDocumentRequests({});

    expect(requests.map((request) => request.code)).toEqual([
      "irs_transcripts",
      "bank_statements",
    ]);
    expect(requests.find((request) => request.code === "bank_statements")).toMatchObject({
      required: true,
      maxFiles: 3,
    });
  });

  it("adds each document category whose answer makes it applicable", () => {
    const requests = getDocumentRequests({
      is_wage_earner: true,
      is_self_employed: true,
      owns_home: false,
      has_real_property: true,
      rents_home: true,
      vehicle_count: 2,
      has_retirement_accounts: true,
      has_life_insurance_cash_value: true,
      has_investment_accounts: true,
      in_open_bankruptcy: true,
    });

    expect(requests.map((request) => request.code)).toEqual([
      "irs_transcripts",
      "bank_statements",
      "pay_stubs",
      "self_employment",
      "real_property",
      "lease",
      "housing_utilities",
      "vehicle",
      "retirement",
      "insurance",
      "investments",
      "bankruptcy",
    ]);
  });

  it.each([
    ["no wage income", { is_wage_earner: false }, "pay_stubs"],
    ["no self-employment", { is_self_employed: false }, "self_employment"],
    ["no real property", { owns_home: false, has_real_property: false }, "real_property"],
    ["no rent", { owns_home: false, rents_home: false }, "lease"],
    ["stale rent answer for a homeowner", { owns_home: true, rents_home: true }, "lease"],
    ["zero vehicles", { vehicle_count: 0 }, "vehicle"],
    ["no retirement account", { has_retirement_accounts: false }, "retirement"],
    ["no cash-value insurance", { has_life_insurance_cash_value: false }, "insurance"],
    ["no investments", { has_investment_accounts: false }, "investments"],
    ["no open bankruptcy", { in_open_bankruptcy: false }, "bankruptcy"],
  ])("does not request documents for %s", (_label, answers, code) => {
    expect(getDocumentRequests(answers).map((request) => request.code)).not.toContain(code);
  });

  it.each([
    ["homeowner", { owns_home: true }, ["real_property", "housing_utilities"]],
    ["renter", { owns_home: false, rents_home: true }, ["lease", "housing_utilities"]],
    ["neither", { owns_home: false, rents_home: false }, []],
  ])("keeps lease and utilities separate for a %s", (_label, answers, housingCodes) => {
    const housingRequests = getDocumentRequests(answers)
      .filter((request) => ["real_property", "lease", "housing_utilities"].includes(request.code));

    expect(housingRequests.map((request) => request.code)).toEqual(housingCodes);
    if (housingCodes.includes("housing_utilities")) {
      expect(housingRequests.find((request) => request.code === "housing_utilities")?.required).toBe(false);
    }
    if (housingCodes.includes("lease")) {
      expect(housingRequests.find((request) => request.code === "lease")?.required).toBe(true);
    }
  });
});
