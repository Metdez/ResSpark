import type { Answers } from "../questions";
import type { SelectedDocument } from "../case-processing";
import { getDocumentRequests, type DocumentRequest, type DocumentUploadSlot } from "./requests";

export interface DocumentUploadScreenOptions {
  answers: Answers;
  onBack: () => void;
  onComplete: (documents: SelectedDocument[]) => void | Promise<void>;
}

const acceptedDocumentTypes = ".pdf,.jpg,.jpeg,.png,.tif,.tiff,.heic";
const plaidLogo = new URL("../../assets/Plaidpng.png", import.meta.url).href;
const gustoLogo = new URL("../../assets/Gusto_logo.png", import.meta.url).href;

const documentNameRules: Array<[string, RegExp]> = [
  ["bankruptcy", /bankruptcy|petition|case.status/i],
  ["vehicle", /vehicle|auto|car|registration/i],
  ["real_property", /mortgage|heloc|property|tax.assessment/i],
  ["retirement", /retirement|401k?|403b?|\bira\b|pension/i],
  ["investments", /investment|brokerage|securities/i],
  ["insurance", /life.insurance|cash.value|policy.loan/i],
  ["housing_utilities", /utility|electric|water|gas.bill/i],
  ["lease", /lease|rent.agreement/i],
  ["self_employment", /profit.and.loss|schedule.[cef]|business.bank|self.employ/i],
  ["pay_stubs", /pay.stub|paycheck|\bw[ -]?2\b/i],
  ["irs_transcripts", /\birs\b|transcript|balance.notice/i],
  ["bank_statements", /bank|checking|savings|account.statement/i],
];

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
  let sortedUploads: SelectedDocument[] = [];

  const uploadKey = (code: string, slotId: string) => `${code}:${slotId}`;
  const requestIsComplete = (request: DocumentRequest): boolean => {
    const requiredSlots = request.slots?.filter((slot) => slot.required)
      ?? (request.required ? [{ id: "files" }] : []);
    const manualUploadCount = requiredSlots.filter((slot) => (uploads.get(uploadKey(request.code, slot.id))?.length ?? 0) > 0).length;
    const sortedUploadCount = sortedUploads.filter((document) => document.category === request.code).length;
    return manualUploadCount + sortedUploadCount >= requiredSlots.length;
  };

  const updateRequestStatus = (request: DocumentRequest): void => {
    const status = root.querySelector<HTMLElement>(`[data-request-status="${request.code}"]`)!;
    const hasUploads = [...uploads.entries()].some(([key, files]) => key.startsWith(`${request.code}:`) && files.length > 0)
      || sortedUploads.some((document) => document.category === request.code);
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
        <section class="account-connections" aria-label="Connect financial accounts">
          <div class="connection-option">
            <img src="${plaidLogo}" alt="" aria-hidden="true">
            <strong>Connect your bank account with Plaid</strong>
          </div>
          <div class="connection-option">
            <img src="${gustoLogo}" alt="" aria-hidden="true">
            <strong>Connect to payroll with Gusto</strong>
          </div>
        </section>
        <section class="quick-upload" role="button" tabindex="0" aria-labelledby="quick-upload-title" aria-describedby="quick-upload-help">
          <div>
            <p class="quick-upload-kicker">Upload anytime</p>
            <h2 id="quick-upload-title">Upload any documents</h2>
            <p id="quick-upload-help">Drag and drop files here, or click anywhere in this box. We'll sort recognizable filenames into the right sections.</p>
          </div>
          <span class="quick-upload-button" aria-hidden="true">Choose documents</span>
          <input id="upload-any-documents" class="file-input quick-upload-input" type="file" accept="${acceptedDocumentTypes}" multiple>
          <div class="sorted-file-list" aria-live="polite"><span>No documents selected yet.</span></div>
        </section>
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
      <footer>Files are submitted securely for screening. A tax professional must review all information.</footer>
    </main>`;

  root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => {
    event.preventDefault();
    options.onBack();
  });
  root.querySelector<HTMLButtonElement>(".secondary-button")!.addEventListener("click", options.onBack);

  const quickUpload = root.querySelector<HTMLElement>(".quick-upload")!;
  const quickUploadInput = root.querySelector<HTMLInputElement>(".quick-upload-input")!;
  const sortFiles = (files: File[]): void => {
    sortedUploads = files.map((file) => {
      const category = documentNameRules.find(([code, pattern]) => requests.some((request) => request.code === code) && pattern.test(file.name))?.[0]
        ?? "other";
      return {
        category,
        categoryLabel: requests.find((request) => request.code === category)?.title ?? "Other documents",
        file,
      };
    });
    const list = root.querySelector<HTMLElement>(".sorted-file-list")!;
    const rows = sortedUploads.map((document) => {
      const row = window.document.createElement("span");
      const name = window.document.createElement("strong");
      const category = window.document.createElement("small");
      name.textContent = document.file.name;
      category.textContent = document.categoryLabel;
      row.append(name, category);
      return row;
    });
    if (!rows.length) {
      const empty = window.document.createElement("span");
      empty.textContent = "No documents selected yet.";
      rows.push(empty);
    }
    list.replaceChildren(...rows);
    requests.forEach(updateRequestStatus);
  };
  quickUploadInput.addEventListener("change", (event) => {
    sortFiles(Array.from((event.currentTarget as HTMLInputElement).files ?? []));
  });
  quickUpload.addEventListener("click", (event) => {
    if (event.target !== quickUploadInput) quickUploadInput.click();
  });
  quickUpload.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    quickUploadInput.click();
  });
  quickUpload.addEventListener("dragover", (event) => {
    event.preventDefault();
    quickUpload.classList.add("is-dragging");
  });
  quickUpload.addEventListener("dragleave", () => quickUpload.classList.remove("is-dragging"));
  quickUpload.addEventListener("drop", (event) => {
    event.preventDefault();
    quickUpload.classList.remove("is-dragging");
    sortFiles(Array.from(event.dataTransfer?.files ?? []));
  });

  root.querySelectorAll<HTMLInputElement>(".file-input").forEach((input) => {
    if (input.classList.contains("quick-upload-input")) return;
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

  root.querySelector<HTMLButtonElement>(".primary-button")!.addEventListener("click", async (event) => {
    const missing = requests.filter((request) => request.required && !requestIsComplete(request));
    const error = root.querySelector<HTMLElement>(".error-message")!;
    if (missing.length) {
      error.textContent = `Complete required uploads for: ${missing.map((request) => request.title).join(", ")}.`;
      return;
    }
    const manualUploads = requests.flatMap((request) => {
      const slots = request.slots ?? [{ id: "files", groupLabel: undefined }];
      return slots.flatMap((slot) => (uploads.get(uploadKey(request.code, slot.id)) ?? []).map((file) => ({
          category: request.code,
          categoryLabel: slot.groupLabel ? `${request.title} — ${slot.groupLabel}` : request.title,
          file,
        })));
    });
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    error.textContent = "Submitting your case…";
    try {
      await options.onComplete([...sortedUploads, ...manualUploads]);
    } catch {
      button.disabled = false;
      error.textContent = "We couldn't submit your case. Check your connection and try again.";
    }
  });
  root.querySelector<HTMLElement>("#documents-title")!.focus();
}
