import { describe, expect, it } from "vitest";
import { workspaceName } from "./index.js";

describe("shared workspace", () => {
  it("exports its workspace name", () => {
    expect(workspaceName).toBe("@chatforge/shared");
  });
});
