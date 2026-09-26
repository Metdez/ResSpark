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

const isCaseResult = (value: unknown): value is ResolutionCaseResult => {
  if (!isObject(value) || !isObject(value.outcome)) return false;
  const outcome = value.outcome;
  const documentsAreValid = Array.isArray(value.documents) && value.documents.every((document) =>
    isObject(document)
    && [document.category, document.categoryLabel, document.name, document.type].every((item) => typeof item === "string")
    && typeof document.size === "number");
  const sectionsAreValid = Array.isArray(value.financialSections) && value.financialSections.every((section) =>
    isObject(section)
    && [section.id, section.title, section.description].every((item) => typeof item === "string")
    && Array.isArray(section.fields)
    && section.fields.every((field) => isObject(field)
      && typeof field.key === "string"
      && typeof field.label === "string"
      && (field.value === null || ["string", "number", "boolean"].includes(typeof field.value))));
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
    && Array.isArray(outcome.reviewNotes);
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
