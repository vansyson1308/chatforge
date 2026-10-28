import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { afterEach, expect, it, vi } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import type { ForgeView } from "../../../packages/shared/src/forge.js";
import { EventSub } from "./eventsub.js";
import { IdeaInbox, ChatRouter } from "./chat-router.js";
import { ModHost } from "./mod-host.js";
import { ForgeLoop } from "./forge-loop.js";
import { gatekeeper } from "./gatekeeper.js";
import { goodMod, testCards } from "./forge-fixtures.js";

afterEach(() => vi.useRealTimers());
it("fake EventSub chat reaches LIVE, then failed repair preserves the game and a real runtime fault broadcasts rollback", async () => {
  const http = createServer(),
    wss = new WebSocketServer({ server: http });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const address = http.address();
  if (!address || typeof address === "string") throw Error("missing port");
  let socket: WebSocket | undefined,
    received: (() => void) | undefined,
    serial = 0;
  const packet = (type: string, payload: unknown) =>
    JSON.stringify({
      metadata: {
        message_id: `test-${++serial}`,
        message_type: type,
        message_timestamp: new Date().toISOString(),
      },
      payload,
    });
  wss.on("connection", (ws) => {
    socket = ws;
    ws.send(
      packet("session_welcome", {
        session: {
          id: "test",
          keepalive_timeout_seconds: 120,
          reconnect_url: null,
        },
      }),
    );
  });
  const inbox = new IdeaInbox(":memory:"),
    host = new ModHost(new World(2026)),
    frames: ForgeView[] = [],
    announcements: string[] = [];
  await host.load("seed", "export function register(api){}");
  host.markBaseline();
  const router = new ChatRouter(inbox, {
    join: (chat) => {
      host.world.joinViewer(chat.displayName, `twitch:${chat.userId}`);
    },
    reply: () => {},
    command: () => {},
  });
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  let calls = 0;
  const loop = new ForgeLoop(inbox, {
    producer: {
      curate: async (ideas) => {
        const cards = structuredClone(testCards);
        cards[0]!.ideaIds = ideas.map((i) => i.id);
        cards[0]!.credits = ideas.map((i) => ({
          id: i.userId,
          name: i.author,
          source: i.source,
        }));
        return { cards, rejected: [], tokens: 0 };
      },
    },
    builder: {
      build: async () => ({
        source:
          ++calls === 1
            ? goodMod
                .replace("forged by the community", "@ada")
                .replace(
                  "export function register(api) {",
                  "export function register(api) { api.every(1801,()=>{throw Error('late fault')});",
                )
            : "export function register(api){} export const forgeTest={expect:{minEffects:1}};",
        tokens: 0,
      }),
    },
    simulation: {
      checkpoint: async () => host.exportCheckpoint(),
      deploy: (id, source) => host.load(id, source),
      rollback: async (id) => {
        host.rollback(id);
        return host.exportCheckpoint();
      },
      safeMode: async () => {
        host.safeMode();
        return host.exportCheckpoint();
      },
      celebrate: async () => {},
      showcase: async (id, command, event) => host.showcase(id, command, event),
    },
    gate: (input, _signal, onCheck) => gatekeeper(input, onCheck),
    broadcast: (view) => frames.push(structuredClone(view)),
    announce: (text) => announcements.push(text),
    resetRound: () => router.resetRound(),
    connection: () => ({ twitchEnabled: true, eventsub: client.state }),
  });
  router.onVote = (chat, choice) => loop.vote(chat, choice);
  const client = new EventSub({
    userId: () => "42",
    url: `ws://127.0.0.1:${address.port}`,
    subscribe: async () => ({ data: [{ status: "enabled" }] }),
    revoked: () => {},
    receive: (event) => {
      if (event.type === "chat") router.route(event);
      received?.();
    },
  });
  const send = async (user: string, text: string) => {
    const delivered = new Promise<void>((r) => {
      received = r;
    });
    socket!.send(
      packet("notification", {
        subscription: { type: "channel.chat.message", status: "enabled" },
        event: {
          chatter_user_id: user,
          chatter_user_login: user,
          chatter_user_name: user,
          broadcaster_user_id: "42",
          badges: [],
          message: { text, fragments: [{ type: "text", text }] },
        },
      }),
    );
    await delivered;
    received = undefined;
  };
  try {
    client.start();
    await vi.waitFor(() => expect(client.state).toBe("connected"), {
      timeout: 15000,
    });
    loop.start("demo");
    await send("ada", "!idea summon a rubber duck");
    expect(inbox.pending()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(45500);
    await loop.settled();
    expect(loop.round?.stage).toBe("VOTING");
    await send("bob", "!vote 1");
    expect(loop.round?.tallies[0]).toBe(1);
    socket!.terminate();
    await vi.waitFor(() => expect(client.state).toBe("reconnecting"), {
      timeout: 15000,
    });
    loop.pulse();
    expect(frames.at(-1)?.connection?.eventsub).toBe("reconnecting");
    await vi.waitFor(() => expect(client.state).toBe("connected"), {
      timeout: 15000,
    });
    expect(loop.round?.tallies[0]).toBe(1);
    await vi.advanceTimersByTimeAsync(40500);
    await loop.settled();
    expect(loop.build?.stage).toBe("SHOWCASE");
    expect(loop.round).toBeNull();
    await vi.advanceTimersByTimeAsync(14250);
    await loop.settled();
    expect(loop.build?.stage).toBe("LIVE");
    expect(announcements.some((s) => s.includes("Shipped:"))).toBe(true);
    expect(host.world.state.mods["forge-1-1"]).toBeDefined();
    await send("carol", "!idea giant dragon ally");
    await vi.advanceTimersByTimeAsync(45500);
    await loop.settled();
    expect(loop.round?.stage).toBe("VOTING");
    await send("dave", "!vote 1");
    await vi.advanceTimersByTimeAsync(40500);
    await loop.settled();
    expect(loop.build?.stage).toBe("FAILED");
    expect(calls).toBe(4);
    expect(host.world.state.mods["forge-1-1"]).toBeDefined();
    expect(
      frames.some((v) => v.build?.stage === "BUILDING" && v.build.attempts > 1),
    ).toBe(true);
    for (let i = 0; i < 1801; i++) host.tick();
    expect(host.diagnostics).toHaveLength(1);
    loop.acceptCheckpoint(host.exportCheckpoint(), true);
    expect(frames.at(-1)?.build?.stage).toBe("ROLLED_BACK");
  } finally {
    client.stop();
    await loop.close();
    host.dispose();
    inbox.close();
    for (const ws of wss.clients) ws.terminate();
    await new Promise<void>((r) => wss.close(() => http.close(() => r())));
  }
}, 60000);
