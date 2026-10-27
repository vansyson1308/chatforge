import { expect, it } from "vitest";
import { IdeaInbox } from "./chat-router.js";
it("retains not-chosen ideas in the pool and distinguishes moderation from merged/used", () => {
  const inbox = new IdeaInbox(":memory:");
  try {
    for (let n = 0; n < 4; n++)
      inbox.add(
        {
          type: "chat",
          source: "simulator",
          userId: String(n),
          login: "sim",
          displayName: "SIM",
          text: "idea",
          badges: [],
          isBroadcaster: false,
          isMod: false,
          emoteOnly: false,
        },
        `dragon ${n}`,
        0,
      );
    inbox.mark(1, "not chosen");
    inbox.mark(2, "merged");
    inbox.mark(3, "used");
    inbox.mark(4, "rejected", "Moderation: unsafe real-world request");
    expect(inbox.pending().map((i) => i.id)).toEqual([1]);
    expect(
      inbox.hasPending({ source: "simulator", userId: "0" }, "dragon 0"),
    ).toBe(true);
    expect(inbox.ideas[3]!.reason).toContain("Moderation");
    expect(inbox.ideas.map((i) => i.status)).toEqual([
      "not chosen",
      "merged",
      "used",
      "rejected",
    ]);
  } finally {
    inbox.close();
  }
});
