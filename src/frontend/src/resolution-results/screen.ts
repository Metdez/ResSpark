import "@material/web/select/outlined-select.js";
import "@material/web/select/select-option.js";
import type { MdOutlinedSelect } from "@material/web/select/outlined-select.js";

import type { ResolutionCaseResult, ResolutionOutcome } from "./model";
import "./styles.css";

export interface ResolutionResultsOptions {
  result: ResolutionCaseResult;
  onStartOver: () => void;
}

type ResultView = "overview" | "resolution" | "finances" | "documents" | "case-data";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
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
  return { eyebrow: "Potential path identified", title: `You may qualify for ${outcome.shortLabel}.` };
};

const renderMetrics = (outcome: ResolutionOutcome): string => `<dl class="metric-grid">
  <div><dt>Household income</dt><dd>${money.format(outcome.monthlyIncome)}</dd><small>Monthly</small></div>
  <div><dt>Allowable expenses</dt><dd>${money.format(outcome.monthlyExpenses)}</dd><small>Monthly</small></div>
  <div><dt>Disposable income</dt><dd>${money.format(outcome.netDisposableIncome)}</dd><small>Monthly</small></div>
  <div><dt>Realizable equity</dt><dd>${money.format(outcome.netRealizableEquity)}</dd><small>Total</small></div>
  <div class="metric-primary"><dt>${outcome.id.includes("manual") ? "Amount for review" : "Suggested payment"}</dt><dd>${money.format(outcome.suggestedOfferOrPayment)}</dd><small>${outcome.id.includes("manual") ? "Estimate" : "Monthly"}</small></div>
</dl>`;

