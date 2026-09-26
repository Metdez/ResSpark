import type { ResolutionCaseResult, ResolutionOutcome } from "./model";
import "./styles.css";

export interface ResolutionResultsOptions {
  result: ResolutionCaseResult;
  onStartOver: () => void;
}

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

export function renderResolutionResults(root: HTMLElement, options: ResolutionResultsOptions): void {
  let activeOutcome = options.result.outcome;

  const render = () => {
    const copy = statusCopy(activeOutcome);
    root.innerHTML = `
      <main class="results-shell">
        <header class="results-header">
          <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
          <div class="results-header-actions">
            ${options.result.isSandbox ? '<span class="sandbox-badge">Sandbox preview</span>' : ""}
            <button class="text-button" type="button" data-start-over>Start over</button>
          </div>
        </header>

        <div class="results-layout">
          <aside class="results-rail" aria-label="Review sections">
            <p class="rail-progress">Complete</p>
            <ol>
              <li class="is-complete"><span aria-hidden="true">✓</span> Questions</li>
              <li class="is-complete"><span aria-hidden="true">✓</span> Documents</li>
              <li class="is-current"><span aria-hidden="true">3</span> Screening result</li>
            </ol>
          </aside>

          <div class="results-content">
            ${options.result.isSandbox ? `
              <section class="scenario-control" aria-labelledby="scenario-label">
                <div><strong id="scenario-label">Preview every determination state</strong><small>This switcher exists only in the sandbox.</small></div>
                <select id="outcome-preview" aria-labelledby="scenario-label">
                  ${options.result.availableOutcomes.map((item) => `<option value="${item.id}"${item.id === activeOutcome.id ? " selected" : ""}>${escapeHtml(item.path)}</option>`).join("")}
                </select>
              </section>` : ""}

            <section class="outcome-card outcome-${activeOutcome.status}" aria-labelledby="results-title">
              <div class="outcome-icon" aria-hidden="true">${activeOutcome.status === "potential_match" ? "✓" : activeOutcome.status === "blocked" ? "!" : "↗"}</div>
              <div>
                <p class="eyebrow">${copy.eyebrow}</p>
                <h1 id="results-title" tabindex="-1">${escapeHtml(copy.title)}</h1>
                <p class="outcome-path">${escapeHtml(activeOutcome.path)}</p>
                <p class="outcome-reason">${escapeHtml(activeOutcome.reason)}</p>
              </div>
            </section>

            <section class="summary-section" aria-labelledby="calculation-title">
              <div class="section-heading"><div><p class="section-kicker">Screening calculation</p><h2 id="calculation-title">How the numbers line up</h2></div><span>Monthly unless noted</span></div>
              <dl class="metric-grid">
                <div><dt>Household income</dt><dd>${money.format(activeOutcome.monthlyIncome)}</dd></div>
                <div><dt>Allowable expenses</dt><dd>${money.format(activeOutcome.monthlyExpenses)}</dd></div>
                <div><dt>Disposable income</dt><dd>${money.format(activeOutcome.netDisposableIncome)}</dd></div>
                <div><dt>Realizable equity</dt><dd>${money.format(activeOutcome.netRealizableEquity)}</dd></div>
                <div class="metric-primary"><dt>${activeOutcome.id.includes("manual") ? "Amount for review" : "Suggested payment"}</dt><dd>${money.format(activeOutcome.suggestedOfferOrPayment)}</dd></div>
              </dl>
              <div class="next-step"><strong>Recommended next step</strong><p>${escapeHtml(activeOutcome.nextStep)}</p></div>
              ${activeOutcome.reviewNotes.length ? `<ul class="review-notes">${activeOutcome.reviewNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}
              <p class="professional-notice">This is a suggested screening path, not an IRS decision or tax/legal advice. A CPA or EA must verify the data and decide what to file.</p>
            </section>

            <section class="summary-section" aria-labelledby="documents-summary-title">
              <div class="section-heading"><div><p class="section-kicker">Source documents</p><h2 id="documents-summary-title">Uploaded for review</h2></div><span>${options.result.documents.length} file${options.result.documents.length === 1 ? "" : "s"}</span></div>
              ${options.result.documents.length ? `<ul class="uploaded-document-list">${options.result.documents.map((document) => `
                <li><span class="file-icon" aria-hidden="true">PDF</span><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.categoryLabel)} · ${formatBytes(document.size)}</small></div><span class="file-status">Ready</span></li>`).join("")}</ul>` : '<p class="empty-state">No documents were supplied to this preview.</p>'}
            </section>

            <section class="summary-section" aria-labelledby="financial-summary-title">
              <div class="section-heading"><div><p class="section-kicker">Canonical case record</p><h2 id="financial-summary-title">Structured financial data</h2></div><span>${options.result.financialSections.reduce((total, section) => total + section.fields.length, 0)} fields</span></div>
              <div class="financial-sections">
                ${options.result.financialSections.map((section, index) => `
                  <details${index === 0 ? " open" : ""}>
                    <summary><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><span aria-hidden="true">+</span></summary>
                    <dl class="financial-grid">${section.fields.map((field) => `<div><dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(formatValue(field.value, field.format))}</dd></div>`).join("")}</dl>
                  </details>`).join("")}
              </div>
            </section>
          </div>
        </div>
      </main>`;

    root.querySelector<HTMLButtonElement>("[data-start-over]")!.addEventListener("click", options.onStartOver);
    root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => { event.preventDefault(); options.onStartOver(); });
    root.querySelector<HTMLSelectElement>("#outcome-preview")?.addEventListener("change", (event) => {
      const selected = options.result.availableOutcomes.find((item) => item.id === (event.currentTarget as HTMLSelectElement).value);
      if (selected) { activeOutcome = selected; render(); }
    });
    root.querySelector<HTMLElement>("#results-title")!.focus();
  };

  render();
}
