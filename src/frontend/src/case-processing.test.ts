// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { processCase } from "./case-processing";

describe("case processing API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts answers, document metadata, and files to the production endpoint", async () => {
    const result = {
      caseLabel: "Case",
      generatedAt: "2026-09-26",
      outcome: {
        id: "simple_plan",
        path: "Simple Payment Plan",
        shortLabel: "Simple payment plan",
        status: "potential_match",
        reason: "Possible match.",
        nextStep: "Professional review.",
        requirements: [],
        reviewNotes: [],
      },
      documents: [],
      financialSections: [],
    };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result });
    vi.stubGlobal("fetch", fetch);
    const file = new File(["transcript"], "account-transcript.pdf", { type: "application/pdf" });

    await expect(processCase({
      answers: { all_returns_filed: true },
      documents: [{ category: "irs_transcripts", categoryLabel: "IRS account transcript", file }],
    })).resolves.toBe(result);

    expect(fetch).toHaveBeenCalledWith("/api/cases", expect.objectContaining({ method: "POST" }));
    const body = fetch.mock.calls[0][1].body as FormData;
    expect(JSON.parse(String(body.get("answers")))).toEqual({ all_returns_filed: true });
    expect(JSON.parse(String(body.get("document_metadata")))).toEqual([{
      category: "irs_transcripts",
      categoryLabel: "IRS account transcript",
      name: "account-transcript.pdf",
    }]);
    expect(body.getAll("documents")).toEqual([file]);
  });

  it("rejects an unsuccessful API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(processCase({ answers: {}, documents: [] })).rejects.toThrow("Case submission failed (503).");
  });

  it("rejects a malformed API result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: "ready" }) }));
    await expect(processCase({ answers: {}, documents: [] })).rejects.toThrow("invalid result");
  });
});
