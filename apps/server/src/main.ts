import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Worker } from "node:worker_threads";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
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
      if (content.length > 110000) req.destroy();
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
const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    json(res, 200, { ok: true });
    return;
  }
  const origin = req.headers.origin;
  const allowedOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
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
    if (!["join", "event", "command", "load", "unload"].includes(route)) {
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
const sockets = new WebSocketServer({ server });
sockets.on("connection", (socket) => {
  if (lastSnapshot) socket.send(lastSnapshot);
});
worker.on(
  "message",
  (message: { type: string; id?: number; ok?: boolean; error?: string }) => {
    if (message.type === "snapshot") {
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
      if (message.ok) pending.resolve(message);
      else pending.reject(new Error(message.error ?? "Simulation failed"));
    }
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
    const ids = new Set(["meteor-shower", "slime-king", "aurora-blessing"]);
    try {
      for (const file of await readdir(runtimeDirectory))
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
  })();
});
