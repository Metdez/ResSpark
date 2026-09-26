import { describe, expect, it } from "vitest";

import { getApplicableQuestions, parseAnswer, validateAnswer } from "./flow";
import { questions } from "./questions";

describe("intake flow", () => {
  it("keeps the requested 26-question catalog and hides spouse questions for an unmarried taxpayer", () => {
    const applicable = getApplicableQuestions(questions, {
      filing_status_married: false,
      owns_home: true,
    });

    expect(questions.map((question) => question.id)).toEqual([
      "filing_status_married", "filing_joint_offer", "state_of_residence", "county_of_residence",
      "household_size", "dependents_count", "age_taxpayer", "age_spouse", "owns_home", "rents_home",
      "is_wage_earner", "is_self_employed", "pay_frequency", "vehicle_count", "has_real_property",
      "has_retirement_accounts", "has_life_insurance_cash_value", "has_investment_accounts", "all_returns_filed",
      "in_open_bankruptcy", "filed_bankruptcy_past_7yrs", "in_litigation", "prior_ia_or_oic_default",
      "filed_and_paid_timely_last_5_years", "installment_agreement_last_5_years", "total_tax_owed",
    ]);
    expect(applicable.map((question) => question.id)).not.toContain("filing_joint_offer");
    expect(applicable.map((question) => question.id)).not.toContain("age_spouse");
    expect(applicable.map((question) => question.id)).not.toContain("rents_home");
  });

  it("defines native dropdown choices for state, pay frequency, and vehicle count", () => {
    const state = questions.find((question) => question.id === "state_of_residence");
    const frequency = questions.find((question) => question.id === "pay_frequency");
    const vehicles = questions.find((question) => question.id === "vehicle_count");

    expect(state?.options?.find((option) => option.value === "Florida")?.label).toBe("Florida");
    expect(frequency?.prompt).toBe("How often are you paid?");
    expect(frequency?.options?.map((option) => option.value)).toEqual(["weekly", "biweekly", "semimonthly", "monthly"]);
    expect(vehicles?.options?.map((option) => option.value)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
  });

  it("defines dropdown ranges for household size, dependents, and taxpayer age", () => {
    const household = questions.find((question) => question.id === "household_size");
    const dependents = questions.find((question) => question.id === "dependents_count");
    const age = questions.find((question) => question.id === "age_taxpayer");

    expect(household?.options?.at(0)?.value).toBe("1");
    expect(household?.options?.at(-1)?.value).toBe("50");
    expect(dependents?.options?.at(0)?.value).toBe("0");
    expect(dependents?.options?.at(-1)?.value).toBe("50");
    expect(age?.options?.at(0)?.value).toBe("0");
    expect(age?.options?.at(-1)?.value).toBe("120");
  });

  it("limits county choices to the selected state", () => {
    const county = questions.find((question) => question.id === "county_of_residence");
    const floridaCounties = county?.optionsForAnswers?.({ state_of_residence: "Florida" }) ?? [];

    expect(floridaCounties.some((option) => option.value === "Miami-Dade County")).toBe(true);
    expect(floridaCounties.some((option) => option.value === "Los Angeles County")).toBe(false);
  });

  it("uses concise tax-balance copy and accepts formatted currency", () => {
    const total = questions.find((question) => question.id === "total_tax_owed");

    expect(total?.prompt).toBe("Total amount owed to the IRS");
    expect(total?.valueType).toBe("currency");
    expect(validateAnswer(total!, "$12,345.67")).toBeNull();
    expect(parseAnswer(total!, "$12,345.67")).toBe(12345.67);
    expect(questions.some((question) => question.id === "tax_only_balance")).toBe(false);
    expect(questions.some((question) => question.id === "csed_months_remaining")).toBe(false);
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

  it("asks pay frequency only for wage earners", () => {
    expect(getApplicableQuestions(questions, { is_wage_earner: true })
      .map((question) => question.id)).toContain("pay_frequency");
    expect(getApplicableQuestions(questions, { is_wage_earner: false })
      .map((question) => question.id)).not.toContain("pay_frequency");
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
