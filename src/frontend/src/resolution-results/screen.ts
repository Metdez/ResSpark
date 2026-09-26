import type { ResolutionCaseResult, ResolutionOutcome } from "./model";
import "./styles.css";

export interface ResolutionResultsOptions {
  result: ResolutionCaseResult;
  onStartOver: () => void;
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-US");

const escapeHtml = (value: unknown): string => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatBytes = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.ceil(bytes / 1_024)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
};

const formatValue = (value: string | number | boolean | null, format = "text"): string => {
  if (value === null || value === "") return "Not provided";
  if (format === "currency") return money.format(Number(value));
  if (format === "boolean") return value ? "Yes" : "No";
  if (format === "number") return number.format(Number(value));
  return String(value);
};

const statusCopy = (outcome: ResolutionOutcome): { eyebrow: string; title: string } => {
  if (outcome.status === "blocked") return { eyebrow: "Action needed", title: "Your case needs a compliance step first." };
  if (outcome.status === "manual_review") return { eyebrow: "Professional review needed", title: "Your case needs a closer look." };
  return { eyebrow: "Potential path identified", title: `Your screening result is ${outcome.shortLabel}.` };
};

const renderFinancialSections = (sections: ResolutionCaseResult["financialSections"]): string => `
  <div class="financial-sections">
    ${sections.map((section, index) => `
      <details${index === 0 ? " open" : ""}>
        <summary><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><span aria-hidden="true">+</span></summary>
        <dl class="financial-grid">${section.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatValue(field.value, field.format))}</dd></div>`).join("")}</dl>
      </details>`).join("")}
  </div>`;

const renderNeededDocuments = (result: ResolutionCaseResult): string => {
  const needed = result.neededDocuments ?? [];
  if (!needed.length) return "";
  return `
    <section class="summary-section detail-section needed-documents" aria-labelledby="needed-documents-title">
      <div class="section-heading"><div><p class="section-kicker">Still needed</p><h2 id="needed-documents-title">Upload these to get a recommendation</h2></div><span>${needed.length} file${needed.length === 1 ? "" : "s"}</span></div>
      <ul class="uploaded-document-list">${needed.map((document) => `
        <li><span class="file-icon" aria-hidden="true">FILE</span><div><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.detail)}</small></div></li>`).join("")}</ul>
    </section>`;
};

const renderDocuments = (result: ResolutionCaseResult): string => result.documents.length
  ? `<ul class="uploaded-document-list">${result.documents.map((document) => `
      <li><span class="file-icon" aria-hidden="true">FILE</span><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.categoryLabel)} · ${formatBytes(document.size)}</small></div><span class="file-status">Ready</span></li>`).join("")}</ul>`
  : '<p class="empty-state">No documents were supplied.</p>';

export function renderResolutionResults(root: HTMLElement, options: ResolutionResultsOptions): void {
  const activeOutcome = options.result.outcome;

  const render = () => {
    const copy = statusCopy(activeOutcome);
    const fieldCount = options.result.financialSections.reduce((total, section) => total + section.fields.length, 0);
    const resultTitle = activeOutcome.status === "potential_match"
      ? `Your screening result is <mark class="result-path-highlight">${escapeHtml(activeOutcome.shortLabel)}</mark>.`
      : escapeHtml(copy.title);

    root.innerHTML = `
      <main class="results-shell">
        <div class="results-frame">
          <header class="results-header">
            <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
            <div class="results-header-actions">
              <button class="text-button" type="button" data-start-over>Start over</button>
            </div>
          </header>

          <section class="results-progress" aria-label="Intake progress">
            <div class="results-progress-label"><strong>Screening result</strong><span>Complete</span></div>
            <div class="results-progress-track" aria-hidden="true"><span></span></div>
            <ol aria-label="Completed steps">
              <li><span aria-hidden="true">✓</span>Questions</li>
              <li><span aria-hidden="true">✓</span>Documents</li>
              <li class="is-current"><span aria-hidden="true">✓</span>Result</li>
            </ol>
          </section>

          <div class="results-content">
            <section class="outcome-card outcome-${activeOutcome.status}" aria-labelledby="results-title">
              <div class="outcome-heading">
                <div class="outcome-icon" aria-hidden="true">${activeOutcome.status === "potential_match" ? "✓" : activeOutcome.status === "blocked" ? "!" : "↗"}</div>
                <div class="outcome-labels"><p class="eyebrow">${copy.eyebrow}</p><span class="selected-resolution-badge">Selected resolution</span></div>
              </div>
              <div class="outcome-copy">
                <h1 id="results-title" tabindex="-1">${resultTitle}</h1>
                <p class="outcome-path">${escapeHtml(activeOutcome.path)}</p>
                <p class="outcome-reason">${escapeHtml(activeOutcome.reason)}</p>
              </div>
              <details class="requirements-panel resolution-details">
                <summary><span>Resolution details</span><span aria-hidden="true">+</span></summary>
                <div>
                  <p>Screening requirements</p>
                  <ul>${activeOutcome.requirements.map((requirement) => `<li><span aria-hidden="true">✓</span>${escapeHtml(requirement)}</li>`).join("")}</ul>
                  ${activeOutcome.reviewNotes.length ? `<ul class="review-notes">${activeOutcome.reviewNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
                </div>
              </details>
            </section>

            ${renderNeededDocuments(options.result)}

            <section class="summary-section detail-section case-data-section" aria-labelledby="case-data-title">
              <div class="section-heading"><div><p class="section-kicker">Canonical case record</p><h2 id="case-data-title">Full case data</h2></div><span>${fieldCount} fields</span></div>
              ${renderFinancialSections(options.result.financialSections)}
            </section>

            <section class="summary-section detail-section documents-section" aria-labelledby="documents-title">
              <div class="section-heading"><div><p class="section-kicker">Source documents</p><h2 id="documents-title">Uploaded documents</h2></div><span>${options.result.documents.length} file${options.result.documents.length === 1 ? "" : "s"}</span></div>
              ${renderDocuments(options.result)}
            </section>

          </div>
        </div>
      </main>`;

    root.querySelector<HTMLButtonElement>("[data-start-over]")!.addEventListener("click", options.onStartOver);
    root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => { event.preventDefault(); options.onStartOver(); });
    root.querySelector<HTMLElement>("#results-title")!.focus();
  };

  render();
}
