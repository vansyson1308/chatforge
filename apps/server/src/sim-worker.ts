import { parentPort } from "node:worker_threads";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
import type { RenderSnapshot } from "../../../packages/shared/src/protocol.js";

if (!parentPort) throw new Error("Simulation must run in a worker thread");
const port = parentPort;
const world = new World(2026);
const host = new ModHost(world);
let pending = Promise.resolve();
let busy = false;
const send = () => {
  const fx = world.drainFx();
  for (const diagnostic of host.drainDiagnostics())
    fx.push({
      type: "banner",
      text: `ROLLED BACK: ${diagnostic.modId}`,
      modId: diagnostic.modId,
    });
  const message: RenderSnapshot = {
    type: "snapshot",
    tick: world.state.tick,
    wave: world.state.wave,
    cycle: world.state.cycle,
    keepHp: world.state.keepHp,
    entities: world.state.entities.map((e) => [
      e.id,
      e.kind,
      e.team,
      e.x,
      e.y,
      e.hp,
      e.maxHp,
      e.viewer ?? "",
      e.level,
      e.lastActiveTick ?? 0,
    ]),
    fx: fx.slice(-2000),
    sprites: host.sprites(),
  };
  port.postMessage(message);
};
const timer = setInterval(() => {
  if (busy) return;
  host.tick();
}, 1000 / 30);
const broadcastTimer = setInterval(send, 1000 / 20);

port.on(
  "message",
  (message: { id?: number; type: string; [key: string]: unknown }) => {
    pending = pending.then(async () => {
      busy = true;
      try {
        switch (message.type) {
          case "populate": {
            const count = Number(message.count);
            if (!Number.isInteger(count) || count < 1 || count > 300)
              throw Error("Count must be 1..300");
            world.setRule("maxHeroes", 300);
            for (let i = 0; i < count; i++) {
              const hero = world.joinViewer(`Viewer${i + 1}`);
              if (hero) hero.hp = hero.maxHp = 100000;
            }
            break;
          }
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
            clearInterval(broadcastTimer);
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
