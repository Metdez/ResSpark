import { describe, expect, it } from "vitest";

import { getExampleScreen } from "./example-route";

describe("example screen routing", () => {
  it("selects document and result previews from the query string", () => {
    expect(getExampleScreen("?example=documents")).toBe("documents");
    expect(getExampleScreen("?example=results")).toBe("results");
    expect(getExampleScreen("")).toBeNull();
  });
});
