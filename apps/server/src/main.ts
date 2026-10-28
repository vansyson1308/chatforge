import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Worker } from "node:worker_threads";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve, extname, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { loadEnvironment } from "./environment.js";
import { Audience } from "./audience.js";
import {
  localRequest,
  localOrigins,
  documentNavigation,
} from "./local-http.js";
import { ForgeLoop } from "./forge-loop.js";
import { ForgeStore } from "./forge-store.js";
import { WorkspaceBuilder, codexUsesApiKey } from "./builder.js";
import { openAIProducer } from "./producer.js";
import { openAIFeedModeration } from "./feed-moderation.js";
import { runGate } from "./gate-runner.js";
import type { HostCheckpoint } from "./mod-host.js";

loadEnvironment(resolve(process.cwd(), "../../.env"));
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
const showcaseMs = Number(process.env.SHOWCASE_MS ?? 14000);
if (!Number.isInteger(showcaseMs) || showcaseMs < 5000 || showcaseMs > 60000)
  throw new Error("SHOWCASE_MS must be an integer between 5000 and 60000");
const worker = new Worker(new URL("./sim-worker.js", import.meta.url));
const requests = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();
let sequence = 0;
let lastSnapshot: string | undefined;
let stopping = false;
let simulationReady = false;
let overlayClients = 0;
let openAIHealth:
  | "unverified"
  | "checking"
  | "healthy"
  | "invalid"
  | "unavailable"
  | "missing" = process.env.OPENAI_API_KEY ? "unverified" : "missing";
async function checkOpenAI(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    openAIHealth = "missing";
    return;
  }
  openAIHealth = "checking";
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    openAIHealth = response.ok
      ? "healthy"
      : response.status === 401 || response.status === 403
        ? "invalid"
        : "unavailable";
  } catch {
    openAIHealth = "unavailable";
  }
}
const tickBins = Array<number>(1001).fill(0);
const exampleDirectory = resolve(process.cwd(), "examples");
const runtimeDirectory = resolve(process.cwd(), "../../runtime/mods");
async function readMod(id: string): Promise<string> {
  if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id)) throw new Error("Invalid mod id");
  for (const directory of [runtimeDirectory, exampleDirectory]) {
    const path = resolve(directory, `${id}.js`);
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > 100000)
        throw new Error("Invalid mod file");
      return await readFile(path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  throw new Error("Mod file not found");
}
function sendCommand(payload: Record<string, unknown>): Promise<unknown> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      requests.delete(id);
      reject(new Error("Simulation timed out"));
    }, 5000);
    requests.set(id, { resolve, reject, timer });
    worker.postMessage({ ...payload, id });
  });
}
function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
function body(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let content = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      content += chunk;
      if (content.length > 110000) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(content) as unknown);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
const root = resolve(process.cwd(), "../..");
const audience = await Audience.create(root, process.env, sendCommand);
const forgeStore = new ForgeStore(audience.inbox.db);
const checkpoint = () =>
  sendCommand({ type: "checkpoint" }) as Promise<HostCheckpoint>;
