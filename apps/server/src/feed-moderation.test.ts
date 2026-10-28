import { expect, it } from "vitest";
import { FeedModeration } from "./feed-moderation.js";
import { safeDisplayName } from "./chat-router.js";
import type { Idea } from "../../../packages/shared/src/chat.js";

const idea = (id: number, text: string): Idea => ({
  id,
  text,
  author: "good",
  userId: String(id),
  source: "simulator",
  status: "pending",
  createdAt: 1,
});
it("never exposes rule-rejected, provider-flagged or unchecked text", async () => {
  const feed = new FeedModeration(async (texts) =>
    texts.map((s) => s.includes("unsafe")),
  );
  try {
    for (const [i, text] of [
      "spam spam spam spam",
      "Buy my unrelated vacuum cleaner",
      "Discuss unrelated stock prices",
      "slur_placeholder",
      "slur-placeholder",
      "unsafe model flagged",
      "A friendly dragon",
    ].entries())
      feed.add(idea(i, text));
    expect(feed.items()).toEqual([]);
    await feed.flush();
    expect(feed.items()).toEqual([
      { author: "good", text: "A friendly dragon", source: "simulator" },
    ]);
  } finally {
    feed.close();
  }
});
it("fails closed on unavailable moderation and sanitizes display names", async () => {
  const feed = new FeedModeration(async () => {
    throw Error("unavailable");
  });
  try {
    feed.add(idea(1, "A friendly dragon"));
    await feed.flush();
    expect(feed.items()).toEqual([]);
  } finally {
    feed.close();
  }
  expect(safeDisplayName("<script>")).toBe("viewer");
  expect(safeDisplayName("slur_placeholder")).toBe("viewer");
  expect(safeDisplayName("MưaNhỏ")).toBe("MưaNhỏ");
});
it("also requires moderation before command arguments reach mods", async () => {
  const feed = new FeedModeration(async (texts) =>
    texts.map((text) => text.includes("flagged")),
  );
  try {
    expect(await feed.approveText("spam spam")).toBe(false);
    expect(await feed.approveText("flagged content")).toBe(false);
    expect(await feed.approveText("gold sparkles")).toBe(true);
  } finally {
    feed.close();
  }
});
it("clears the approved feed when a later command moderation request fails", async () => {
  let fail = false;
  const feed = new FeedModeration(async (texts) => {
    if (fail) throw Error("unavailable");
    return texts.map(() => false);
  });
  try {
    feed.add(idea(1, "A friendly dragon"));
    await feed.flush();
    expect(feed.items()).toHaveLength(1);
    fail = true;
    expect(await feed.approveText("a different command argument")).toBe(false);
    expect(feed.items()).toEqual([]);
  } finally {
    feed.close();
  }
});
