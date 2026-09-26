// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { processMockCase } from "./case-processing";

describe("mock case processing", () => {
  it("preserves answers and converts selected files into result summaries", async () => {
    const result = await processMockCase({
      answers: { total_tax_owed: 12_345, all_returns_filed: true, in_open_bankruptcy: false },
      documents: [{
        category: "irs_transcripts",
        categoryLabel: "IRS account transcript",
        file: new File(["transcript"], "account-transcript.pdf", { type: "application/pdf" }),
      }],
    });

    expect(result.outcome.id).toBe("simple_plan");
    expect(result.documents[0]).toMatchObject({
      category: "irs_transcripts",
      name: "account-transcript.pdf",
      type: "application/pdf",
    });
    expect(result.financialSections.flatMap((section) => section.fields)
      .find((field) => field.key === "total_tax_owed")?.value).toBe(12_345);
  });

  it.each([
    ["unfiled returns", { all_returns_filed: false }],
    ["open bankruptcy", { all_returns_filed: true, in_open_bankruptcy: true }],
  ])("uses the blocked mock outcome for %s", async (_label, answers) => {
    expect((await processMockCase({ answers, documents: [] })).outcome.id).toBe("blocked");
  });
});
