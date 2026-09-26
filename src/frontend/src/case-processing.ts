import type { Answers } from "./questions";
import { createSandboxCase, type ResolutionCaseResult } from "./resolution-results/model";

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

export const processMockCase: CaseProcessor = async ({ answers, documents }) => {
  const path = answers.all_returns_filed === false || answers.in_open_bankruptcy === true
    ? "blocked"
    : "simple_plan";

  return createSandboxCase(
    answers,
    documents.map(({ category, categoryLabel, file }) => ({
      category,
      categoryLabel,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    })),
    path,
  );
};
