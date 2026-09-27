import "@material/web/select/outlined-select.js";
import "@material/web/select/select-option.js";
import type { MdOutlinedSelect } from "@material/web/select/outlined-select.js";

import { formatCurrencyAnswer, getApplicableQuestions, parseAnswer, validateAnswer } from "./flow";
import { questions, type Answers, type QuestionDefinition, type QuestionOption } from "./questions";
import { renderDocumentUpload } from "./document-upload/screen";
import { processCase as submitCase, type CaseProcessor, type SelectedDocument } from "./case-processing";
import type { ResolutionCaseResult } from "./resolution-results/model";
import { renderResolutionResults } from "./resolution-results/screen";

type Screen = "splash" | "intake" | "documents" | "results";
type SavedScreen = Extract<Screen, "intake" | "documents">;

const DRAFT_KEY = "resspark.intake.v1";

function loadDraft(): { answers: Answers; step: number; screen: SavedScreen } | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const draft = parsed as { answers?: unknown; step?: unknown; screen?: unknown };
    const answersAreValid = draft.answers && typeof draft.answers === "object" && !Array.isArray(draft.answers)
      && Object.values(draft.answers).every((value) => ["boolean", "number", "string"].includes(typeof value));
    if (!answersAreValid || !Number.isInteger(draft.step) || Number(draft.step) < 0 || Number(draft.step) > questions.length) return null;
    if (draft.screen !== "intake" && draft.screen !== "documents") return null;
    return { answers: draft.answers as Answers, step: Number(draft.step), screen: draft.screen };
  } catch {
    return null;
  }
}

