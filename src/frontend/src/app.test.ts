// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

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
    expect(root.querySelector("#answer")).toBeInstanceOf(HTMLSelectElement);
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
    const state = root.querySelector<HTMLSelectElement>("#answer");
    state!.value = "Florida";
    clickButton(root, "Continue");
    const county = root.querySelector<HTMLSelectElement>("#answer");
    expect([...county!.options].some((option) => option.value === "Miami-Dade County")).toBe(true);
    expect([...county!.options].some((option) => option.value === "Los Angeles County")).toBe(false);
    county!.value = "Washington County";
    clickButton(root, "Continue");
    clickButton(root, "Back");
    clickButton(root, "Back");
    root.querySelector<HTMLSelectElement>("#answer")!.value = "Alabama";
    clickButton(root, "Continue");

    expect(root.querySelector<HTMLSelectElement>("#answer")?.value).toBe("");
  });

  it("moves from the questionnaire to the targeted document upload screen", () => {
    const root = document.createElement("main");
    document.body.append(root);
    createApp(root);
    clickButton(root, "Get started");

    for (let step = 0; step < 26 && !root.textContent?.includes("Upload the documents that apply to you."); step += 1) {
      const choice = root.querySelector<HTMLButtonElement>(".answer-option");
      if (choice) {
        choice.click();
      } else {
        const field = root.querySelector<HTMLInputElement | HTMLSelectElement>("#answer");
        expect(field).toBeDefined();
        if (field instanceof HTMLSelectElement) {
          field.value = field.options[1].value;
        } else {
          field!.value = field!.inputMode === "decimal" ? "12345.67" : field!.type === "text" ? "Miami-Dade" : "1";
          field!.dispatchEvent(new Event("blur"));
          if (field!.inputMode === "decimal") expect(field!.value).toBe("$12,345.67");
        }
      }
      clickButton(root, "Continue");
    }

    expect(root.textContent).toContain("Upload the documents that apply to you.");
    expect(root.textContent).toContain("IRS account transcript");
    expect(root.textContent).toContain("Recent personal bank statements");
    expect(root.textContent).not.toContain("resolution recommendation");
  });
});
