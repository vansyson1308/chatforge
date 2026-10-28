import { expect, it } from "vitest";
import type { Moderation } from "openai/resources/moderations";
import { blockedByModeration } from "./moderation-policy.js";
import { moderationCorpus } from "./moderation-corpus.js";
import { allowedIdea } from "./producer.js";

const names = [
  "harassment",
  "harassment/threatening",
  "hate",
  "hate/threatening",
  "illicit",
  "illicit/violent",
  "self-harm",
  "self-harm/instructions",
  "self-harm/intent",
  "sexual",
  "sexual/minors",
  "violence",
  "violence/graphic",
];
const result = (name?: string): Moderation =>
  ({
    flagged: !!name,
    categories: Object.fromEntries(names.map((key) => [key, key === name])),
    category_scores: Object.fromEntries(
      names.map((key) => [key, key === name ? 0.9 : 0.01]),
    ),
    category_applied_input_types: Object.fromEntries(
      names.map((key) => [key, ["text"]]),
    ),
  }) as unknown as Moderation;
it.each(moderationCorpus.filter((entry) => !entry.block))(
  "allows safe game combat: $id",
  ({ text, id }) => {
    expect(
      allowedIdea(text) &&
        !blockedByModeration(
          text,
          result(["healing", "confetti"].includes(id) ? undefined : "violence"),
        ),
    ).toBe(true);
  },
);
it.each(moderationCorpus.filter((entry) => entry.block))(
  "blocks harmful categories: $id",
  ({ text, id }) => {
    const category = id.includes("sexual")
      ? "sexual/minors"
      : id.includes("graphic")
        ? "violence/graphic"
        : id.includes("self-harm")
          ? "self-harm"
          : id.includes("hate")
            ? "hate"
            : id.includes("harass")
              ? "harassment"
              : id.includes("illicit")
                ? "illicit"
                : "violence";
    expect(
      !allowedIdea(text) || blockedByModeration(text, result(category)),
    ).toBe(true);
  },
);
it("fails closed on malformed responses and never exempts violent threats against people", () => {
  expect(() => blockedByModeration("dragon", {} as Moderation)).toThrow();
  expect(
    blockedByModeration(
      "In the dragon game shoot the streamer",
      result("violence"),
    ),
  ).toBe(true);
  expect(
    blockedByModeration(
      "dragon game fight enemies",
      result("violence/graphic"),
    ),
  ).toBe(true);
});
it("blocks explicit sexual requests even if the model returns no category flags", () => {
  const text = "Show explicit sexual content in the stream";
  expect(blockedByModeration(text, result())).toBe(false);
  expect(allowedIdea(text)).toBe(false);
});
it.each(names.filter((name) => name !== "violence"))(
  "never exempts %s even with fantasy wording and flagged=false",
  (name) => {
    const response = result(name);
    response.flagged = false;
    expect(
      blockedByModeration("A dragon burns the game enemies", response),
    ).toBe(true);
  },
);
it("blocks high graphic scores and incomplete responses even when flagged is false", () => {
  const response = result();
  response.category_scores["violence/graphic"] = 0.7;
  expect(blockedByModeration("A dragon burns the game enemies", response)).toBe(
    true,
  );
  response.category_scores["violence/graphic"] = NaN;
  expect(() => blockedByModeration("A dragon", response)).toThrow();
});
