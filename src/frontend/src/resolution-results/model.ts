export type ResolutionPathId =
  | "cnc"
  | "simple_plan"
  | "non_simple_installment"
  | "manual_equity"
  | "manual_payment"
  | "blocked";

export interface ResolutionOutcome {
  id: ResolutionPathId;
  path: string;
  shortLabel: string;
  status: "potential_match" | "manual_review" | "blocked";
  reason: string;
  nextStep: string;
  requirements: string[];
  monthlyIncome: number;
  monthlyExpenses: number;
  netDisposableIncome: number;
  netRealizableEquity: number;
  suggestedOfferOrPayment: number;
  reviewNotes: string[];
}

export interface FinancialField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  format?: "currency" | "boolean" | "number" | "text";
}

export interface FinancialSection {
  id: string;
  title: string;
  description: string;
  fields: FinancialField[];
}

export interface UploadedDocument {
  category: string;
  categoryLabel: string;
  name: string;
  type: string;
  size: number;
}

export interface ResolutionCaseResult {
  caseLabel: string;
  generatedAt: string;
  outcome: ResolutionOutcome;
  documents: UploadedDocument[];
  financialSections: FinancialSection[];
}