export function createApp(root: HTMLElement, processCase: CaseProcessor = submitCase): void {
  const savedDraft = loadDraft();
  let answers: Answers = savedDraft?.answers ?? {};
  let screen: Screen = savedDraft?.screen ?? "splash";
  let step = savedDraft?.step ?? 0;
  let result: ResolutionCaseResult | null = null;
  let submittedDocuments: SelectedDocument[] = [];

  const saveDraft = () => {
    try {
      if (screen === "intake" || screen === "documents") {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, step, screen }));
      }
    } catch {
      // Browsers may disable session storage; the intake still works in memory.
    }
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Browsers may disable session storage.
    }
  };

  const startFresh = () => {
    clearDraft();
    answers = {};
    step = 0;
    result = null;
    submittedDocuments = [];
    screen = "intake";
    render();
  };

  const exit = () => {
    if (window.confirm("Your answers are not saved. Exit and discard this questionnaire?")) {
      answers = {};
      step = 0;
      clearDraft();
      screen = "splash";
      render();
    }
  };

  const renderSplash = () => {
    root.innerHTML = `
      <main class="splash-shell">
        <section class="splash-card" aria-labelledby="splash-title">
          <p class="eyebrow">ResSpark</p>
          <h1 id="splash-title">John Doe wants to understand your tax situation better</h1>
          <p>Answer a few questions so your tax professional can understand your situation and prepare the right next steps.</p>
          <button class="primary-button" type="button">Get started</button>
          <p class="notice">This screening tool supports professional review. It is not tax or legal advice and does not guarantee an IRS outcome.</p>
        </section>
      </main>`;
    root.querySelector<HTMLButtonElement>("button")!.addEventListener("click", startFresh);
  };

  const renderQuestion = (
    question: QuestionDefinition,
    currentAnswer: string | boolean,
    options?: QuestionOption[],
  ) => {
    if (question.valueType === "boolean") {
      const selected = typeof currentAnswer === "boolean" ? currentAnswer : undefined;
      return `
        <div class="answer-options" role="group" aria-label="${question.prompt}">
          <button class="answer-option${selected === true ? " is-selected" : ""}" type="button" data-value="true" aria-pressed="${selected === true}">Yes</button>
          <button class="answer-option${selected === false ? " is-selected" : ""}" type="button" data-value="false" aria-pressed="${selected === false}">No</button>
        </div>`;
    }

    if (options) {
      return `<md-outlined-select id="answer" name="answer" label="Select an answer" required>
          <md-select-option value=""${currentAnswer === "" ? " selected" : ""}><div slot="headline">Choose one</div></md-select-option>
          ${options.map((option) => `<md-select-option value="${option.value}"${String(currentAnswer) === option.value ? " selected" : ""}><div slot="headline">${option.label}</div></md-select-option>`).join("")}
        </md-outlined-select>`;
    }

    const numeric = question.valueType !== "text";
    return `<label class="input-label" for="answer">Your answer</label>
      <input id="answer" name="answer" type="${question.valueType === "currency" ? "text" : numeric ? "number" : "text"}"${question.valueType === "currency" ? ' inputmode="decimal"' : numeric ? ` step="${question.valueType === "integer" ? "1" : "0.01"}"` : ""}${question.minimum !== undefined ? ` min="${question.minimum}"` : ""} required />`;
  };

  const renderIntake = () => {
    const applicable = getApplicableQuestions(questions, answers);
    if (step >= applicable.length) {
      screen = "documents";
      saveDraft();
      render();
      return;
    }

    const question = applicable[step];
    const options = question.optionsForAnswers?.(answers) ?? question.options;
    const savedAnswer = answers[question.id];
    let draft: string | boolean = typeof savedAnswer === "boolean"
      ? savedAnswer
      : savedAnswer === undefined ? "" : String(savedAnswer);
    root.innerHTML = `
      <main class="intake-shell">
        <header class="app-header">
          <a class="wordmark" href="#" aria-label="ResSpark home">ResSpark</a>
        </header>
        <section class="progress-region" aria-label="Intake progress">
          <div class="progress-label">${question.section} <span>· ${step + 1} of ${applicable.length}</span></div>
          <div class="progress-track" aria-hidden="true"><div class="progress-value" style="width: ${((step + 1) / applicable.length) * 100}%"></div></div>
        </section>
        <section class="question-card" aria-labelledby="question-title">
          <h1 id="question-title" tabindex="-1">${question.prompt}</h1>
          ${question.helpText ? `<p class="help-text">${question.helpText}</p>` : ""}
          <div class="answer-control">${renderQuestion(question, draft, options)}</div>
          <p class="error-message" role="alert" aria-live="polite"></p>
          <div class="actions">
            ${step > 0 ? '<button class="secondary-button" type="button">Back</button>' : ""}
            <button class="primary-button" type="button">Continue</button>
          </div>
        </section>
        <footer>Information is used to help a tax professional evaluate possible next steps.</footer>
      </main>`;

    root.querySelector<HTMLAnchorElement>(".wordmark")!.addEventListener("click", (event) => {
      event.preventDefault();
      exit();
    });

    const error = root.querySelector<HTMLElement>(".error-message")!;
    const answerField = root.querySelector<HTMLInputElement | MdOutlinedSelect>("#answer");
    if (answerField && typeof draft === "string") {
      answerField.value = question.valueType === "currency" && draft ? formatCurrencyAnswer(draft) : draft;
    }
    if (answerField instanceof HTMLInputElement && question.valueType === "currency") {
      answerField.addEventListener("focus", () => {
        answerField.value = answerField.value.replace(/[$,\s]/g, "");
      });
      answerField.addEventListener("blur", () => {
        if (answerField.value.trim()) answerField.value = formatCurrencyAnswer(answerField.value);
      });
    }
    const setError = (message: string | null) => { error.textContent = message ?? ""; };
    root.querySelectorAll<HTMLButtonElement>(".answer-option").forEach((button) => {
      button.addEventListener("click", () => {
        draft = button.dataset.value === "true";
        root.querySelectorAll(".answer-option").forEach((option) => {
          const selected = option === button;
          option.classList.toggle("is-selected", selected);
          option.setAttribute("aria-pressed", String(selected));
        });
        setError(null);
      });
    });

    root.querySelector<HTMLButtonElement>(".primary-button")!.addEventListener("click", () => {
      const rawValue = question.valueType === "boolean" ? draft : answerField?.value ?? "";
      const message = validateAnswer(question, rawValue);
      if (message) {
        setError(message);
        return;
      }
      const answer = parseAnswer(question, rawValue);
      if (question.id === "state_of_residence" && answers.state_of_residence !== answer) {
        delete answers.county_of_residence;
      }
      answers[question.id] = answer;
      if (question.id === "filing_status_married" && answer === false) {
        delete answers.filing_joint_offer;
        delete answers.age_spouse;
      }
      if (question.id === "is_wage_earner" && answer === false) {
        delete answers.pay_frequency;
      }
      step += 1;
      saveDraft();
      render();
    });

    root.querySelector<HTMLButtonElement>(".secondary-button")?.addEventListener("click", () => {
      step -= 1;
      saveDraft();
      render();
    });
    root.querySelector<HTMLElement>("#question-title")!.focus();
  };

  const render = () => {
    if (screen === "splash") renderSplash();
    else if (screen === "intake") renderIntake();
    else if (screen === "documents") {
      renderDocumentUpload(root, {
        answers,
        onBack: () => {
          step = getApplicableQuestions(questions, answers).length - 1;
          screen = "intake";
          saveDraft();
          render();
        },
        onComplete: async (documents) => {
          result = await processCase({ answers, documents });
          submittedDocuments = documents;
          clearDraft();
          screen = "results";
          render();
        },
      });
    }
    else if (result) renderResolutionResults(root, {
      result,
      localDocuments: submittedDocuments,
      onStartOver: startFresh,
    });
  };

  render();
}
