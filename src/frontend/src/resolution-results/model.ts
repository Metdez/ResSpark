export type ResolutionPathId =
  | "cnc"
  | "simple_plan"
  | "non_simple_installment"
  | "oic"
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
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  netDisposableIncome: number | null;
  netRealizableEquity: number | null;
  suggestedOfferOrPayment: number | null;
  reviewNotes: string[];
}

export type SourceKind = "questionnaire" | "document" | "derived" | "assumption" | "unknown";

export interface FieldSource {
  kind: SourceKind;
  label: string;
  documentName?: string;
  snippet?: string | null;
}

export interface FinancialField {
  key: string;
  label: string;
  value: string | number | boolean | null;
  format?: "currency" | "boolean" | "number" | "text";
  sources?: FieldSource[];
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

export interface NeededDocument {
  title: string;
  detail: string;
}

export interface CalculationInput {
  label: string;
  value: string | number | boolean | null;
}

export interface CalculationStep {
  label: string;
  formula: string;
  inputs: CalculationInput[];
  inputKeys: string[];
  result: string | number | boolean | null;
  format: "currency" | "boolean" | "number" | "text";
  status?: "pass" | "fail" | "matched" | "not_evaluated";
}

export interface CalculationSection {
  id: string;
  title: string;
  description: string;
  steps: CalculationStep[];
}

export interface DocumentEvidenceField extends FinancialField {
  snippet?: string | null;
  usedInCanonical: boolean;
}

export interface DocumentEvidence {
  name: string;
  category: string;
  categoryLabel: string;
  detectedType: string;
  status: "parsed" | "needs_review";
  error: string | null;
  fields: DocumentEvidenceField[];
}

export interface SourceOfTruth {
  fieldSections: FinancialSection[];
  calculationSections: CalculationSection[];
  documentEvidence: DocumentEvidence[];
}

export interface ResolutionCaseResult {
  caseLabel: string;
  generatedAt: string;
  outcome: ResolutionOutcome;
  documents: UploadedDocument[];
  neededDocuments?: NeededDocument[];
  financialSections: FinancialSection[];
  sourceOfTruth: SourceOfTruth;
}
