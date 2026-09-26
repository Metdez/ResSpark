// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

type SelectControl = HTMLElement & { value: string };

function clickButton(root: HTMLElement, label: string): void {
  const button = [...root.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.trim() === label);
  expect(button).toBeDefined();
  button!.click();
}

describe("intake interface", () => {
  afterEach(() => {
    sessionStorage.clear();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("resumes the next question after the page is recreated", () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);

    clickButton(root, "Get started");
    clickButton(root, "No");
    clickButton(root, "Continue");
    root.replaceChildren();
    createApp(root);

    expect(root.textContent).toContain("What state do you live in?");
    expect(root.textContent).not.toContain("A calmer way to begin your tax resolution review.");
  });

  it("starts a new questionnaire and preserves an answer when navigating back", () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);

    clickButton(root, "Get started");
    clickButton(root, "Yes");
    clickButton(root, "Continue");
    clickButton(root, "Back");

    expect(root.textContent).toContain("Are you married?");
    expect(root.querySelector(".answer-option.is-selected")?.textContent).toContain("Yes");
  });

  it("moves keyboard focus to the next question after continuing", () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);

    clickButton(root, "Get started");
    clickButton(root, "No");
    clickButton(root, "Continue");

    expect(document.activeElement).toBe(root.querySelector("#question-title"));
    expect(root.querySelector("#question-title")?.textContent).toContain("What state do you live in?");
    expect(root.querySelector("#answer")?.tagName).toBe("MD-OUTLINED-SELECT");
    expect(root.textContent).not.toContain("One question at a time");
  });

  it("discards an in-progress questionnaire when Save and exit is confirmed", () => {
    const root = document.createElement("main");
    document.body.append(root);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    createApp(root);

    clickButton(root, "Get started");
    clickButton(root, "Yes");
    clickButton(root, "Save and exit");

    expect(root.textContent).toContain("A calmer way to begin your tax resolution review.");
    expect(root.textContent).not.toContain("Are you married?");
  });

  it("shows counties for the selected state and clears the county when the state changes", () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);

    clickButton(root, "Get started");
    clickButton(root, "No");
    clickButton(root, "Continue");
    const state = root.querySelector<SelectControl>("#answer");
    state!.value = "Florida";
    clickButton(root, "Continue");
    const county = root.querySelector<SelectControl>("#answer");
    const countyValues = [...county!.querySelectorAll("md-select-option")].map((option) => option.getAttribute("value"));
    expect(countyValues).toContain("Miami-Dade County");
    expect(countyValues).not.toContain("Los Angeles County");
    county!.value = "Washington County";
    clickButton(root, "Continue");
    clickButton(root, "Back");
    clickButton(root, "Back");
    root.querySelector<SelectControl>("#answer")!.value = "Alabama";
    clickButton(root, "Continue");

    expect(root.querySelector<SelectControl>("#answer")?.value).toBe("");
  });

  it("moves from questionnaire answers through targeted documents to a mock result", async () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);
    clickButton(root, "Get started");

    for (let step = 0; step < 26 && !root.textContent?.includes("Upload the documents that apply to you."); step += 1) {
      const choice = root.querySelector<HTMLButtonElement>(".answer-option");
      if (choice) {
        choice.click();
      } else {
        const field = root.querySelector<HTMLInputElement | SelectControl>("#answer");
        expect(field).toBeDefined();
        if (field?.tagName === "MD-OUTLINED-SELECT") {
          const select = field as SelectControl;
          select.value = select.querySelectorAll("md-select-option")[1].getAttribute("value")!;
        } else {
          const input = field as HTMLInputElement;
          input.value = input.inputMode === "decimal" ? "12345.67" : input.type === "text" ? "Miami-Dade" : "1";
          input.dispatchEvent(new Event("blur"));
          if (input.inputMode === "decimal") expect(input.value).toBe("$12,345.67");
        }
      }
      clickButton(root, "Continue");
    }

    expect(root.textContent).toContain("Upload the documents that apply to you.");
    expect(root.textContent).toContain("IRS account transcript");
    expect(root.textContent).toContain("Recent personal bank statements");
    expect(root.textContent).not.toContain("resolution recommendation");

    root.querySelectorAll<HTMLElement>("[data-document-request]").forEach((request) => {
      if (!request.querySelector('[aria-label="required"]')) return;
      const inputs = request.querySelectorAll<HTMLInputElement>('.file-input[data-required="true"]');
      inputs.forEach((input, index) => {
        const code = input.dataset.documentCode!;
        const suffix = inputs.length > 1 ? `-${index + 1}` : "";
        Object.defineProperty(input, "files", {
          configurable: true,
          value: [new File([code], `${code}${suffix}.pdf`, { type: "application/pdf" })],
        });
        input.dispatchEvent(new Event("change"));
      });
    });
    clickButton(root, "Continue");

    await vi.waitFor(() => expect(root.textContent).toContain("Uploaded documents"));
    expect(root.textContent).toContain("compliance step first");
    root.querySelector<HTMLButtonElement>('[data-result-view="documents"]')!.click();
    expect(root.textContent).toContain("irs_transcripts.pdf");
  });

  it("uses saved questionnaire answers to select the document list", () => {
    sessionStorage.setItem("resspark.intake.v1", JSON.stringify({
      answers: {
        is_self_employed: true,
        vehicle_count: 0,
        has_retirement_accounts: true,
        owns_home: false,
        rents_home: true,
      },
      step: 0,
      screen: "documents",
    }));
    const root = document.createElement("main");
    document.body.append(root);

    createApp(root);

    expect(root.querySelector('[data-document-request="self_employment"]')).not.toBeNull();
    expect(root.querySelector('[data-document-request="retirement"]')).not.toBeNull();
    expect(root.querySelector('[data-document-request="vehicle"]')).toBeNull();
    expect(root.querySelector('[data-document-request="lease"]')).not.toBeNull();
    expect(root.querySelector('[data-document-request="housing_utilities"]')?.textContent).toContain("Optional");
  });
});
