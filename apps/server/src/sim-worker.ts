import { parentPort } from "node:worker_threads";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost, type HostCheckpoint } from "./mod-host.js";
import {
  healWorld,
  invariantFailure,
} from "../../../packages/engine/src/invariants.js";
import type { RenderSnapshot } from "../../../packages/shared/src/protocol.js";

if (!parentPort) throw new Error("Simulation must run in a worker thread");
const port = parentPort;
const world = new World(2026);
const host = new ModHost(world);
let pending = Promise.resolve();
let busy = false;
const performanceBins = new Uint32Array(1001);
const send = () => {
  const fx = world.drainFx();
  for (const diagnostic of host.drainDiagnostics()) {
    port.postMessage({
      type: "rollback",
      modId: diagnostic.modId,
      checkpoint: host.exportCheckpoint(),
    });
    fx.push({
      type: "banner",
      text: `ROLLED BACK: ${diagnostic.modId}`,
      modId: diagnostic.modId,
    });
  }
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
      e.simulated ?? false,
      e.scale ?? 1,
      e.hat ?? "",
    ]),
    fx: fx.slice(-2000),
    sprites: host.sprites(),
  };
  port.postMessage(message);
};
const timer = setInterval(() => {
  if (busy) return;
  const started = performance.now();
  host.tick();
  if (process.env.CHATFORGE_METRICS === "1") {
    performanceBins[
      Math.min(1000, Math.floor((performance.now() - started) * 10))
    ]!++;
    if (world.state.tick % 300 === 0) {
      port.postMessage({
        type: "performance",
        bins: Array.from(performanceBins),
      });
      performanceBins.fill(0);
    }
  }
  if (world.state.tick % 300 === 0)
    port.postMessage({
      type: "checkpoint",
      checkpoint: host.exportCheckpoint(),
    });
}, 1000 / 30);
const broadcastTimer = setInterval(send, 1000 / 20);

port.on(
  "message",
  (message: { id?: number; type: string; [key: string]: unknown }) => {
    pending = pending.then(async () => {
      busy = true;
      try {
        let result: unknown;
        switch (message.type) {
          case "checkpoint":
            {
              const failure = invariantFailure(world.state);
              if (failure) {
                const repairs = healWorld(world.state);
                world.reindex();
                console.error(
                  "HOST WORLD REPAIRED:",
                  failure,
                  repairs.join("; "),
                );
              }
            }
            result = host.exportCheckpoint();
            break;
          case "restore":
            host.importCheckpoint(message.checkpoint as HostCheckpoint);
            {
              const repairs = healWorld(world.state);
              world.reindex();
              if (repairs.length)
                console.error("LEGACY WORLD REPAIRED:", repairs.join("; "));
            }
            break;
          case "baseline":
            host.markBaseline();
            break;
          case "rollback":
            host.rollback(
              typeof message.modId === "string" ? message.modId : undefined,
            );
            result = host.exportCheckpoint();
            break;
          case "retire":
            host.retire(String(message.modId));
            result = host.exportCheckpoint();
            break;
          case "safe-mode":
            host.safeMode();
            result = host.exportCheckpoint();
            break;
          case "celebrate":
            world.state.fx.push(
              { type: "banner", text: String(message.text).slice(0, 120) },
              {
                type: "particles",
                x: 600,
                y: 160,
                color: "#ffd66b",
                count: 80,
              },
            );
            break;
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
            world.joinViewer(
              String(message.viewer ?? ""),
              typeof message.userId === "string"
                ? `${String(message.source)}:${message.userId}`
                : undefined,
              message.source === "simulator",
            );
            break;
          case "event":
            host.dispatch({
              type: String(message.event ?? ""),
              viewer: String(message.viewer ?? "").slice(0, 40),
              userId: String(message.userId ?? ""),
              source: String(message.source ?? "development"),
              count: Number(message.count ?? 1),
              detail: String(message.detail ?? ""),
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
        port.postMessage({ type: "result", id: message.id, ok: true, result });
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
