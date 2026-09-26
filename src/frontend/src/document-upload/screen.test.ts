// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelectedDocument } from "../case-processing";
import { renderDocumentUpload } from "./screen";

describe("document upload screen", () => {
  afterEach(() => document.body.replaceChildren());

  it("lists selected files and blocks progress until required uploads are selected", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onComplete = vi.fn();
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete });

    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(root.querySelector(".error-message")?.textContent).toContain("IRS account transcript");
    expect(root.querySelector(".error-message")?.textContent).toContain("bank statements");
    expect(onComplete).not.toHaveBeenCalled();

    const input = root.querySelector<HTMLInputElement>('[data-document-code="irs_transcripts"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["transcript"], "IRS_Account_Transcript.pdf", { type: "application/pdf" })],
    });
    input.dispatchEvent(new Event("change"));

    expect(root.querySelector('[data-file-list="irs_transcripts"]')?.textContent)
      .toContain("IRS_Account_Transcript.pdf");

    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("requires three monthly bank statements", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onComplete = vi.fn();
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete });
    const request = root.querySelector<HTMLElement>('[data-document-request="bank_statements"]')!;
    const inputs = [...request.querySelectorAll<HTMLInputElement>('[data-document-code="bank_statements"]')];
    const labels = [...request.querySelectorAll<HTMLLabelElement>(".upload-button")]
      .map((label) => label.textContent?.trim());

    expect(inputs).toHaveLength(3);
    expect(labels).toEqual(["Statement 1", "Statement 2", "Statement 3"]);

    ["Bank_January.pdf", "Bank_February.pdf", "Bank_March.pdf"].forEach((name, index) => {
      Object.defineProperty(inputs[index], "files", {
        configurable: true,
        value: [new File([name], name, { type: "application/pdf" })],
      });
      inputs[index].dispatchEvent(new Event("change"));
    });

    expect(inputs.every((input) => input.multiple === false)).toBe(true);
    expect(request.textContent).toContain("Required");
    expect(root.querySelector('[data-file-list="bank_statements"]')?.textContent).toContain("Bank_January.pdf");
    expect(root.querySelector('[data-file-list="bank_statements"]')?.textContent).toContain("Bank_February.pdf");
    expect(root.querySelector('[data-file-list="bank_statements"]')?.textContent).toContain("Bank_March.pdf");

    Object.defineProperty(inputs[2], "files", { configurable: true, value: [] });
    inputs[2].dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("renders only document categories selected by the answers", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderDocumentUpload(root, {
      answers: { is_self_employed: true, vehicle_count: 0, has_investment_accounts: false },
      onBack: vi.fn(),
      onComplete: vi.fn(),
    });

    expect(root.querySelector('[data-document-request="self_employment"]')).not.toBeNull();
    expect(root.querySelector('[data-document-request="vehicle"]')).toBeNull();
    expect(root.querySelector('[data-document-request="investments"]')).toBeNull();
    expect(root.querySelector('[data-document-request="health_insurance_statement"]')).toBeNull();
  });

  it("does not require the separate utility upload for a renter", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onComplete = vi.fn();
    renderDocumentUpload(root, {
      answers: { owns_home: false, rents_home: true },
      onBack: vi.fn(),
      onComplete,
    });

    const selectFile = (code: string, index = 0) => {
      const input = root.querySelectorAll<HTMLInputElement>(`[data-document-code="${code}"]`)[index]!;
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([code], `${code}.pdf`, { type: "application/pdf" })],
      });
      input.dispatchEvent(new Event("change"));
    };
    selectFile("irs_transcripts");
    root.querySelectorAll<HTMLInputElement>('[data-document-code="bank_statements"]')
      .forEach((_, index) => selectFile("bank_statements", index));
    selectFile("lease");

    expect(root.querySelector('[data-document-request="lease"]')?.textContent).toContain("Required");
    expect(root.querySelector('[data-document-request="housing_utilities"]')?.textContent).toContain("Optional");
    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).toHaveBeenCalledOnce();
    const documents = onComplete.mock.calls[0][0] as SelectedDocument[];
    expect(documents.find((document) => document.category === "lease")?.file)
      .toBeInstanceOf(File);
  });
});