const feed = openAIFeedModeration(process.env, () => forge.publish());
audience.inbox.onAdded = (idea) => {
  feed.add(idea);
  const roundId = forge.round?.id;
  if (idea.source === "twitch")
    void feed.approveText(idea.text).then((approved) => {
      if (approved && !stopping) forge.acknowledgeIdea(idea, roundId);
    });
};
audience.approveCommandArgs = (text) => feed.approveText(text);
const forge = new ForgeLoop(audience.inbox, {
  feed: () => feed.items(),
  producer: {
    curate: (...args) => openAIProducer(process.env).curate(...args),
  },
  builder: new WorkspaceBuilder(root, process.env, {
    get: () => forgeStore.threadId,
    set: (id) => {
      forgeStore.threadId = id;
    },
  }),
  simulation: {
    checkpoint,
    deploy: async (modId, source) => {
      await sendCommand({ type: "load", modId, source });
    },
    rollback: (modId) =>
      sendCommand({ type: "rollback", modId }) as Promise<HostCheckpoint>,
    safeMode: () =>
      sendCommand({ type: "safe-mode" }) as Promise<HostCheckpoint>,
    retire: (modId) =>
      sendCommand({ type: "retire", modId }) as Promise<HostCheckpoint>,
    restore: async (checkpoint) => {
      await sendCommand({ type: "restore", checkpoint });
    },
    celebrate: async (text) => {
      await sendCommand({ type: "celebrate", text });
    },
    showcase: async (id, command, event) => {
      await sendCommand({ type: "showcase", modId: id, command, event });
    },
  },
  gate: runGate,
  connection: () => ({
    twitchEnabled: audience.config.sources.includes("twitch"),
    eventsub: audience.eventsub.state,
  }),
  diagnostic: (error) =>
    console.error(
      "Forge diagnostic:",
      error instanceof Error ? error.name : "Unknown error",
    ),
  broadcast: (view) => {
    const data = JSON.stringify(view);
    for (const client of sockets.clients)
      if (
        client.readyState === WebSocket.OPEN &&
        client.bufferedAmount < 1000000
      )
        client.send(data);
  },
  announce: (text, eventKey) => audience.announce(text, eventKey),
  resetRound: () => audience.router.resetRound(),
  buildTimeoutMs: Number(process.env.BUILD_TIMEOUT_MS ?? 240000),
  buildCap: Number(process.env.BUILDS_PER_HOUR ?? 12),
  showcaseMs,
});
audience.router.onVote = (chat, choice) => forge.vote(chat, choice);
audience.router.forgeStatus = () =>
  `ChatForge: ${forge.build?.stage ?? forge.round?.stage ?? "IDLE"}. ${forge.notice}`;
