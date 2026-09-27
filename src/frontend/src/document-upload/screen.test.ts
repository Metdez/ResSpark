// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SelectedDocument } from "../case-processing";
import { renderDocumentUpload } from "./screen";

describe("document upload screen", () => {
  afterEach(() => document.body.replaceChildren());

  it("shows Plaid and Gusto connection options above document upload", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete: vi.fn() });

    const connections = root.querySelector(".account-connections")!;
    expect(connections.textContent).toContain("Connect your bank account with Plaid");
    expect(connections.textContent).toContain("Connect to payroll with Gusto");
    expect(connections.querySelectorAll("img")).toHaveLength(2);
  });

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

    expect(root.querySelector('[data-document-request="irs_transcripts"] [data-slot-file="files"]')?.textContent)
      .toContain("IRS_Account_Transcript.pdf");
    expect(root.querySelector('[data-document-request="irs_transcripts"] [data-slot-file="files"]')?.classList)
      .toContain("is-uploaded");
    expect(root.querySelector('[data-request-status="irs_transcripts"]')?.textContent).toBe("Complete");
    expect(root.querySelector('[data-request-status="irs_transcripts"]')?.classList).toContain("is-complete");

    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("sorts bulk uploads and counts recognized files toward required documents", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onComplete = vi.fn();
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete });
    const input = root.querySelector<HTMLInputElement>(".quick-upload-input")!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [
        new File(["IRS"], "IRS_Account_Transcript.pdf"),
        new File(["bank"], "Bank_Statement_March.pdf"),
        new File(["misc"], "supporting-note.pdf"),
      ],
    });
    input.dispatchEvent(new Event("change"));

    expect(root.querySelector(".sorted-file-list")?.textContent).toContain("IRS account transcript");
    expect(root.querySelector(".sorted-file-list")?.textContent).toContain("Recent personal bank statements");
    expect(root.querySelector(".sorted-file-list")?.textContent).toContain("Other documents");
    expect(root.querySelector('[data-request-status="irs_transcripts"]')?.textContent).toBe("Complete");
    expect(root.querySelector('[data-request-status="bank_statements"]')?.textContent).toBe("Complete");

    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).toHaveBeenCalledOnce();
    expect((onComplete.mock.calls[0][0] as SelectedDocument[]).map((document) => document.category))
      .toEqual(["irs_transcripts", "bank_statements", "other"]);
  });

  it("accepts files dropped anywhere in the quick-upload zone", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete: vi.fn() });
    const zone = root.querySelector<HTMLElement>(".quick-upload")!;
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", {
      value: { files: [new File(["bank"], "checking-account-statement.pdf")] },
    });

    zone.dispatchEvent(drop);

    expect(drop.defaultPrevented).toBe(true);
    expect(root.querySelector(".sorted-file-list")?.textContent).toContain("checking-account-statement.pdf");
    expect(root.querySelector('[data-request-status="bank_statements"]')?.textContent).toBe("Complete");
  });

  it("opens the file picker when the quick-upload zone is clicked", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete: vi.fn() });
    const input = root.querySelector<HTMLInputElement>(".quick-upload-input")!;
    const openPicker = vi.spyOn(input, "click");

    root.querySelector<HTMLElement>(".quick-upload")!.click();

    expect(openPicker).toHaveBeenCalledOnce();
  });

  it("requires one bank statement and offers two optional slots", () => {
    const root = document.createElement("main");
    document.body.append(root);
    const onComplete = vi.fn();
    renderDocumentUpload(root, { answers: {}, onBack: vi.fn(), onComplete });
    const request = root.querySelector<HTMLElement>('[data-document-request="bank_statements"]')!;
    const inputs = [...request.querySelectorAll<HTMLInputElement>('[data-document-code="bank_statements"]')];
    const labels = [...request.querySelectorAll<HTMLLabelElement>(".upload-button")]
      .map((label) => label.textContent?.trim());

    expect(inputs).toHaveLength(3);
    expect(labels).toEqual(["Choose file", "Optional file 1", "Optional file 2"]);

    Object.defineProperty(inputs[0], "files", {
      configurable: true,
      value: [new File(["January"], "Bank_January.pdf", { type: "application/pdf" })],
    });
    inputs[0].dispatchEvent(new Event("change"));

    expect(inputs.every((input) => input.multiple === false)).toBe(true);
    expect(request.textContent).toContain("Complete");
    expect(request.querySelector('[data-slot-file="primary"]')?.textContent).toContain("Bank_January.pdf");
    expect(request.querySelector('[data-slot-file="optional-1"]')?.textContent).toBe("No file selected.");

    const transcript = root.querySelector<HTMLInputElement>('[data-document-code="irs_transcripts"]')!;
    Object.defineProperty(transcript, "files", { configurable: true, value: [new File(["IRS"], "irs.pdf")] });
    transcript.dispatchEvent(new Event("change"));
    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).toHaveBeenCalledOnce();
    expect((onComplete.mock.calls[0][0] as SelectedDocument[]).map((document) => document.file.name))
      .toEqual(["irs.pdf", "Bank_January.pdf"]);
  });

  it("renders a required and optional upload for each vehicle", () => {
    const root = document.createElement("main");
    document.body.append(root);
    renderDocumentUpload(root, { answers: { vehicle_count: 2 }, onBack: vi.fn(), onComplete: vi.fn() });

    const request = root.querySelector<HTMLElement>('[data-document-request="vehicle"]')!;
    expect(request.querySelectorAll(".vehicle-upload-group")).toHaveLength(2);
    expect([...request.querySelectorAll(".vehicle-upload-group h3")].map((heading) => heading.textContent)).toEqual(["Vehicle 1", "Vehicle 2"]);
    expect(request.querySelectorAll<HTMLInputElement>('[data-required="true"]')).toHaveLength(2);
    expect(request.querySelectorAll<HTMLInputElement>('[data-required="false"]')).toHaveLength(2);
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
    selectFile("housing_utilities");

    expect(root.querySelector('[data-document-request="lease"]')?.textContent).toContain("Complete");
    expect(root.querySelector('[data-request-status="housing_utilities"]')?.textContent).toBe("Uploaded");
    root.querySelector<HTMLButtonElement>(".primary-button")!.click();
    expect(onComplete).toHaveBeenCalledOnce();
    const documents = onComplete.mock.calls[0][0] as SelectedDocument[];
    expect(documents.find((document) => document.category === "lease")?.file)
      .toBeInstanceOf(File);
  });
});
