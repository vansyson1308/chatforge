import { describe, expect, it } from "vitest";
import { codexUsesApiKey } from "./builder.js";

describe("Codex Builder auth mode", () => {
  it("defaults to the ChatGPT login", () => {
    expect(codexUsesApiKey({})).toBe(false);
    expect(codexUsesApiKey({ CODEX_AUTH: "chatgpt" })).toBe(false);
  });
  it("switches to API-key auth only when explicitly requested", () => {
    expect(codexUsesApiKey({ CODEX_AUTH: "apikey" })).toBe(true);
    expect(codexUsesApiKey({ CODEX_AUTH: " APIKEY " })).toBe(true);
    expect(codexUsesApiKey({ CODEX_AUTH: "api" })).toBe(false);
  });
});
