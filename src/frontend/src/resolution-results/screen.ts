import type { SelectedDocument } from "../case-processing";
import type {
  CalculationSection,
  FieldSource,
  FinancialSection,
  ResolutionCaseResult,
  ResolutionOutcome,
} from "./model";
import "./styles.css";

export interface ResolutionResultsOptions {
  result: ResolutionCaseResult;
  localDocuments?: readonly SelectedDocument[];
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

const auditIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3h3v15H4V6h3V3Zm2 3h6V5H9v1Zm-3 2v11h12V8h-1v2H7V8H6Zm3 5h6v2H9v-2Z"/></svg>`;

const renderFinancialSections = (sections: FinancialSection[], complete = false): string => `
  <div class="financial-sections${complete ? " is-complete" : ""}">
    ${sections.map((section, index) => `
      <details${index === 0 ? " open" : ""}>
        <summary><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><span aria-hidden="true">+</span></summary>
        <dl class="financial-grid">${section.fields.map((field) => `
          <div>
            <dt>${escapeHtml(field.label)}${complete ? `<code>${escapeHtml(field.key)}</code>` : ""}</dt>
            <dd>${escapeHtml(formatValue(field.value, field.format))}</dd>
            ${complete ? `<div class="field-sources">${renderSources(field.sources ?? [])}</div>` : ""}
          </div>`).join("")}</dl>
      </details>`).join("")}
  </div>`;

const renderSources = (sources: FieldSource[]): string => sources.map((source) => `
  <span class="source-item">
    <span class="source-badge source-${escapeHtml(source.kind)}">${escapeHtml(source.kind.replace("_", " "))}</span>
    <span>${escapeHtml(source.label)}</span>
    ${source.kind === "document" ? `<small>${source.snippet ? escapeHtml(source.snippet) : "Exact source text unavailable."}</small>` : ""}
  </span>`).join("");

const renderNeededDocuments = (result: ResolutionCaseResult): string => {
  const needed = result.neededDocuments ?? [];
  if (!needed.length) return "";
  return `
    <section class="summary-section needed-documents" aria-labelledby="needed-documents-title">
      <div class="section-heading"><div><p class="section-kicker">Still needed</p><h2 id="needed-documents-title">Documents needed for a complete review</h2></div><span>${needed.length} item${needed.length === 1 ? "" : "s"}</span></div>
      <ul class="needed-list">${needed.map((document) => `
        <li><span aria-hidden="true">!</span><div><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(document.detail)}</small></div></li>`).join("")}</ul>
    </section>`;
};

const renderMetrics = (outcome: ResolutionOutcome): string => {
  const metrics = [
    ["Monthly income", outcome.monthlyIncome],
    ["Allowable expenses", outcome.monthlyExpenses],
    ["Disposable income", outcome.netDisposableIncome],
    ["Realizable equity", outcome.netRealizableEquity],
    ["Suggested offer or payment", outcome.suggestedOfferOrPayment],
  ] as const;
  return `<dl class="metric-grid">${metrics.map(([label, value], index) => `
    <div${index === metrics.length - 1 ? ' class="metric-primary"' : ""}>
      <dt>${escapeHtml(label)}</dt><dd>${escapeHtml(formatValue(value, "currency"))}</dd>
    </div>`).join("")}</dl>`;
};

const renderCalculationSections = (sections: CalculationSection[], outcome: ResolutionOutcome): string => {
  if (!sections.length) {
    return `<div class="audit-empty"><strong>Calculation not completed</strong><p>${escapeHtml(outcome.reason)}</p></div>`;
  }
  return `<div class="calculation-sections">${sections.map((section, index) => `
    <details${index === 0 || section.id === "decision" ? " open" : ""}>
      <summary><span><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.description)}</small></span><span aria-hidden="true">+</span></summary>
      <div class="calculation-list">${section.steps.map((step) => `
        <article class="calculation-step${step.status ? ` calculation-${step.status}` : ""}">
          <div><strong>${escapeHtml(step.label)}</strong><p>${escapeHtml(step.formula)}</p></div>
          ${step.inputs.length ? `<ul>${step.inputs.map((input) => `<li><span>${escapeHtml(input.label)}</span><strong>${escapeHtml(formatCalculationInput(input.label, input.value))}</strong></li>`).join("")}</ul>` : ""}
          <div class="calculation-result">${step.status ? `<span>${escapeHtml(step.status.replace("_", " "))}</span>` : ""}<strong>${escapeHtml(formatValue(step.result, step.format))}</strong></div>
        </article>`).join("")}</div>
    </details>`).join("")}</div>`;
};

const formatCalculationInput = (label: string, value: string | number | boolean | null): string => {
  if (typeof value !== "number") return formatValue(value);
  return /people|months|count/i.test(label) ? number.format(value) : money.format(value);
};

