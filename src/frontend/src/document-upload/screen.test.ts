// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(onComplete).not.toHaveBeenCalled();

    const input = root.querySelector<HTMLInputElement>('[data-document-code="irs_transcripts"]')!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["transcript"], "IRS_Account_Transcript.pdf", { type: "application/pdf" })],
    });
    input.dispatchEvent(new Event("change"));

    expect(root.querySelector('[data-file-list="irs_transcripts"]')?.textContent)
      .toContain("IRS_Account_Transcript.pdf");
  });
});
