import { describe, expect, it } from "vitest";
import { workspaceName } from "./index.js";

describe("engine workspace", () => {
  it("exports its workspace name", () => {
    expect(workspaceName).toBe("@chatforge/engine");
  });
});
