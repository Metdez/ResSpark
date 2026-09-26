// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSandboxCase, sandboxOutcomes } from "./model";
import { renderResolutionResults } from "./screen";

describe("resolution results sandbox", () => {
  afterEach(() => document.body.replaceChildren());

  it("navigates from the overview to each focused result view", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const result = createSandboxCase(
      { total_tax_owed: 42_000, all_returns_filed: true },
      [{ category: "irs_transcripts", categoryLabel: "IRS transcript", name: "account-transcript.pdf", type: "application/pdf", size: 12_800 }],
    );

    renderResolutionResults(root, { result, onStartOver: vi.fn() });

    expect(root.textContent).toContain("You may qualify for Simple payment plan.");
    expect(root.textContent).toContain("Selected resolution");
    expect(root.querySelectorAll("[data-result-view]")).toHaveLength(4);
    expect(root.querySelectorAll("#outcome-preview md-select-option")).toHaveLength(sandboxOutcomes.length);

    root.querySelector<HTMLButtonElement>('[data-result-view="resolution"]')!.click();
    expect(root.textContent).toContain("Resolution details");
    expect(root.textContent).toContain("Total assessed balance is $50,000 or less");
    expect(document.activeElement?.id).toBe("view-title");

    root.querySelector<HTMLButtonElement>("[data-back-overview]")!.click();
    root.querySelector<HTMLButtonElement>('[data-result-view="finances"]')!.click();
    expect(root.textContent).toContain("Monthly household income");
    expect(root.textContent).toContain("Monthly household expenses");

    root.querySelector<HTMLButtonElement>("[data-back-overview]")!.click();
    root.querySelector<HTMLButtonElement>('[data-result-view="documents"]')!.click();
    expect(root.textContent).toContain("account-transcript.pdf");

    root.querySelector<HTMLButtonElement>("[data-back-overview]")!.click();
    root.querySelector<HTMLButtonElement>('[data-result-view="case-data"]')!.click();
    expect(root.textContent).toContain("Structured financial data");
    expect(root.textContent).toContain("$42,000");

    root.querySelector<HTMLButtonElement>("[data-back-overview]")!.click();
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

    root.querySelector<HTMLButtonElement>('[data-result-view="documents"]')!.click();
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=alert(1)>.pdf");
  });
});
