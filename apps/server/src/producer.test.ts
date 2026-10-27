import { expect, it, vi } from "vitest";
import { ForgeProducer, clusterIdeas } from "./producer.js";
import type { Idea } from "../../../packages/shared/src/chat.js";
const idea = (id: number, text: string): Idea => ({
  id,
  text,
  author: `Viewer${id}`,
  userId: String(id),
  source: "simulator",
  createdAt: 0,
  status: "pending",
});
import { testCards } from "./forge-fixtures.js";
it("moderates, merges duplicate credits, canonicalizes names and labels fillers", async () => {
  const input = [
    idea(1, "rain rubber ducks"),
    idea(2, "rain rubber ducks!"),
    idea(3, "delete files"),
    idea(4, "moderation rejected"),
  ];
  const cards = structuredClone(testCards);
  cards[0]!.credits = [{ id: "1", name: "invented", source: "simulator" }];
  cards[0]!.suggestion = false;
  const moderate = vi.fn(async () => [false, false, true]);
  const producer = new ForgeProducer({
    moderate,
    cards: async () => ({
      value: {
        cards: cards.map((c, i) => ({ ...c, groupIds: i === 0 ? [0] : [] })),
      },
      tokens: 71,
    }),
  });
  const result = await producer.curate(
    input,
    ["meteor shower"],
    new AbortController().signal,
  );
  expect(result.rejected).toEqual([3, 4]);
  expect(moderate).toHaveBeenCalledOnce();
  expect(result.cards[0]!.credits.map((c) => c.name)).toEqual([
    "Viewer1",
    "Viewer2",
  ]);
  expect(
    result.cards.slice(1).every((c) => c.suggestion && c.credits.length === 0),
  ).toBe(true);
  expect(result.tokens).toBe(71);
});
it("clusters near duplicates and fails closed on incomplete moderation/schema", async () => {
  expect(
    clusterIdeas([
      idea(1, "make rubber ducks rain"),
      idea(2, "rubber ducks rain"),
    ]),
  ).toHaveLength(1);
  const signal = new AbortController().signal;
  await expect(
    new ForgeProducer({
      moderate: async () => [],
      cards: async () => ({ value: {}, tokens: 0 }),
    }).curate([idea(1, "ducks")], [], signal),
  ).rejects.toThrow("incomplete");
  await expect(
    new ForgeProducer({
      moderate: async () => [false],
      cards: async () => ({ value: { cards: [] }, tokens: 0 }),
    }).curate([idea(1, "ducks")], [], signal),
  ).rejects.toThrow();
});
it("does not preserve fabricated attribution", async () => {
  const cards = structuredClone(testCards);
  cards[0]!.credits = [{ id: "invented", name: "Celebrity", source: "twitch" }];
  const result = await new ForgeProducer({
    moderate: async () => [],
    cards: async () => ({
      value: { cards: cards.map((c) => ({ ...c, groupIds: [] })) },
      tokens: 0,
    }),
  }).curate([], [], new AbortController().signal);
  expect(
    result.cards.every((c) => c.suggestion && c.credits.length === 0),
  ).toBe(true);
});
