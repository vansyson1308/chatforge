import { parentPort } from "node:worker_threads";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";

if (!parentPort) throw new Error("Simulation must run in a worker thread");
const port = parentPort;
const world = new World(2026);
const host = new ModHost(world);
let pending = Promise.resolve();
let busy = false;
const send = () =>
  port.postMessage({
    type: "snapshot",
    world: world.snapshot(),
    fx: world.drainFx(),
    sprites: host.sprites(),
  });
const timer = setInterval(() => {
  if (busy) return;
  host.tick();
  send();
}, 1000 / 30);

port.on(
  "message",
  (message: { id?: number; type: string; [key: string]: unknown }) => {
    pending = pending.then(async () => {
      busy = true;
      try {
        switch (message.type) {
          case "join":
            world.joinViewer(String(message.viewer ?? ""));
            break;
          case "event":
            host.dispatch({
              type: String(message.event ?? ""),
              viewer: String(message.viewer ?? "").slice(0, 40),
            });
            break;
          case "command":
            host.command(
              String(message.command ?? ""),
              String(message.viewer ?? ""),
              String(message.args ?? ""),
            );
            break;
          case "load":
            await host.load(
              String(message.modId ?? ""),
              String(message.source ?? ""),
            );
            break;
          case "unload":
            host.unload(String(message.modId ?? ""));
            break;
          case "stop":
            clearInterval(timer);
            host.dispose();
            port.close();
            break;
          default:
            throw new Error("Unknown simulation command");
        }
        if (message.type !== "stop") send();
        port.postMessage({ type: "result", id: message.id, ok: true });
      } catch (error) {
        port.postMessage({
          type: "result",
          id: message.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        busy = false;
      }
    });
  },
);
