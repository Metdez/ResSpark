// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResolutionCaseResult } from "./model";
import { renderResolutionResults } from "./screen";

const result = (documentName = "account-transcript.pdf"): ResolutionCaseResult => ({
  caseLabel: "Tax resolution screening",
  generatedAt: "2026-09-26T12:00:00Z",
  outcome: {
    id: "simple_plan",
    path: "Simple Payment Plan",
    shortLabel: "Simple payment plan",
    status: "potential_match",
    reason: "The available data supports this possible path.",
    nextStep: "Professional review.",
    requirements: ["Total assessed balance is $50,000 or less"],
    monthlyIncome: 1,
    monthlyExpenses: 1,
    netDisposableIncome: 0,
    netRealizableEquity: 0,
    suggestedOfferOrPayment: 0,
    reviewNotes: [],
  },
  documents: [{ category: "irs_transcripts", categoryLabel: "IRS transcript", name: documentName, type: "application/pdf", size: 12_800 }],
  financialSections: [{
    id: "compliance",
    title: "Compliance & liability",
    description: "Eligibility facts.",
    fields: [
      { key: "total_tax_owed", label: "Total tax owed", value: 42_000, format: "currency" },
      { key: "cash_and_bank_balances", label: "Cash", value: 578.81, format: "currency" },
    ],
  }],
});

describe("resolution results", () => {
  afterEach(() => document.body.replaceChildren());

  it("shows the API result, case data, and documents", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderResolutionResults(root, { result: result(), onStartOver: vi.fn() });

    expect(root.textContent).toContain("Your screening result is Simple payment plan.");
    expect(root.querySelector(".result-path-highlight")?.textContent).toBe("Simple payment plan");
    const resolutionDetails = root.querySelector<HTMLDetailsElement>(".resolution-details")!;
    expect(resolutionDetails.open).toBe(false);
    resolutionDetails.querySelector("summary")!.click();
    expect(resolutionDetails.open).toBe(true);
    expect(resolutionDetails.textContent).toContain("Total assessed balance is $50,000 or less");
    expect(root.querySelector(".case-data-section")?.textContent).toContain("$42,000.00");
    expect(root.querySelector(".case-data-section")?.textContent).toContain("$578.81");
    expect(root.querySelector(".needed-documents")).toBeNull();
    expect(root.querySelector(".documents-section")?.textContent).toContain("account-transcript.pdf");
    expect(root.querySelector(".scenario-control")).toBeNull();
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("names the files that would allow a recommendation", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const pending = result();
    pending.outcome = { ...pending.outcome, id: "manual_payment", path: "Information still needed", shortLabel: "More information needed", status: "manual_review" };
    pending.neededDocuments = [{ title: "Vehicle records", detail: "Upload registration and a current valuation for each vehicle." }];
    renderResolutionResults(root, { result: pending, onStartOver: vi.fn() });

    const needed = root.querySelector(".needed-documents");
    expect(needed?.textContent).toContain("Upload these to get a recommendation");
    expect(needed?.textContent).toContain("Vehicle records");
    expect(needed?.textContent).toContain("current valuation");
    expect(root.querySelector(".case-data-section")).not.toBeNull();
  });

  it("escapes document names before adding them to the page", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderResolutionResults(root, { result: result("<img src=x onerror=alert(1)>.pdf"), onStartOver: vi.fn() });

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>.pdf");
  });
});
