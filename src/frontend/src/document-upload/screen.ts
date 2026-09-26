import type { Answers } from "../questions";
import type { SelectedDocument } from "../case-processing";
import { getDocumentRequests, type DocumentRequest, type DocumentUploadSlot } from "./requests";

export interface DocumentUploadScreenOptions {
  answers: Answers;
  onBack: () => void;
  onComplete: (documents: SelectedDocument[]) => void;
}

const acceptedDocumentTypes = ".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic";

const renderSlot = (request: DocumentRequest, slot: DocumentUploadSlot): string => {
  const inputId = `upload-${request.code}-${slot.id}`;
  return `<div class="upload-slot" data-upload-slot="${slot.id}">
    <label class="upload-button" for="${inputId}">${slot.label}</label>
    <input id="${inputId}" class="file-input" data-document-code="${request.code}" data-slot-id="${slot.id}" data-required="${slot.required}" type="file" accept="${acceptedDocumentTypes}">
    <span class="slot-file" data-slot-file="${slot.id}" aria-live="polite">No file selected.</span>
  </div>`;
};

function renderUploadControls(request: DocumentRequest): string {
  if (request.code === "vehicle" && request.slots) {
    const groupLabels = [...new Set(request.slots.map((slot) => slot.groupLabel!))];
    return `<div class="vehicle-upload-groups">
      ${groupLabels.map((groupLabel) => `<section class="vehicle-upload-group">
        <h3>${groupLabel}</h3>
        <div class="upload-slots">${request.slots!
          .filter((slot) => slot.groupLabel === groupLabel)
          .map((slot) => renderSlot(request, slot)).join("")}</div>
      </section>`).join("")}
    </div>`;
  }

  if (request.slots) {
    return `<div class="upload-slots">${request.slots.map((slot) => renderSlot(request, slot)).join("")}</div>`;
  }

  const slot: DocumentUploadSlot = { id: "files", label: "Choose files", required: request.required };
  const inputId = `upload-${request.code}-${slot.id}`;
  return `<div class="upload-slots"><div class="upload-slot" data-upload-slot="${slot.id}">
    <label class="upload-button" for="${inputId}">${slot.label}</label>
    <input id="${inputId}" class="file-input" data-document-code="${request.code}" data-slot-id="${slot.id}" data-required="${slot.required}" type="file" accept="${acceptedDocumentTypes}" multiple>
    <span class="slot-file" data-slot-file="${slot.id}" aria-live="polite">No files selected.</span>
  </div></div>`;
}

export function renderDocumentUpload(root: HTMLElement, options: DocumentUploadScreenOptions): void {
  const requests = getDocumentRequests(options.answers);
  const uploads = new Map<string, File[]>();

  const uploadKey = (code: string, slotId: string) => `${code}:${slotId}`;
  const requestIsComplete = (request: DocumentRequest): boolean => {
    const requiredSlots = request.slots?.filter((slot) => slot.required)
      ?? (request.required ? [{ id: "files" }] : []);
    return requiredSlots.every((slot) => (uploads.get(uploadKey(request.code, slot.id))?.length ?? 0) > 0);
  };

  const updateRequestStatus = (request: DocumentRequest): void => {
    const status = root.querySelector<HTMLElement>(`[data-request-status="${request.code}"]`)!;
    const hasUploads = [...uploads.entries()].some(([key, files]) => key.startsWith(`${request.code}:`) && files.length > 0);
    const complete = request.required ? requestIsComplete(request) : hasUploads;
    status.classList.toggle("is-complete", complete);
    status.textContent = complete ? (request.required ? "Complete" : "Uploaded") : (request.required ? "Required" : "Optional");
  };

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
                <h2>${request.title} <span class="request-status${request.required ? "" : " optional"}" data-request-status="${request.code}"${request.required ? ' aria-label="required"' : ""}>${request.required ? "Required" : "Optional"}</span></h2>
                <p>${request.detail}</p>
              </div>
              ${renderUploadControls(request)}
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
      const slotId = input.dataset.slotId!;
      const files = Array.from(input.files ?? []);
      uploads.set(uploadKey(code, slotId), files);
      const slotFile = root.querySelector<HTMLElement>(`[data-document-request="${code}"] [data-slot-file="${slotId}"]`)!;
      slotFile.classList.toggle("is-uploaded", files.length > 0);
      slotFile.textContent = files.length
        ? files.map((file) => file.name).join(", ")
        : input.multiple ? "No files selected." : "No file selected.";
      updateRequestStatus(requests.find((request) => request.code === code)!);
    });
  });

  root.querySelector<HTMLButtonElement>(".primary-button")!.addEventListener("click", () => {
    const missing = requests.filter((request) => request.required && !requestIsComplete(request));
    const error = root.querySelector<HTMLElement>(".error-message")!;
    if (missing.length) {
      error.textContent = `Complete required uploads for: ${missing.map((request) => request.title).join(", ")}.`;
      return;
    }
    options.onComplete(requests.flatMap((request) => {
      const slots = request.slots ?? [{ id: "files", groupLabel: undefined }];
      return slots.flatMap((slot) => (uploads.get(uploadKey(request.code, slot.id)) ?? []).map((file) => ({
          category: request.code,
          categoryLabel: slot.groupLabel ? `${request.title} — ${slot.groupLabel}` : request.title,
          file,
        })));
    }));
  });
  root.querySelector<HTMLElement>("#documents-title")!.focus();
}
