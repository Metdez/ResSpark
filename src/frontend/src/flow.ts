import type { AnswerValue, Answers, QuestionDefinition } from "./questions";

export function getApplicableQuestions(
  questions: QuestionDefinition[],
  answers: Answers,
): QuestionDefinition[] {
  return questions.filter((question) => question.isApplicable?.(answers) ?? true);
}

export function validateAnswer(question: QuestionDefinition, rawValue: string | boolean): string | null {
  if (question.valueType === "boolean") {
    return typeof rawValue === "boolean" ? null : "Choose an answer to continue.";
  }

  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return "Enter an answer to continue.";
  }

  if (question.valueType === "text") {
    return null;
  }

  const value = Number(rawValue.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(value) || (question.valueType === "integer" && !Number.isInteger(value))) {
    return question.valueType === "integer" ? "Enter a whole number." : "Enter a valid number.";
  }

  if (question.minimum !== undefined && value < question.minimum) {
    return question.valueType === "integer"
      ? `Enter a whole number of at least ${question.minimum}.`
      : `Enter an amount of at least ${question.minimum}.`;
  }

  return null;
}

export function parseAnswer(question: QuestionDefinition, rawValue: string | boolean): AnswerValue {
  if (question.valueType === "boolean") {
    return rawValue as boolean;
  }
  const textValue = rawValue as string;
  if (question.valueType === "text") {
    return textValue.trim();
  }
  return Number(textValue.replace(/[$,\s]/g, ""));
}

export function formatCurrencyAnswer(rawValue: string): string {
  const value = Number(rawValue.replace(/[$,\s]/g, ""));
  return Number.isFinite(value)
    ? value.toLocaleString("en-US", { style: "currency", currency: "USD" })
    : rawValue;
}
