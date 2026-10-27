import { describe, expect, it, vi } from "vitest";
const testTempRoot = resolve(process.cwd(), "runtime/tmp");
mkdirSync(testTempRoot, { recursive: true });
import type { IncomingMessage } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { documentNavigation, localRequest } from "./local-http.js";
import { ChatOut } from "./chat-out.js";
import { CrowdSim } from "./crowd-sim.js";
import { IdeaInbox } from "./chat-router.js";
import type { Chat } from "../../../packages/shared/src/chat.js";

describe("M2 real-live regressions", () => {
  it("allows cross-site top-level documents while retaining all admin/WS boundaries", () => {
    const base = {
      method: "GET",
      headers: {
        host: "localhost:3000",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      socket: { remoteAddress: "127.0.0.1" },
    } as IncomingMessage;
    for (const url of [
      "/dashboard/",
      "/overlay/?mode=overlay",
      "/auth/twitch/login",
      "/auth/twitch/callback?code=x",
    ]) {
      const req = { ...base, url };
      expect(localRequest(req, 3000, false, documentNavigation(req))).toBe(
        true,
      );
      expect(localRequest(req, 3000)).toBe(false); // WebSocket verification never opts in.
      expect(
        localRequest(
          { ...req, headers: { ...req.headers, host: "evil.test:3000" } },
          3000,
          false,
          true,
        ),
      ).toBe(false);
    }
    for (const url of ["/api/status", "/api/config", "/forge/patch-notes"])
      expect(documentNavigation({ ...base, url })).toBe(false);
    expect(
      documentNavigation({ ...base, method: "POST", url: "/dashboard/" }),
    ).toBe(false);
    expect(
      documentNavigation({
        ...base,
        url: "/dashboard/",
        headers: { ...base.headers, "sec-fetch-mode": "cors" },
      }),
    ).toBe(false);
  });
  it("sends U+2692 as the exact UTF-8 bytes E2 9A 92", async () => {
    const send = vi.fn().mockResolvedValue({ data: [{ is_sent: true }] });
    const out = new ChatOut(send);
    out.enqueue("Hello", "twitch");
    await out.tick();
    expect(
      Buffer.from(send.mock.calls[0]![0] as string).subarray(0, 3),
    ).toEqual(Buffer.from([0xe2, 0x9a, 0x92]));
  });
  it("continues RNG through toggles/restart and dedupes pending normalized ideas durably", async () => {
    const dir = await mkdtemp(join(testTempRoot, "chatforge-regression-"));
    try {
      const file = join(dir, "ideas.sqlite");
      let db = new IdeaInbox(file);
      const a = new CrowdSim(
        2026,
        () => {},
        (rng) => db.setSetting("sim-rng", String(rng)),
      );
      a.next();
      a.stop();
      a.setIntensity("hype");
      a.next();
      const saved = Number(db.setting("sim-rng"));
      const c: Chat = {
        type: "chat",
        userId: "42",
        login: "ada",
        displayName: "Ada",
        source: "simulator",
        text: "",
        badges: [],
        isMod: false,
        isBroadcaster: false,
        emoteOnly: false,
      };
      expect(db.add(c, "Tiny  Crowns", 1)).toBeDefined();
      db.close();
      db = new IdeaInbox(file);
      try {
        expect(db.add(c, " tiny crowns ", 2)).toBeUndefined();
        expect(db.ideas.filter((i) => i.status === "pending")).toHaveLength(1);
        expect(new CrowdSim(saved, () => {}).next()).toEqual(a.next());
      } finally {
        db.close();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