const renderDocumentEvidence = (result: ResolutionCaseResult): string => {
  const evidence = result.sourceOfTruth.documentEvidence;
  if (!evidence.length) return '<p class="empty-state">No source documents were supplied.</p>';
  return `<div class="evidence-list">${evidence.map((document) => `
    <article class="evidence-card">
      <header><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.detectedType || document.categoryLabel)}</small></div><span class="evidence-status status-${escapeHtml(document.status)}">${document.status === "parsed" ? "Parsed" : "Needs review"}</span></header>
      ${document.error ? `<p class="document-error">${escapeHtml(document.error)}</p>` : ""}
      ${document.fields.length ? `<dl>${document.fields.map((field) => `
        <div><dt>${escapeHtml(field.label)}<code>${escapeHtml(field.key)}</code></dt><dd>${escapeHtml(formatValue(field.value, field.format))}<small>${field.usedInCanonical ? "Used in the case record" : "Supporting evidence"}</small></dd>${field.snippet ? `<blockquote>${escapeHtml(field.snippet)}</blockquote>` : '<blockquote>Exact source text unavailable.</blockquote>'}</div>`).join("")}</dl>` : '<p class="empty-state">No financial fields were extracted from this file.</p>'}
    </article>`).join("")}</div>`;
};

export function renderResolutionResults(root: HTMLElement, options: ResolutionResultsOptions): void {
  let view: "overview" | "truth" = "overview";
  let activeDocument = 0;
  const localDocuments = options.localDocuments ?? [];
  const urls = localDocuments.map(({ file }) => typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "");
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp) return;
    urls.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
    cleanedUp = true;
  };

  const renderDocumentPreview = (): string => {
    if (!options.result.documents.length) {
      return '<p class="empty-state">No documents were supplied.</p>';
    }
    const document = options.result.documents[activeDocument];
    const local = localDocuments[activeDocument];
    const url = urls[activeDocument];
    const type = local?.file.type || document.type;
    const isPdf = type === "application/pdf" || document.name.toLowerCase().endsWith(".pdf");
    const isImage = type.startsWith("image/");
    const preview = !url
      ? '<div class="preview-unavailable"><strong>Preview unavailable</strong><p>The original file is available only in the browser session that submitted it.</p></div>'
      : isPdf
        ? `<object class="document-preview-frame" data="${escapeHtml(url)}" type="application/pdf"><p>PDF preview is unavailable in this browser. <a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open the PDF</a>.</p></object>`
        : isImage
          ? `<img class="document-image-preview" src="${escapeHtml(url)}" alt="Preview of ${escapeHtml(document.name)}">`
          : '<div class="preview-unavailable"><strong>No inline preview for this file type</strong><p>Use Download to view the original file.</p></div>';
    return `
      <div class="document-picker" role="list" aria-label="Uploaded documents">${options.result.documents.map((item, index) => `
        <button type="button" role="listitem" class="document-tab${index === activeDocument ? " is-active" : ""}" data-document-index="${index}" aria-pressed="${index === activeDocument}">
          <span>${escapeHtml(item.name)}</span><small>${escapeHtml(item.categoryLabel)} · ${formatBytes(item.size)}</small>
        </button>`).join("")}</div>
      <div class="document-viewer">
        <div class="document-viewer-heading"><div><strong>${escapeHtml(document.name)}</strong><small>${escapeHtml(document.categoryLabel)} · ${formatBytes(document.size)}</small></div>${url ? `<div><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Open</a><a href="${escapeHtml(url)}" download="${escapeHtml(document.name)}">Download</a></div>` : ""}</div>
        ${preview}
      </div>`;
  };

  const renderHeader = (): string => `
    <header class="results-header">
      <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
      <button class="text-button" type="button" data-start-over>Start over</button>
    </header>`;

  const renderOverview = (): string => {
    const outcome = options.result.outcome;
    const copy = statusCopy(outcome);
    const resultTitle = outcome.status === "potential_match"
      ? `Your screening result is <mark class="result-path-highlight">${escapeHtml(outcome.shortLabel)}</mark>.`
      : escapeHtml(copy.title);
    const fieldCount = options.result.financialSections.reduce((total, section) => total + section.fields.length, 0);
    return `
      ${renderHeader()}
      <section class="results-progress" aria-label="Intake progress">
        <div class="results-progress-label"><strong>Screening result</strong><span>Complete</span></div>
        <div class="results-progress-track" aria-hidden="true"><span></span></div>
        <ol><li><span aria-hidden="true">✓</span>Questions</li><li><span aria-hidden="true">✓</span>Documents</li><li class="is-current"><span aria-hidden="true">✓</span>Result</li></ol>
      </section>
      <div class="results-content">
        <section class="outcome-card outcome-${outcome.status}" aria-labelledby="results-title">
          <div class="outcome-heading"><div class="outcome-icon" aria-hidden="true">${outcome.status === "potential_match" ? "✓" : outcome.status === "blocked" ? "!" : "↗"}</div><div class="outcome-labels"><p class="eyebrow">${copy.eyebrow}</p><span class="selected-resolution-badge">Screening result</span></div></div>
          <div class="outcome-copy"><h1 id="results-title" tabindex="-1">${resultTitle}</h1><p class="outcome-path">${escapeHtml(outcome.path)}</p><p class="outcome-reason">${escapeHtml(outcome.reason)}</p></div>
          <div class="outcome-actions"><button class="audit-button" type="button" data-show-truth>${auditIcon}<span><strong>View source of truth</strong><small>See the data, documents, and calculation trail</small></span><span aria-hidden="true">→</span></button></div>
          <details class="requirements-panel"><summary><span>Professional review details</span><span aria-hidden="true">+</span></summary><div><p>${escapeHtml(outcome.nextStep)}</p>${outcome.requirements.length ? `<ul>${outcome.requirements.map((item) => `<li><span aria-hidden="true">✓</span>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}${outcome.reviewNotes.length ? `<ul class="review-notes">${outcome.reviewNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>` : ""}</div></details>
        </section>
        ${renderNeededDocuments(options.result)}
        <section class="summary-section metrics-section" aria-labelledby="metrics-title"><div class="section-heading"><div><p class="section-kicker">Financial position</p><h2 id="metrics-title">How the case measures up</h2></div></div>${renderMetrics(outcome)}</section>
        <section class="summary-section case-data-section" aria-labelledby="case-data-title"><div class="section-heading"><div><p class="section-kicker">Form 433-A snapshot</p><h2 id="case-data-title">Organized financial profile</h2></div><span>${fieldCount} provided fields</span></div>${renderFinancialSections(options.result.financialSections)}</section>
        <section class="summary-section documents-section" aria-labelledby="documents-title"><div class="section-heading"><div><p class="section-kicker">Source documents</p><h2 id="documents-title">Preview and download</h2></div><span>${options.result.documents.length} file${options.result.documents.length === 1 ? "" : "s"}</span></div>${renderDocumentPreview()}</section>
      </div>`;
  };

  const renderTruth = (): string => `
    ${renderHeader()}
    <div class="truth-content">
      <button class="back-to-overview" type="button" data-back-overview>← Back to result overview</button>
      <header class="truth-heading"><p class="section-kicker">Audit trail</p><h1 id="truth-title" tabindex="-1">Source of truth</h1><p>Review every financial field, the calculation steps, and the document excerpts that support this screening result.</p></header>
      <nav class="truth-navigation" aria-label="Source of truth sections"><a href="#calculation-trail">Calculation trail</a><a href="#complete-case-data">Form 433-A data</a><a href="#document-extraction">Document extraction</a></nav>
      <section class="summary-section audit-section" id="calculation-trail" aria-labelledby="calculation-title"><div class="section-heading"><div><p class="section-kicker">Calculation trail</p><h2 id="calculation-title">Math and decision logic</h2></div></div>${renderCalculationSections(options.result.sourceOfTruth.calculationSections, options.result.outcome)}</section>
      <section class="summary-section audit-section" id="complete-case-data" aria-labelledby="complete-data-title"><div class="section-heading"><div><p class="section-kicker">Canonical record</p><h2 id="complete-data-title">Complete Form 433-A data</h2></div><span>Unknown values remain unknown</span></div>${renderFinancialSections(options.result.sourceOfTruth.fieldSections, true)}</section>
      <section class="summary-section audit-section" id="document-extraction" aria-labelledby="evidence-title"><div class="section-heading"><div><p class="section-kicker">Document extraction</p><h2 id="evidence-title">Values read from each file</h2></div></div>${renderDocumentEvidence(options.result)}</section>
    </div>`;

  const bind = () => {
    root.querySelectorAll<HTMLElement>("[data-start-over], .wordmark").forEach((element) => element.addEventListener("click", (event) => {
      event.preventDefault();
      cleanup();
      options.onStartOver();
    }));
    root.querySelector<HTMLButtonElement>("[data-show-truth]")?.addEventListener("click", () => {
      view = "truth";
      render();
      root.querySelector<HTMLElement>("#truth-title")?.focus();
    });
    root.querySelector<HTMLButtonElement>("[data-back-overview]")?.addEventListener("click", () => {
      view = "overview";
      render();
      root.querySelector<HTMLElement>("#results-title")?.focus();
    });
    root.querySelectorAll<HTMLButtonElement>("[data-document-index]").forEach((button) => button.addEventListener("click", () => {
      activeDocument = Number(button.dataset.documentIndex);
      render();
      root.querySelector<HTMLElement>(`.document-tab[data-document-index="${activeDocument}"]`)?.focus();
    }));
  };

  const render = () => {
    root.innerHTML = `<main class="results-shell"><div class="results-frame">${view === "overview" ? renderOverview() : renderTruth()}</div></main>`;
    bind();
  };

  render();
  root.querySelector<HTMLElement>("#results-title")?.focus();
}
