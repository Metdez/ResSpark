import { describe, expect, it } from "vitest";

import { getApplicableQuestions, validateAnswer } from "./flow";
import { questions } from "./questions";

describe("intake flow", () => {
  it("keeps the 28-question intake catalog and hides spouse questions for an unmarried taxpayer", () => {
    const applicable = getApplicableQuestions(questions, {
      filing_status_married: false,
      owns_home: true,
    });

    expect(questions).toHaveLength(28);
    expect(applicable.map((question) => question.id)).not.toContain("filing_joint_offer");
    expect(applicable.map((question) => question.id)).not.toContain("age_spouse");
    expect(applicable.map((question) => question.id)).not.toContain("rents_home");
  });

  it("shows spouse questions for married taxpayers and rental status for non-homeowners", () => {
    const applicable = getApplicableQuestions(questions, {
      filing_status_married: true,
      owns_home: false,
    });

    expect(applicable.map((question) => question.id)).toContain("filing_joint_offer");
    expect(applicable.map((question) => question.id)).toContain("age_spouse");
    expect(applicable.map((question) => question.id)).toContain("rents_home");
  });

  it("requires a whole positive household size and accepts an explicit zero vehicle count", () => {
    const household = questions.find((question) => question.id === "household_size");
    const vehicles = questions.find((question) => question.id === "vehicle_count");

    expect(household).toBeDefined();
    expect(vehicles).toBeDefined();
    expect(validateAnswer(household!, "0")).toBe("Enter a whole number of at least 1.");
    expect(validateAnswer(household!, "1.5")).toBe("Enter a whole number.");
    expect(validateAnswer(vehicles!, "0")).toBeNull();
  });

  it("rejects blank text and accepts a typed text answer", () => {
    const state = questions.find((question) => question.id === "state_of_residence");

    expect(state).toBeDefined();
    expect(validateAnswer(state!, "   ")).toBe("Enter an answer to continue.");
    expect(validateAnswer(state!, "Florida")).toBeNull();
  });
});
