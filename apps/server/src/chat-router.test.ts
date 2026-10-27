import { describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ChatRouter, IdeaInbox, hasLink, sanitize } from "./chat-router.js";
import { CrowdSim, ideas, badIdeas, personas } from "./crowd-sim.js";
import { ChatOut } from "./chat-out.js";
import { TwitchError } from "./twitch-auth.js";
import { mapNotification } from "./eventsub.js";
import type { Chat } from "../../../packages/shared/src/chat.js";
import { World } from "../../../packages/engine/src/world.js";
import { localRequest } from "./local-http.js";
import type { IncomingMessage } from "node:http";

const chat: Chat = {
  type: "chat",
  source: "twitch",
  userId: "42",
  login: "mua",
  displayName: "Mưa小雨",
  text: "!join",
  badges: [],
  isBroadcaster: false,
  isMod: false,
  emoteOnly: false,
};
describe("chat input boundary", () => {
  it("removes controls, zero width and bidi while preserving Unicode and emoji", () => {
    expect(sanitize(" Mưa\u200b小雨\u202e\u2066 \x00\n🔥  hi ")).toBe(
      "Mưa小雨 🔥 hi",
    );
    expect(sanitize("😀".repeat(600))).toHaveLength(1000);
    expect(sanitize("e\u0301")).toBe("é");
    for (const text of [
      "https://example.com",
      "www.example.org",
      "discord.gg/test",
      "example [dot] com",
      "spam\u200b.com",
    ])
      expect(hasLink(sanitize(text))).toBe(true);
    expect(hasLink("Give slimes crowns. Make rain!")).toBe(false);
  });
  it("applies cooldowns, per-user dedupe, round cap, votes and command routing", () => {
    const inbox = new IdeaInbox(":memory:");
    let now = 0;
    const hooks = { join: vi.fn(), command: vi.fn(), reply: vi.fn() };
    const router = new ChatRouter(inbox, hooks, () => now);
    try {
      router.route(chat);
      router.route(chat);
      expect(hooks.join).toHaveBeenCalledTimes(1);
      router.route({ ...chat, text: "!idea tiny crown slimes" });
      expect(router.route({ ...chat, text: "!idea ducks" })).toContain(
        "cooldown",
      );
      now = 10000;
      expect(
        router.route({ ...chat, text: "!idea tiny crown slimes" }),
      ).toContain("duplicate");
      router.route({ ...chat, text: "!idea ducks" });
      expect(inbox.ideas).toHaveLength(2);
      expect(
        router.route({ ...chat, text: "!idea https://spam.invalid" }),
      ).toContain("links");
      expect(
        router.route({ ...chat, text: "!idea Kappa", emoteOnly: true }),
      ).toContain("emote-only");
      expect(router.route({ ...chat, text: "!idea 🔥🔥" })).toContain(
        "emote-only",
      );
      router.route({ ...chat, text: "!vote 1" });
      router.route({ ...chat, text: "!vote 2" });
      expect([...router.votes.values()][0]?.choice).toBe(1);
      now += 2000;
      router.route({ ...chat, text: "!vote 3" });
      expect([...router.votes.values()][0]?.choice).toBe(3);
      router.route({ ...chat, text: "!meteor wow" });
      expect(hooks.command).toHaveBeenCalledWith(
        "!meteor",
        expect.anything(),
        "wow",
      );
      router.route({ ...chat, text: "!help" });
      expect(hooks.reply).toHaveBeenCalledWith(
        expect.stringContaining("!idea"),
        "twitch",
      );
      for (let i = 0; i < 220; i++)
        router.route({
          ...chat,
          userId: String(i + 100),
          text: `!idea feature ${i}`,
        });
      expect(inbox.ideas).toHaveLength(200);
      router.resetRound();
      expect(router.votes.size).toBe(0);
      router.autoJoin = false;
      hooks.join.mockClear();
      router.route({ ...chat, userId: "noauto", text: "hello" });
      expect(hooks.join).not.toHaveBeenCalled();
    } finally {
      inbox.close();
    }
  });
  it("persists inbox with source and stable identity", async () => {
    const dir = await mkdtemp(join(tmpdir(), "chatforge-inbox-"));
    try {
      const file = join(dir, "ideas.sqlite");
      const a = new IdeaInbox(file);
      a.add(chat, "Snow", 123);
      expect(a.claimEvent("event-one", 1000, 1000)).toBe(true);
      expect(a.claimEvent("event-one", 1000, 1000)).toBe(false);
      a.close();
      const b = new IdeaInbox(file);
      try {
        expect(b.claimEvent("event-one", 1000, 1000)).toBe(false);
        expect(b.claimEvent("event-one", 1000, 601001)).toBe(false);
        expect(b.ideas[0]).toMatchObject({
          author: "Mưa小雨",
          userId: "42",
          source: "twitch",
          text: "Snow",
          status: "pending",
          createdAt: 123,
        });
      } finally {
        b.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("keeps IDs distinct from names and retains SIM provenance through queue/checkpoint", () => {
    const world = new World();
    world.setRule("maxHeroes", 1);
    const first = world.joinViewer("Same", "twitch:1")!;
    expect(world.joinViewer("Renamed", "twitch:1")?.id).toBe(first.id);
    world.joinViewer("Same", "simulator:1", true);
    const restore = new World(1, world.snapshot());
    restore.setRule("maxHeroes", 2);
    restore.tick();
    expect(
      restore.state.entities.find((e) => e.viewerId === "simulator:1"),
    ).toMatchObject({ viewer: "Same", simulated: true });
    expect(
      restore.state.entities.find((e) => e.viewerId === "twitch:1")?.viewer,
    ).toBe("Renamed");
  });
  it("blocks foreign origin, DNS rebinding and non-loopback admin requests", () => {
    const req = {
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as IncomingMessage;
    expect(localRequest(req, 3000, true)).toBe(true);
    expect(
      localRequest(
        { ...req, headers: { ...req.headers, origin: "https://evil.invalid" } },
        3000,
      ),
    ).toBe(false);
    expect(
      localRequest(
        { ...req, headers: { host: "attacker.invalid:3000" } },
        3000,
      ),
    ).toBe(false);
    expect(
      localRequest({ ...req, headers: { host: "localhost:3000" } }, 3000, true),
    ).toBe(false);
  });
});
describe("Crowd Sim and outbound isolation", () => {
  it("generates reproducible diverse fixtures with explicit source", () => {
    expect(ideas).toHaveLength(80);
    expect(badIdeas).toHaveLength(10);
    expect(personas).toHaveLength(20);
    const a = new CrowdSim(2026, () => {});
    const b = new CrowdSim(2026, () => {});
    const sequence = Array.from({ length: 1500 }, () => a.next());
    expect(sequence).toEqual(Array.from({ length: 1500 }, () => b.next()));
    expect(new Set(sequence.map((e) => e.type)).size).toBe(5);
    expect(sequence.every((e) => e.source === "simulator")).toBe(true);
    expect(
      sequence.some(
        (e) => e.type === "chat" && e.text.includes("[SLUR_PLACEHOLDER]"),
      ),
    ).toBe(true);
  });
  it("rate-limits, deduplicates, caps Unicode length and never sends simulation", async () => {
    let now = 0;
    const send = vi.fn().mockResolvedValue({ data: [{ is_sent: true }] });
    const out = new ChatOut(send, () => now);
    expect(out.enqueue("Sim!", "simulator")).toBe(false);
    expect(out.enqueue("Hello", "twitch")).toBe(true);
    expect(out.enqueue("Hello", "twitch")).toBe(false);
    out.enqueue("😀".repeat(700), "twitch");
    await out.tick();
    await out.tick();
    expect(send).toHaveBeenCalledTimes(1);
    now = 1600;
    await out.tick();
    expect(send).toHaveBeenCalledTimes(2);
    expect(Array.from(send.mock.calls[1]![0] as string)).toHaveLength(500);
    expect(send.mock.calls[0]![0]).toBe("\u2692 Hello");
    now = 60000;
    expect(out.enqueue("Hello", "twitch")).toBe(true);
    send.mockRejectedValueOnce(new TwitchError(429, 40000));
    await out.tick();
    now += 39999;
    await out.tick();
    expect(send).toHaveBeenCalledTimes(3);
    now++;
    await out.tick();
    expect(send).toHaveBeenCalledTimes(4);
    expect(out.status).toBe("sent");
  });
});
describe("Twitch notification mapping", () => {
  it("maps badges and emote-only ideas", () => {
    expect(
      mapNotification("channel.chat.message", {
        chatter_user_id: "42",
        chatter_user_login: "mua",
        chatter_user_name: "Mưa小雨",
        broadcaster_user_id: "42",
        badges: [{ set_id: "moderator" }],
        message: {
          text: "!idea Kappa",
          fragments: [
            { type: "text", text: "!idea " },
            { type: "emote", text: "Kappa" },
          ],
        },
      }),
    ).toMatchObject({
      userId: "42",
      isMod: true,
      isBroadcaster: true,
      emoteOnly: true,
      source: "twitch",
    });
  });
  it.each([
    ["channel.subscribe", "twitch:sub"],
    ["channel.subscription.gift", "twitch:sub"],
    ["channel.subscription.message", "twitch:sub"],
    ["channel.cheer", "twitch:cheer"],
    ["channel.raid", "twitch:raid"],
    ["channel.follow", "twitch:follow"],
  ])("maps %s", (type, expected) => {
    expect(
      mapNotification(type!, {
        user_id: "1",
        user_name: "Ada",
        from_broadcaster_user_id: "2",
        from_broadcaster_user_name: "Raid",
        bits: 100,
      }),
    ).toMatchObject({ type: expected, count: 100, source: "twitch" });
  });
});