const renderFinancialSections = (sections: ResolutionCaseResult["financialSections"]): string => `
  <div class="financial-sections">
    ${sections.map((section, index) => `
      <details${index === 0 ? " open" : ""}>
        <summary><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><span aria-hidden="true">+</span></summary>
        <dl class="financial-grid">${section.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatValue(field.value, field.format))}</dd></div>`).join("")}</dl>
      </details>`).join("")}
  </div>`;

const renderDocuments = (result: ResolutionCaseResult): string => result.documents.length
  ? `<ul class="uploaded-document-list">${result.documents.map((document) => `
      <li><span class="file-icon" aria-hidden="true">FILE</span><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.categoryLabel)} · ${formatBytes(document.size)}</small></div><span class="file-status">Ready</span></li>`).join("")}</ul>`
  : '<p class="empty-state">No documents were supplied to this preview.</p>';

export function renderResolutionResults(root: HTMLElement, options: ResolutionResultsOptions): void {
  let activeOutcome = options.result.outcome;
  let activeView: ResultView = "overview";

  const render = () => {
    const copy = statusCopy(activeOutcome);
    const detailHeader = (kicker: string, title: string, summary: string) => `
      <button class="back-to-overview" type="button" data-back-overview><span aria-hidden="true">←</span> Back to overview</button>
      <div class="detail-heading">
        <p class="section-kicker">${kicker}</p>
        <h1 id="view-title" tabindex="-1">${title}</h1>
        <p>${summary}</p>
      </div>`;

    const overview = `
      ${options.result.isSandbox ? `
        <section class="scenario-control" aria-labelledby="scenario-label">
          <div><strong id="scenario-label">Preview a screening outcome</strong><small>Sandbox-only control</small></div>
          <md-outlined-select id="outcome-preview" aria-labelledby="scenario-label" label="Screening outcome">
            ${options.result.availableOutcomes.map((item) => `<md-select-option value="${item.id}"${item.id === activeOutcome.id ? " selected" : ""}><div slot="headline">${escapeHtml(item.path)}</div></md-select-option>`).join("")}
          </md-outlined-select>
        </section>` : ""}

      <section class="outcome-card outcome-${activeOutcome.status}" aria-labelledby="results-title">
        <div class="outcome-heading">
          <div class="outcome-icon" aria-hidden="true">${activeOutcome.status === "potential_match" ? "✓" : activeOutcome.status === "blocked" ? "!" : "↗"}</div>
          <div class="outcome-labels"><p class="eyebrow">${copy.eyebrow}</p><span class="selected-resolution-badge">Selected resolution</span></div>
        </div>
        <div class="outcome-copy">
          <h1 id="results-title" tabindex="-1">${escapeHtml(copy.title)}</h1>
          <p class="outcome-path">${escapeHtml(activeOutcome.path)}</p>
          <p class="outcome-reason">${escapeHtml(activeOutcome.reason)}</p>
        </div>
      </section>

      <section class="result-navigation" aria-labelledby="explore-result-title">
        <div class="section-heading"><div><p class="section-kicker">Case summary</p><h2 id="explore-result-title">Explore your screening result</h2></div><span>4 sections</span></div>
        <div class="result-card-grid">
          <button class="result-detail-card" type="button" data-result-view="resolution"><span class="detail-card-icon" aria-hidden="true">01</span><span><strong>Resolution details</strong><small>Requirements and recommended next step</small></span><span aria-hidden="true">→</span></button>
          <button class="result-detail-card" type="button" data-result-view="finances"><span class="detail-card-icon" aria-hidden="true">02</span><span><strong>Monthly finances</strong><small>${money.format(activeOutcome.monthlyIncome)} income · ${money.format(activeOutcome.netDisposableIncome)} disposable</small></span><span aria-hidden="true">→</span></button>
          <button class="result-detail-card" type="button" data-result-view="documents"><span class="detail-card-icon" aria-hidden="true">03</span><span><strong>Uploaded documents</strong><small>${options.result.documents.length} file${options.result.documents.length === 1 ? "" : "s"} ready for review</small></span><span aria-hidden="true">→</span></button>
          <button class="result-detail-card" type="button" data-result-view="case-data"><span class="detail-card-icon" aria-hidden="true">04</span><span><strong>Full case data</strong><small>${options.result.financialSections.reduce((total, section) => total + section.fields.length, 0)} structured fields</small></span><span aria-hidden="true">→</span></button>
        </div>
      </section>`;

    const resolution = `
      ${detailHeader("Suggested path", "Resolution details", "Review why this path was identified and what a tax professional should verify next.")}
      <section class="summary-section detail-section">
        <p class="eyebrow">${copy.eyebrow}</p>
        <h2>${escapeHtml(activeOutcome.path)}</h2>
        <p class="outcome-reason">${escapeHtml(activeOutcome.reason)}</p>
        <div class="requirements-list"><p>Based on the current deterministic screening logic:</p><ul>${activeOutcome.requirements.map((requirement) => `<li><span aria-hidden="true">✓</span>${escapeHtml(requirement)}</li>`).join("")}</ul></div>
        <div class="next-step"><span class="next-step-icon" aria-hidden="true">→</span><div><strong>Recommended next step</strong><p>${escapeHtml(activeOutcome.nextStep)}</p></div></div>
        ${activeOutcome.reviewNotes.length ? `<ul class="review-notes">${activeOutcome.reviewNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
        <p class="professional-notice">This is a suggested screening path, not an IRS decision or tax/legal advice. A CPA or EA must verify the data and decide what to file.</p>
      </section>`;

    const financeSections = options.result.financialSections.filter((section) => section.id === "income" || section.id === "expenses");
    const finances = `
      ${detailHeader("Screening calculation", "Monthly finances", "Review the populated income and expense values used by this sandbox result.")}
      <section class="summary-section detail-section">
        <div class="section-heading"><div><h2>How the numbers line up</h2></div><span>Monthly unless noted</span></div>
        ${renderMetrics(activeOutcome)}
      </section>
      <section class="summary-section detail-section" aria-label="Income and expense details">${renderFinancialSections(financeSections)}</section>`;

    const documents = `
      ${detailHeader("Source documents", "Uploaded documents", "These files are ready for a tax professional to review.")}
      <section class="summary-section detail-section">
        <div class="section-heading"><div><h2>Files supplied</h2></div><span>${options.result.documents.length} file${options.result.documents.length === 1 ? "" : "s"}</span></div>
        ${renderDocuments(options.result)}
      </section>`;

    const fieldCount = options.result.financialSections.reduce((total, section) => total + section.fields.length, 0);
    const caseData = `
      ${detailHeader("Canonical case record", "Full case data", "Review all structured fields currently available for professional verification.")}
      <section class="summary-section detail-section">
        <div class="section-heading"><div><h2>Structured financial data</h2></div><span>${fieldCount} fields</span></div>
        ${renderFinancialSections(options.result.financialSections)}
      </section>`;

    const viewContent: Record<ResultView, string> = { overview, resolution, finances, documents, "case-data": caseData };
    root.innerHTML = `
      <main class="results-shell">
        <div class="results-frame">
          <header class="results-header">
            <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
            <div class="results-header-actions">
              ${options.result.isSandbox ? '<span class="sandbox-badge">Sandbox preview</span>' : ""}
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

          <div class="results-content">${viewContent[activeView]}</div>
        </div>
      </main>`;

    root.querySelector<HTMLButtonElement>("[data-start-over]")!.addEventListener("click", options.onStartOver);
    root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => { event.preventDefault(); options.onStartOver(); });
    root.querySelectorAll<HTMLButtonElement>("[data-result-view]").forEach((button) => {
      button.addEventListener("click", () => {
        activeView = button.dataset.resultView as ResultView;
        render();
      });
    });
    root.querySelector<HTMLButtonElement>("[data-back-overview]")?.addEventListener("click", () => {
      activeView = "overview";
      render();
    });
    root.querySelector<MdOutlinedSelect>("#outcome-preview")?.addEventListener("change", (event) => {
      const selected = options.result.availableOutcomes.find((item) => item.id === (event.currentTarget as MdOutlinedSelect).value);
      if (selected) { activeOutcome = selected; render(); }
    });
    root.querySelector<HTMLElement>(activeView === "overview" ? "#results-title" : "#view-title")!.focus();
  };

  render();
}
