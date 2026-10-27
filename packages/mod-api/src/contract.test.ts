import { describe, expect, it } from "vitest";
import { validateSprite } from "./contract.js";

describe("pixel sprite validation", () => {
  it("accepts bounded grids with declared hex colors and transparency", () => {
    expect(
      validateSprite({ grid: [".aa.", "aaaa"], palette: { a: "#00ff33" } }),
    ).toBe(true);
  });
  it("rejects ragged, oversized, undeclared, and unsafe colors", () => {
    expect(
      validateSprite({ grid: ["a", "aa"], palette: { a: "#00ff33" } }),
    ).toBe(false);
    expect(
      validateSprite({ grid: ["a".repeat(25)], palette: { a: "#00ff33" } }),
    ).toBe(false);
    expect(validateSprite({ grid: ["ab"], palette: { a: "#00ff33" } })).toBe(
      false,
    );
    expect(validateSprite({ grid: ["a"], palette: { a: "url(unsafe)" } })).toBe(
      false,
    );
    expect(
      validateSprite({
        grid: ["a"],
        palette: Object.fromEntries(
          "abcdefghi".split("").map((key) => [key, "#000000"]),
        ),
      }),
    ).toBe(false);
  });
});
