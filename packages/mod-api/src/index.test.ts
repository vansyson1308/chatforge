import { describe, expect, it } from "vitest";
import { workspaceName } from "./index.js";

describe("mod-api workspace", () => {
  it("exports its workspace name", () => {
    expect(workspaceName).toBe("@chatforge/mod-api");
  });
});
