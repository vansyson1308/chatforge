import { expect, it } from "vitest";
import { formatCredit, formatCredits } from "./forge.js";
it("always makes simulated credits explicit and leaves real credits unambiguous", () => {
  const simulated = { name: "MưaNhỏ", source: "simulator" },
    real = { name: "Ada", source: "twitch" };
  expect(formatCredit(simulated)).toBe("@MưaNhỏ (SIM)");
  expect(formatCredits([real, simulated])).toBe("@Ada, @MưaNhỏ (SIM)");
});
