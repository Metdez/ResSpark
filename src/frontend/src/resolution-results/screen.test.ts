// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSandboxCase, sandboxOutcomes } from "./model";
import { renderResolutionResults } from "./screen";

describe("resolution results sandbox", () => {
  afterEach(() => document.body.replaceChildren());

  it("renders all determination paths, uploaded documents, and structured financial data", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const result = createSandboxCase(
      { total_tax_owed: 42_000, all_returns_filed: true },
      [{ category: "irs_transcripts", categoryLabel: "IRS transcript", name: "account-transcript.pdf", type: "application/pdf", size: 12_800 }],
    );

    renderResolutionResults(root, { result, onStartOver: vi.fn() });

    expect(root.textContent).toContain("You may qualify for Simple payment plan.");
    expect(root.textContent).toContain("Selected resolution");
    expect(root.querySelector(".requirements-panel summary")?.textContent).toContain("View requirements");
    expect(root.textContent).toContain("Total assessed balance is $50,000 or less");
    expect(root.textContent).toContain("account-transcript.pdf");
    expect(root.textContent).toContain("Structured financial data");
    expect(root.textContent).toContain("$42,000");
    expect(root.querySelectorAll<HTMLSelectElement>("#outcome-preview option")).toHaveLength(sandboxOutcomes.length);

    const preview = root.querySelector<HTMLSelectElement>("#outcome-preview")!;
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
