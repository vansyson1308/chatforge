import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { EventSub, subscriptionTypes } from "./eventsub.js";
import { TwitchError } from "./twitch-auth.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const fn of cleanups.splice(0).reverse()) await fn();
});
function packet(
  type: string,
  payload: unknown,
  id = `${type}-${Math.random()}`,
) {
  return JSON.stringify({
    metadata: {
      message_type: type,
      message_id: id,
      message_timestamp: new Date().toISOString(),
    },
    payload,
  });
}
function welcome(socket: WebSocket, id = "session", seconds = 10) {
  socket.send(
    packet("session_welcome", {
      session: { id, keepalive_timeout_seconds: seconds, reconnect_url: null },
    }),
  );
}
async function fixture(seconds = 10) {
  const subscriptions: {
    type: string;
    version: string;
    transport: { session_id: string; method: string };
    condition: Record<string, string>;
  }[] = [];
  const created: number[] = [];
  const sockets: WebSocket[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const data = JSON.parse(body) as (typeof subscriptions)[number];
    subscriptions.push(data);
    created.push(Date.now());
    res.setHeader("Content-Type", "application/json");
    if (data.type === "channel.cheer") {
      res.writeHead(403);
      res.end("{}");
    } else res.end(JSON.stringify({ data: [{ status: "enabled" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No address");
  const base = `127.0.0.1:${address.port}`;
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket, req) => {
    sockets.push(socket);
    if (req.url !== "/transfer")
      welcome(socket, `session-${sockets.length}`, seconds);
  });
  cleanups.push(
    () =>
      new Promise<void>((resolve) => {
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => {
          server.closeAllConnections();
          server.close(() => resolve());
        });
      }),
  );
  const receive = vi.fn();
  const revoked = vi.fn();
  const client = new EventSub({
    userId: () => "42",
    url: `ws://${base}`,
    backoffMs: 20,
    receive,
    revoked,
    subscribe: async (body) => {
      const res = await fetch(`http://${base}/eventsub/subscriptions`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new TwitchError(res.status);
      return res.json();
    },
  });
  cleanups.push(() => client.stop());
  client.start();
  await vi.waitFor(() => expect(subscriptions).toHaveLength(7));
  return { client, base, sockets, subscriptions, created, receive, revoked };
}
const follow = {
  subscription: { type: "channel.follow", status: "enabled" },
  event: { user_id: "123", user_name: "Mưa小雨" },
};
describe("fake EventSub WebSocket and fake Helix", () => {
  it("subscribes within the welcome window with correct versions and conditions", async () => {
    const start = Date.now();
    const f = await fixture();
    expect(Math.max(...f.created) - start).toBeLessThan(10000);
    expect(f.subscriptions.map((s) => s.type).sort()).toEqual(
      [...subscriptionTypes].sort(),
    );
    expect(
      f.subscriptions.every(
        (s) =>
          s.transport.method === "websocket" &&
          s.transport.session_id === "session-1",
      ),
    ).toBe(true);
    expect(
      f.subscriptions.find((s) => s.type === "channel.chat.message")?.condition,
    ).toEqual({ broadcaster_user_id: "42", user_id: "42" });
    expect(
      f.subscriptions.find((s) => s.type === "channel.follow"),
    ).toMatchObject({
      version: "2",
      condition: { broadcaster_user_id: "42", moderator_user_id: "42" },
    });
    expect(
      f.subscriptions.find((s) => s.type === "channel.raid")?.condition,
    ).toEqual({ to_broadcaster_user_id: "42" });
    await vi.waitFor(() =>
      expect(
        f.client.statuses.find((s) => s.type === "channel.cheer"),
      ).toMatchObject({
        status: "unavailable",
        reason: "HTTP 403: check permission / channel eligibility",
      }),
    );
  });
  it("keeps old socket until reconnect welcome, transfers without subscribing twice, dedupes", async () => {
    const f = await fixture();
    const old = f.sockets[0]!;
    const notification = packet("notification", follow, "same-id");
    old.send(notification);
    old.send(notification);
    old.send(
      packet("session_reconnect", {
        session: {
          id: "session-1",
          keepalive_timeout_seconds: null,
          reconnect_url: `ws://${f.base}/transfer`,
        },
      }),
    );
    await vi.waitFor(() => expect(f.sockets).toHaveLength(2));
    expect(old.readyState).toBe(1);
    old.send(packet("notification", follow, "during-transfer"));
    const next = f.sockets[1]!;
    welcome(next, "transferred");
    next.send(notification);
    await vi.waitFor(() => expect(old.readyState).toBe(3));
    await vi.waitFor(() => expect(f.receive).toHaveBeenCalledTimes(2));
    expect(f.subscriptions).toHaveLength(7);
    expect(f.client.state).toBe("connected");
  });
  it("handles revocation and ignores malformed or stale notifications", async () => {
    const f = await fixture();
    const socket = f.sockets[0]!;
    socket.send("not-json");
    socket.send(
      JSON.stringify({
        metadata: {
          message_type: "notification",
          message_id: "stale",
          message_timestamp: "2020-01-01T00:00:00Z",
        },
        payload: follow,
      }),
    );
    socket.send(
      packet("revocation", {
        subscription: {
          type: "channel.follow",
          status: "authorization_revoked",
        },
      }),
    );
    await vi.waitFor(() => expect(f.revoked).toHaveBeenCalledOnce());
    expect(
      f.client.statuses.find((s) => s.type === "channel.follow"),
    ).toMatchObject({ status: "unavailable", reason: "authorization_revoked" });
    expect(f.receive).not.toHaveBeenCalled();
  });
  it("resets keepalive deadline then reconnects with fresh subscriptions on silence", async () => {
    const f = await fixture(0.1);
    const keepalive = setInterval(
      () => f.sockets[0]?.send(packet("session_keepalive", {})),
      100,
    );
    try {
      await new Promise((resolve) => setTimeout(resolve, 1300));
      expect(f.sockets).toHaveLength(1);
    } finally {
      clearInterval(keepalive);
    }
    await vi.waitFor(
      () => expect(f.subscriptions.length).toBeGreaterThanOrEqual(14),
      { timeout: 3000 },
    );
  }, 6000);
});
