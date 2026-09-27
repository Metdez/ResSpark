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
    monthlyIncome: 4_200,
    monthlyExpenses: 2_000,
    netDisposableIncome: 2_200,
    netRealizableEquity: 578.81,
    suggestedOfferOrPayment: 700,
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
  sourceOfTruth: {
    fieldSections: [{
      id: "compliance",
      title: "Compliance & liability",
      description: "Eligibility facts.",
      fields: [{
        key: "total_tax_owed",
        label: "Total tax owed",
        value: 42_000,
        format: "currency",
        sources: [{ kind: "document", label: documentName, documentName, snippet: "ACCOUNT BALANCE: $42,000.00" }],
      }, {
        key: "tax_only_balance",
        label: "Tax only balance",
        value: null,
        format: "currency",
        sources: [{ kind: "unknown", label: "Not provided" }],
      }],
    }],
    calculationSections: [{
      id: "decision",
      title: "Resolution decision checks",
      description: "Checks evaluated in order.",
      steps: [{
        label: "Simple Payment Plan",
        formula: "Balance is $50,000 or less and pays by the CSED.",
        inputs: [{ label: "Payment", value: 700 }],
        inputKeys: ["total_tax_owed"],
        result: "Matched",
        format: "text",
        status: "matched",
      }],
    }],
    documentEvidence: [{
      name: documentName,
      category: "irs_transcripts",
      categoryLabel: "IRS transcript",
      detectedType: "IRS account transcript",
      status: "parsed",
      error: null,
      fields: [{
        key: "total_tax_owed",
        label: "Total tax owed",
        value: 42_000,
        format: "currency",
        usedInCanonical: true,
        snippet: "ACCOUNT BALANCE: $42,000.00",
      }],
    }],
  },
});

describe("resolution results", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("shows the organized result, metrics, case data, and documents", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderResolutionResults(root, { result: result(), onStartOver: vi.fn() });

    expect(root.textContent).toContain("Your screening result is Simple payment plan.");
    expect(root.textContent).toContain("How the case measures up");
    expect(root.querySelector(".result-path-highlight")?.textContent).toBe("Simple payment plan");
    const reviewDetails = root.querySelector<HTMLDetailsElement>(".requirements-panel")!;
    reviewDetails.querySelector("summary")!.click();
    expect(reviewDetails.textContent).toContain("Total assessed balance is $50,000 or less");
    expect(root.querySelector(".case-data-section")?.textContent).toContain("$42,000.00");
    expect(root.querySelector(".documents-section")?.textContent).toContain("account-transcript.pdf");
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("opens the source of truth and shows formulas, canonical keys, and source excerpts", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderResolutionResults(root, { result: result(), onStartOver: vi.fn() });

    root.querySelector<HTMLButtonElement>("[data-show-truth]")!.click();

    expect(root.textContent).toContain("Math and decision logic");
    expect(root.textContent).toContain("Complete Form 433-A data");
    expect(root.textContent).toContain("total_tax_owed");
    expect(root.textContent).toContain("ACCOUNT BALANCE: $42,000.00");
    expect(root.textContent).toContain("Not provided");
    expect(document.activeElement?.id).toBe("truth-title");

    root.querySelector<HTMLButtonElement>("[data-back-overview]")!.click();
    expect(root.textContent).toContain("Organized financial profile");
  });

  it("previews and downloads the original session PDF and revokes its URL", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:account-transcript");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const file = new File(["transcript"], "account-transcript.pdf", { type: "application/pdf" });
    const onStartOver = vi.fn();
    const root = document.createElement("main");
    document.body.append(root);

    renderResolutionResults(root, {
      result: result(),
      localDocuments: [{ category: "irs_transcripts", categoryLabel: "IRS transcript", file }],
      onStartOver,
    });

    expect(root.querySelector("object")?.getAttribute("data")).toBe("blob:account-transcript");
    expect(root.querySelector<HTMLAnchorElement>("a[download]")?.download).toBe("account-transcript.pdf");
    root.querySelector<HTMLButtonElement>("[data-start-over]")!.click();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:account-transcript");
    expect(onStartOver).toHaveBeenCalledOnce();
  });

  it("names the files that would allow a recommendation", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const pending = result();
    pending.outcome = { ...pending.outcome, id: "manual_payment", path: "Information still needed", shortLabel: "More information needed", status: "manual_review" };
    pending.neededDocuments = [{ title: "Vehicle records", detail: "Upload registration and a current valuation for each vehicle." }];
    renderResolutionResults(root, { result: pending, onStartOver: vi.fn() });

    expect(root.querySelector(".needed-documents")?.textContent).toContain("Vehicle records");
    expect(root.querySelector(".needed-documents")?.textContent).toContain("current valuation");
  });

  it("escapes document names and evidence snippets before adding them to the page", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const unsafe = result("<img src=x onerror=alert(1)>.pdf");
    unsafe.sourceOfTruth.documentEvidence[0].fields[0].snippet = "<script>alert(1)</script>";
    renderResolutionResults(root, { result: unsafe, onStartOver: vi.fn() });
    root.querySelector<HTMLButtonElement>("[data-show-truth]")!.click();

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).toContain("<script>alert(1)</script>");
  });
});
