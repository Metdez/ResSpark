import type { Answers } from "./questions";
import type { ResolutionCaseResult } from "./resolution-results/model";

export interface SelectedDocument {
  category: string;
  categoryLabel: string;
  file: File;
}

export interface CaseSubmission {
  answers: Answers;
  documents: SelectedDocument[];
}

export type CaseProcessor = (submission: CaseSubmission) => Promise<ResolutionCaseResult>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValue = (value: unknown): value is string | number | boolean | null =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

const isFinancialField = (value: unknown): boolean => isObject(value)
  && typeof value.key === "string"
  && typeof value.label === "string"
  && isValue(value.value)
  && (value.sources === undefined || (Array.isArray(value.sources) && value.sources.every((source) =>
    isObject(source)
    && ["questionnaire", "document", "derived", "assumption", "unknown"].includes(String(source.kind))
    && typeof source.label === "string")));

const isFinancialSection = (value: unknown): boolean => isObject(value)
  && [value.id, value.title, value.description].every((item) => typeof item === "string")
  && Array.isArray(value.fields)
  && value.fields.every(isFinancialField);

const isCalculationSection = (value: unknown): boolean => isObject(value)
  && [value.id, value.title, value.description].every((item) => typeof item === "string")
  && Array.isArray(value.steps)
  && value.steps.every((step) => isObject(step)
    && typeof step.label === "string"
    && typeof step.formula === "string"
    && isValue(step.result)
    && Array.isArray(step.inputs)
    && step.inputs.every((input) => isObject(input) && typeof input.label === "string" && isValue(input.value)));

const isDocumentEvidence = (value: unknown): boolean => isObject(value)
  && [value.name, value.category, value.categoryLabel, value.detectedType].every((item) => typeof item === "string")
  && ["parsed", "needs_review"].includes(String(value.status))
  && (value.error === null || typeof value.error === "string")
  && Array.isArray(value.fields)
  && value.fields.every((field) => isFinancialField(field)
    && isObject(field)
    && typeof field.usedInCanonical === "boolean"
    && (field.snippet === null || field.snippet === undefined || typeof field.snippet === "string"));

const isCaseResult = (value: unknown): value is ResolutionCaseResult => {
  if (!isObject(value) || !isObject(value.outcome)) return false;
  const outcome = value.outcome;
  const documentsAreValid = Array.isArray(value.documents) && value.documents.every((document) =>
    isObject(document)
    && [document.category, document.categoryLabel, document.name, document.type].every((item) => typeof item === "string")
    && typeof document.size === "number");
  const sectionsAreValid = Array.isArray(value.financialSections) && value.financialSections.every(isFinancialSection);
  const sourceOfTruthIsValid = isObject(value.sourceOfTruth)
    && Array.isArray(value.sourceOfTruth.fieldSections)
    && value.sourceOfTruth.fieldSections.every(isFinancialSection)
    && Array.isArray(value.sourceOfTruth.calculationSections)
    && value.sourceOfTruth.calculationSections.every(isCalculationSection)
    && Array.isArray(value.sourceOfTruth.documentEvidence)
    && value.sourceOfTruth.documentEvidence.every(isDocumentEvidence);
  const outcomeAmountsAreValid = [
    outcome.monthlyIncome,
    outcome.monthlyExpenses,
    outcome.netDisposableIncome,
    outcome.netRealizableEquity,
    outcome.suggestedOfferOrPayment,
  ].every((amount) => amount === null || typeof amount === "number");
  return typeof value.caseLabel === "string"
    && typeof value.generatedAt === "string"
    && documentsAreValid
    && sectionsAreValid
    && typeof outcome.id === "string"
    && typeof outcome.path === "string"
    && typeof outcome.shortLabel === "string"
    && ["potential_match", "manual_review", "blocked"].includes(String(outcome.status))
    && typeof outcome.reason === "string"
    && typeof outcome.nextStep === "string"
    && Array.isArray(outcome.requirements)
    && Array.isArray(outcome.reviewNotes)
    && outcomeAmountsAreValid
    && sourceOfTruthIsValid;
};

export const processCase: CaseProcessor = async ({ answers, documents }) => {
  const body = new FormData();
  body.append("answers", JSON.stringify(answers));
  body.append("document_metadata", JSON.stringify(documents.map(({ category, categoryLabel, file }) => ({
    category,
    categoryLabel,
    name: file.name,
  }))));
  documents.forEach(({ file }) => body.append("documents", file, file.name));

  const response = await fetch("/api/cases", { method: "POST", body });
  if (!response.ok) throw new Error(`Case submission failed (${response.status}).`);
  const result: unknown = await response.json();
  if (!isCaseResult(result)) throw new Error("Case submission returned an invalid result.");
  return result;
};
