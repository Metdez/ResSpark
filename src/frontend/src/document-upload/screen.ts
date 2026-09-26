import type { Answers } from "../questions";
import { getDocumentRequests } from "./requests";

export interface DocumentUploadScreenOptions {
  answers: Answers;
  onBack: () => void;
  onComplete: (documents: UploadedDocument[]) => void;
}

export interface UploadedDocument {
  category: string;
  categoryLabel: string;
  name: string;
  type: string;
  size: number;
}

const acceptedDocumentTypes = ".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic";

export function renderDocumentUpload(root: HTMLElement, options: DocumentUploadScreenOptions): void {
  const requests = getDocumentRequests(options.answers);
  const uploads = new Map<string, File[]>();

  root.innerHTML = `
    <main class="intake-shell document-shell">
      <header class="app-header">
        <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
      </header>
      <section class="progress-region" aria-label="Intake progress">
        <div class="progress-label">Documents <span>Final step</span></div>
        <div class="progress-track" aria-hidden="true"><div class="progress-value" style="width: 100%"></div></div>
      </section>
      <section class="question-card document-card" aria-labelledby="documents-title">
        <p class="eyebrow">Supporting documents</p>
        <h1 id="documents-title" tabindex="-1">Upload the documents that apply to you.</h1>
        <p class="help-text">Your answers determine this list. Required items are marked. You can select more than one file for each item.</p>
        <div class="document-list">
          ${requests.map((request) => `
            <section class="document-request" data-document-request="${request.code}">
              <div>
                <h2>${request.title}${request.required ? ' <span aria-label="required">Required</span>' : ' <span class="optional">Optional</span>'}</h2>
                <p>${request.detail}</p>
              </div>
              <label class="upload-button" for="upload-${request.code}">Choose files</label>
              <input id="upload-${request.code}" class="file-input" data-document-code="${request.code}" type="file" accept="${acceptedDocumentTypes}" multiple>
              <p class="file-list" data-file-list="${request.code}" aria-live="polite">No files selected.</p>
            </section>`).join("")}
        </div>
        <p class="error-message" role="alert" aria-live="polite"></p>
        <div class="actions">
          <button class="secondary-button" type="button">Back to questions</button>
          <button class="primary-button" type="button">Continue</button>
        </div>
      </section>
      <footer>Files stay in this browser-only demo. A tax professional must review all information.</footer>
    </main>`;

  root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => {
    event.preventDefault();
    options.onBack();
  });
  root.querySelector<HTMLButtonElement>(".secondary-button")!.addEventListener("click", options.onBack);

  root.querySelectorAll<HTMLInputElement>(".file-input").forEach((input) => {
    input.addEventListener("change", () => {
      const code = input.dataset.documentCode!;
      const files = Array.from(input.files ?? []);
      uploads.set(code, files);
      root.querySelector<HTMLElement>(`[data-file-list="${code}"]`)!.textContent = files.length
        ? files.map((file) => file.name).join(", ")
        : "No files selected.";
    });
  });

  root.querySelector<HTMLButtonElement>(".primary-button")!.addEventListener("click", () => {
    const missing = requests.filter((request) => request.required && !(uploads.get(request.code)?.length));
    const error = root.querySelector<HTMLElement>(".error-message")!;
    if (missing.length) {
      error.textContent = `Select a file for: ${missing.map((request) => request.title).join(", ")}.`;
      return;
    }
    options.onComplete(requests.flatMap((request) =>
      (uploads.get(request.code) ?? []).map((file) => ({
        category: request.code,
        categoryLabel: request.title,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      })),
    ));
  });
  root.querySelector<HTMLElement>("#documents-title")!.focus();
}
