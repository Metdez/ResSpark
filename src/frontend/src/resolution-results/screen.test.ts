// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSandboxCase, sandboxOutcomes } from "./model";
import { renderResolutionResults } from "./screen";

describe("resolution results sandbox", () => {
  afterEach(() => document.body.replaceChildren());

  it("shows resolution details, full case data, documents, then preview options", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const result = createSandboxCase(
      { total_tax_owed: 42_000, all_returns_filed: true },
      [{ category: "irs_transcripts", categoryLabel: "IRS transcript", name: "account-transcript.pdf", type: "application/pdf", size: 12_800 }],
    );

    renderResolutionResults(root, { result, onStartOver: vi.fn() });

    expect(root.textContent).toContain("Your screening result is Simple payment plan.");
    expect(root.querySelector(".result-path-highlight")?.textContent).toBe("Simple payment plan");
    const resolutionDetails = root.querySelector<HTMLDetailsElement>(".resolution-details")!;
    expect(resolutionDetails.open).toBe(false);
    resolutionDetails.querySelector("summary")!.click();
    expect(resolutionDetails.open).toBe(true);
    expect(resolutionDetails.textContent).toContain("Total assessed balance is $50,000 or less");
    expect(resolutionDetails.textContent).not.toContain("Recommended next step");
    expect(resolutionDetails.textContent).not.toContain("not an IRS decision");

    const caseData = root.querySelector(".case-data-section")!;
    const documents = root.querySelector(".documents-section")!;
    const previewControl = root.querySelector(".scenario-control")!;
    expect(caseData.textContent).toContain("Full case data");
    expect(caseData.textContent).toContain("$42,000");
    expect(documents.textContent).toContain("account-transcript.pdf");
    expect(caseData.compareDocumentPosition(documents) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(documents.compareDocumentPosition(previewControl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(root.querySelectorAll("#outcome-preview md-select-option")).toHaveLength(sandboxOutcomes.length);
    expect(root.querySelectorAll("[data-result-view]")).toHaveLength(0);

    const preview = root.querySelector<HTMLElement & { value: string }>("#outcome-preview")!;
    preview.value = "blocked";
    preview.dispatchEvent(new Event("change"));
    expect(root.textContent).toContain("Your case needs a compliance step first.");
    expect(document.activeElement?.id).toBe("results-title");
  });

  it("escapes document names before adding them to the page", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const result = createSandboxCase({}, [
      { category: "irs_transcripts", categoryLabel: "IRS transcript", name: "<img src=x onerror=alert(1)>.pdf", type: "application/pdf", size: 5 },
    ]);

    renderResolutionResults(root, { result, onStartOver: vi.fn() });

    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>.pdf");
  });
});
