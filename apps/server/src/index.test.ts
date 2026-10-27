import { describe, expect, it } from "vitest";
import { workspaceName } from "./index.js";

describe("server workspace", () => {
  it("exports its workspace name", () => {
    expect(workspaceName).toBe("@chatforge/server");
  });
});