const server = createServer(async (req, res) => {
  if (stopping) {
    json(res, 503, { error: "Server stopping" });
    return;
  }
  // OAuth navigation crosses hosts; state + browser cookie secure the callback.
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const isCallback =
    url.pathname === "/auth/twitch/callback" && req.method === "GET";
  if (!localRequest(req, port, false, documentNavigation(req))) {
    json(res, 403, { error: "Local access only" });
    return;
  }
  if (req.headers.origin && localOrigins(port).has(req.headers.origin))
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "content-type",
    });
    res.end();
    return;
  }
  try {
    if (req.method === "GET" && url.pathname === "/auth/twitch/login") {
      // Keep the browser-bound state cookie on the registered callback host.
      if (`http://${req.headers.host}` !== audience.auth.callbackOrigin) {
        res.writeHead(302, {
          Location: `${audience.auth.callbackOrigin}/auth/twitch/login`,
        });
        res.end();
        return;
      }
      const browser = randomBytes(32).toString("hex");
      const location = audience.auth.login(browser);
      res.writeHead(302, {
        Location: location,
        "Set-Cookie": `chatforge_oauth=${browser}; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=300`,
      });
      res.end();
      return;
    }
    if (isCallback) {
      const browser =
        req.headers.cookie
          ?.split("; ")
          .find((c) => c.startsWith("chatforge_oauth="))
          ?.slice(16) ?? "";
      await audience.auth.callback(
        url.searchParams.get("code") ?? "",
        url.searchParams.get("state") ?? "",
        browser,
      );
      audience.configure(audience.config);
      res.writeHead(302, {
        Location: "/dashboard/",
        "Set-Cookie":
          "chatforge_oauth=; HttpOnly; SameSite=Lax; Path=/auth/twitch; Max-Age=0",
      });
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/status") {
      json(res, 200, audience.status());
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/ideas") {
      const page = Number(url.searchParams.get("page") ?? "0");
      if (!Number.isSafeInteger(page) || page < 0 || page > 100000) {
        json(res, 400, { error: "Invalid page" });
        return;
      }
      json(res, 200, {
        ideas: audience.inbox.pendingPage(page * 30),
        total: audience.inbox.pendingCount(),
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/readiness") {
      let codexLoginFound =
        codexUsesApiKey(process.env) && !!process.env.OPENAI_API_KEY;
      if (!codexLoginFound)
        try {
          await access(
            resolve(
              process.env.CODEX_HOME ?? resolve(homedir(), ".codex"),
              "auth.json",
            ),
          );
          codexLoginFound = true;
        } catch {
          /* Local login has not been found. */
        }
      const status = audience.status();
      json(res, 200, {
        twitch: status.auth.health === "healthy",
        eventsub:
          status.eventsub.state === "connected" &&
          status.eventsub.subscriptions.some(
            (s) => s.type === "channel.chat.message" && s.status === "enabled",
          ),
        codexLoginFound,
        openAIHealth,
        overlay: overlayClients > 0,
        safeMode: audience.inbox.setting("safe-mode") === "true",
        simulationReady,
      });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/forge") {
      json(res, 200, forge.view());
      return;
    }
    if (
      req.method === "GET" &&
      url.pathname === "/api/metrics" &&
      process.env.CHATFORGE_METRICS === "1"
    ) {
      json(res, 200, { rss: process.memoryUsage().rss, tickBins });
      return;
    }
    if (req.method === "GET" && url.pathname === "/forge/patch-notes") {
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="chatforge-patch-notes.md"',
      });
      res.end(forge.store.patchNotes());
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST" || !localRequest(req, port, true)) {
        json(res, 403, { error: "Forbidden" });
        return;
      }
      if (url.pathname.startsWith("/api/forge/")) {
        if (!simulationReady) {
          json(res, 503, { error: "Simulation starting" });
          return;
        }
        const input = (await body(req)) as {
          preset?: unknown;
          modId?: unknown;
          enabled?: unknown;
          limit?: unknown;
          choice?: unknown;
        };
        switch (url.pathname.slice("/api/forge/".length)) {
          case "start":
            if (input.preset !== "demo" && input.preset !== "normal")
              throw Error("Invalid preset");
            forge.start(input.preset);
            break;
          case "stop":
            forge.stop();
            break;
          case "approve":
            forge.approve();
            break;
          case "veto":
            forge.veto();
            break;
          case "cancel":
            forge.cancel();
            break;
          case "rollback":
            if (
              input.modId !== undefined &&
              (typeof input.modId !== "string" ||
                !forge.store.mods().some((m) => m.id === input.modId))
            )
              throw Error("Unknown generated mod");
            await forge.rollback(input.modId as string | undefined);
            break;
          case "safe-mode":
            await forge.safeMode();
            break;
          case "retirement":
            if (
              typeof input.enabled !== "boolean" ||
              typeof input.limit !== "number"
            )
              throw Error("Invalid retirement settings");
            await forge.setRetirement(input.enabled, input.limit);
            break;
          case "director-skip":
            forge.skipCountdown();
            break;
          case "director-winner":
            if (typeof input.choice !== "number") throw Error("Invalid card");
            forge.forceWinner(input.choice);
            break;
          case "director-replay":
            await forge.replayShowcase();
            break;
          default:
            json(res, 404, { error: "Not found" });
            return;
        }
        json(res, 200, forge.view());
      } else if (url.pathname === "/api/director/event") {
        const input = (await body(req)) as { event?: unknown };
        if (typeof input.event !== "string") throw Error("Invalid event");
        await audience.directorEvent(input.event);
        json(res, 200, { ok: true });
      } else if (url.pathname === "/api/config") {
        audience.configure(await body(req));
        json(res, 200, { ok: true });
      } else if (url.pathname === "/api/readiness/check-openai") {
        await checkOpenAI();
        json(res, 200, { openAIHealth });
      } else if (url.pathname === "/api/chat/test")
        json(res, 200, { queued: audience.testMessage() });
      else json(res, 404, { error: "Not found" });
      return;
    }
    if (
      req.method === "GET" &&
      (url.pathname === "/" ||
        url.pathname.startsWith("/dashboard/") ||
        url.pathname.startsWith("/overlay/"))
    ) {
      if (url.pathname === "/") {
        res.writeHead(302, { Location: "/dashboard/" });
        res.end();
        return;
      }
      const app = url.pathname.startsWith("/overlay/")
        ? "overlay"
        : "dashboard";
      const directory = resolve(root, `apps/${app}/dist`);
      const relative =
        decodeURIComponent(url.pathname.slice(app.length + 2)) || "index.html";
      const file = resolve(directory, relative);
      if (!file.startsWith(directory + sep)) throw new Error("Invalid path");
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
      };
      if (!mime[extname(file)]) throw new Error("Unsupported asset");
      const data = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)]!,
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws://localhost:* ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(data);
      return;
    }
  } catch {
    json(res, 400, {
      error: isCallback
        ? "Twitch login failed: invalid/expired state or authorization. Reconnect Twitch."
        : "Request failed; check configuration and connection",
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  const origin = req.headers.origin;
  const allowedOrigins = localOrigins(port);
  if (
    process.env.NODE_ENV !== "production" &&
    req.method === "OPTIONS" &&
    req.url?.startsWith("/dev/") &&
    origin &&
    allowedOrigins.has(origin)
  ) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
    });
    res.end();
    return;
  }
  if (
    process.env.NODE_ENV === "production" ||
    req.method !== "POST" ||
    !req.url?.startsWith("/dev/") ||
    !origin ||
    !allowedOrigins.has(origin) ||
    !req.headers["content-type"]?.startsWith("application/json")
  ) {
    json(res, 403, { error: "Forbidden" });
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", origin);
  try {
    const input = await body(req);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("Expected an object");
    const value = input as Record<string, unknown>;
    const route = req.url.slice(5);
    if (
      !["join", "event", "command", "load", "unload", "populate"].includes(
        route,
      )
    ) {
      json(res, 404, { error: "Not found" });
      return;
    }
    if (route === "load") {
      const id = String(value.modId ?? "");
      await sendCommand({ type: "load", modId: id, source: await readMod(id) });
    } else await sendCommand({ ...value, type: route });
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 400, {
      error: error instanceof Error ? error.message : "Bad request",
    });
  }
});
const sockets = new WebSocketServer({
  server,
  maxPayload: 1024,
  verifyClient: ({ req }: { req: IncomingMessage }) => localRequest(req, port),
});
sockets.on("connection", (socket, req) => {
  const isOverlay =
    new URL(req.url ?? "/", "http://localhost").searchParams.get("client") ===
    "overlay";
  if (isOverlay) {
    overlayClients++;
    socket.once("close", () => {
      overlayClients = Math.max(0, overlayClients - 1);
    });
  }
  if (lastSnapshot) socket.send(lastSnapshot);
  socket.send(JSON.stringify(forge.view()));
  socket.on("message", () => socket.close(1008, "Read-only overlay"));
});
worker.on(
  "message",
  (message: {
    type: string;
    id?: number;
    ok?: boolean;
    error?: string;
    result?: unknown;
    checkpoint?: HostCheckpoint;
    bins?: number[];
  }) => {
    if (
      message.type === "performance" &&
      message.bins?.length === tickBins.length
    ) {
      message.bins.forEach((count, index) => {
        tickBins[index]! += count;
      });
    } else if (message.type === "snapshot") {
      lastSnapshot = JSON.stringify(message);
      for (const client of sockets.clients)
        if (
          client.readyState === WebSocket.OPEN &&
          client.bufferedAmount < 1_000_000
        )
          client.send(lastSnapshot);
    } else if (message.type === "result" && message.id !== undefined) {
      const pending = requests.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      requests.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error ?? "Simulation failed"));
    } else if (
      (message.type === "checkpoint" || message.type === "rollback") &&
      message.checkpoint &&
      !stopping &&
      simulationReady
    )
      forge.acceptCheckpoint(message.checkpoint, message.type === "rollback");
  },
);
worker.on("error", (error) => {
  console.error("Simulation worker failed:", error);
  process.exitCode = 1;
  void shutdown();
});
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  feed.close();
  await forge.close();
  try {
    forge.store.checkpoint(await checkpoint());
  } catch {
    /* Worker may have failed. Keep the preceding durable checkpoint. */
  }
  audience.stop();
  for (const pending of requests.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Server stopping"));
  }
  requests.clear();
  server.close();
  for (const client of sockets.clients) client.close();
  sockets.close();
  await worker.terminate();
}
process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
server.listen(port, "127.0.0.1", () => {
  console.log(`ChatForge development server: http://127.0.0.1:${port}`);
  void (async () => {
    const emptyDemo = audience.inbox.setting("demo-empty-mods") === "true";
    const ids = new Set(
      emptyDemo ? [] : ["meteor-shower", "slime-king", "aurora-blessing"],
    );
    try {
      for (const file of emptyDemo ? [] : await readdir(runtimeDirectory))
        if (/^[a-z][a-z0-9_-]{0,39}\.js$/.test(file))
          ids.add(file.slice(0, -3));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        console.error("Could not list runtime mods:", error);
    }
    for (const id of ids) {
      try {
        await sendCommand({
          type: "load",
          modId: id,
          source: await readMod(id),
        });
      } catch (error) {
        console.error(`Could not load mod ${id}:`, error);
      }
    }
    const saved = forge.store.checkpoint();
    if (saved) await sendCommand({ type: "restore", checkpoint: saved });
    else {
      await sendCommand({ type: "baseline" });
      forge.store.checkpoint(await checkpoint());
    }
    simulationReady = true;
    if (!stopping) await audience.start();
  })();
});
