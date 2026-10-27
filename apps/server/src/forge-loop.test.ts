import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { World } from "../../../packages/engine/src/index.js";
import type { ForgeView } from "../../../packages/shared/src/forge.js";
import { ForgeLoop } from "./forge-loop.js";
import { IdeaInbox, ChatRouter } from "./chat-router.js";
import { ModHost } from "./mod-host.js";
import { CrowdSim } from "./crowd-sim.js";
import { gatekeeper } from "./gatekeeper.js";
import type { Builder } from "./builder.js";
import { testCards } from "./forge-fixtures.js";
import { goodMod } from "./forge-fixtures.js";

afterEach(() => vi.useRealTimers());
it("never invokes or retries Codex for a host baseline fault", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const build = vi.fn(async () => ({ source: goodMod, tokens: 0 })),
    f = await fixture({ build });
  try {
    await voting(f.loop);
    f.host.world.state.entities[0]!.x = 1500;
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    expect(build).not.toHaveBeenCalled();
    expect(f.loop.build?.attempts).toBe(0);
    expect(f.loop.build?.report?.hostFailure).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it("preserves CLI/host snapshot parity even while the live world advances during a build", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  let input: Parameters<Builder["build"]>[0] | undefined;
  const f = await fixture({
    build: async (request) => {
      input = structuredClone({
        ...request,
        signal: undefined,
        activity: undefined,
      }) as unknown as typeof request;
      for (let n = 0; n < 120; n++) f.host.tick();
      return { source: goodMod, tokens: 0 };
    },
  });
  try {
    await voting(f.loop);
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    const local = await gatekeeper({
      modId: input!.modId,
      source: goodMod,
      checkpoint: input!.checkpoint,
      commands: input!.card.commands,
      spectacle: true,
    });
    expect(f.loop.build?.report?.hashes).toEqual(local.hashes);
    expect(f.host.world.state.tick).toBeGreaterThan(input!.checkpoint.tick);
  } finally {
    await f.cleanup();
  }
});
it("reopens durable season/checkpoint/thread and stops interrupted builds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "chatforge-restart-")),
    file = join(directory, "state.sqlite");
  const first = await fixture(undefined, file);
  let hash = "";
  try {
    await first.host.load("generated", goodMod);
    first.host.command("!spark", "Viewer", "");
    hash = first.host.world.hash();
    first.loop.store.checkpoint(first.host.exportCheckpoint());
    first.loop.store.threadId = "durable-thread";
    const round = first.loop.store.createRound(Date.now());
    round.stage = "BUILDING";
    first.loop.store.save(round, Date.now());
    first.loop.store.beginBuild(round.id, Date.now());
    // Later vetoed rounds must not hide an older in-flight build on restart.
    for (let i = 0; i < 3; i++) {
      const newer = first.loop.store.createRound(Date.now());
      newer.stage = "FAILED";
      first.loop.store.save(newer, Date.now());
    }
  } finally {
    await first.cleanup();
  }
  const second = await fixture(undefined, file);
  try {
    second.host.importCheckpoint(second.loop.store.checkpoint()!);
    expect(second.host.world.hash()).toBe(hash);
    expect(second.loop.store.threadId).toBe("durable-thread");
    expect(second.loop.build?.stage).toBe("FAILED");
    expect(
      second.inbox.db.prepare("SELECT status FROM builds").get()?.status,
    ).toBe("FAILED");
    second.host.rollback("generated");
    expect(Object.keys(second.host.world.state.mods)).toEqual(["seed"]);
  } finally {
    await second.cleanup();
    await rm(directory, { recursive: true, force: true });
  }
});
it("enforces the hourly build cap without invoking the Builder", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const build = vi.fn(async () => ({ source: goodMod, tokens: 0 }));
  const f = await fixture({ build });
  try {
    await voting(f.loop);
    for (let i = 0; i < 12; i++)
      f.loop.store.beginBuild(f.loop.round!.id, Date.now());
    await vi.advanceTimersByTimeAsync(40000);
    expect(build).not.toHaveBeenCalled();
    expect(f.loop.notice).toContain("cap reached");
    expect(f.loop.round?.stage).toBe("STREAMER_APPROVAL");
  } finally {
    await f.cleanup();
  }
});
it("normal preset waits for manual approval and veto never builds", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const build = vi.fn(async () => ({ source: goodMod, tokens: 0 }));
  const f = await fixture({ build });
  try {
    f.loop.start("normal");
    await vi.advanceTimersByTimeAsync(90000);
    await f.loop.settled();
    expect(f.loop.round?.stage).toBe("VOTING");
    await vi.advanceTimersByTimeAsync(45000);
    expect(f.loop.round?.stage).toBe("STREAMER_APPROVAL");
    expect(f.loop.round?.deadline).toBeNull();
    await vi.advanceTimersByTimeAsync(15000);
    expect(build).not.toHaveBeenCalled();
    f.loop.veto();
    expect(f.loop.round?.stage).toBe("COLLECTING");
  } finally {
    await f.cleanup();
  }
});
it("a later live failure rolls back the generated set and broadcasts ROLLED_BACK", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const source = goodMod.replace(
    "export function register(api) {",
    "export function register(api) { api.every(901,()=>{throw Error('late failure')});",
  );
  const f = await fixture({ build: async () => ({ source, tokens: 0 }) });
  try {
    const before = f.host.world.hash();
    await voting(f.loop);
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    expect(f.loop.build?.stage).toBe("LIVE");
    for (let i = 0; i < 901; i++) f.host.tick();
    expect(f.host.diagnostics).toHaveLength(1);
    expect(f.host.world.hash()).toBe(before);
    f.loop.acceptCheckpoint(f.host.exportCheckpoint(), true);
    expect(f.loop.store.mods()).toHaveLength(0);
    expect(f.frames.at(-1)?.build?.stage).toBe("ROLLED_BACK");
  } finally {
    await f.cleanup();
  }
});
async function fixture(
  builder: Builder = { build: async () => ({ source: goodMod, tokens: 0 }) },
  file = ":memory:",
  onCelebrate: () => Promise<void> = async () => {},
) {
  const inbox = new IdeaInbox(file),
    host = new ModHost(new World(2026));
  await host.load(
    "seed",
    "export function register(api) { api.on('wave_start',()=>api.fx.banner('seed')); }",
  );
  host.markBaseline();
  const frames: ForgeView[] = [],
    announcements: string[] = [];
  const router = new ChatRouter(inbox, {
    join: (chat) => {
      host.world.joinViewer(chat.displayName, `simulator:${chat.userId}`, true);
    },
    reply: () => {},
    command: () => {},
  });
  const loop = new ForgeLoop(inbox, {
    producer: {
      curate: async () => ({
        cards: structuredClone(testCards),
        rejected: [],
        tokens: 100,
      }),
    },
    builder,
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
      celebrate: async (text) => {
        announcements.push(text);
        await onCelebrate();
      },
    },
    gate: (input, _signal, onCheck) => gatekeeper(input, onCheck),
    broadcast: (view) => frames.push(structuredClone(view)),
    announce: (text) => announcements.push(text),
    resetRound: () => router.resetRound(),
  });
  router.onVote = (chat, choice) => loop.vote(chat, choice);
  const sim = new CrowdSim(2026, (event) => {
    if (event.type === "chat") router.route(event);
  });
  for (let i = 0; i < 100; i++) {
    const event = sim.next();
    if (event.type === "chat") router.route(event);
  }
  return {
    loop,
    inbox,
    host,
    frames,
    announcements,
    cleanup: async () => {
      await loop.close();
      host.dispose();
      inbox.close();
    },
  };
}
async function voting(loop: ForgeLoop) {
  loop.start("demo");
  await vi.advanceTimersByTimeAsync(45000);
  await loop.settled();
  expect(loop.round?.stage).toBe("VOTING");
}
it("Crowd Sim full round reaches LIVE, persists transitions and last-vote-wins", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const f = await fixture();
  try {
    expect(f.inbox.ideas.length).toBeGreaterThan(0);
    await voting(f.loop);
    f.loop.vote({ source: "twitch", userId: "1" }, 1);
    f.loop.vote({ source: "twitch", userId: "1" }, 2);
    f.loop.vote({ source: "simulator", userId: "1" }, 1);
    expect(f.loop.round?.tallies).toEqual([1, 1, 0]);
    await vi.advanceTimersByTimeAsync(30000);
    expect(f.loop.round?.winner).toBe(0);
    await vi.advanceTimersByTimeAsync(10000);
    await f.loop.settled();
    expect(f.loop.build?.stage).toBe("LIVE");
    expect(f.loop.round?.stage).toBe("COLLECTING");
    expect(f.loop.store.mods()).toHaveLength(1);
    expect(f.loop.store.patchNotes()).toContain("Spark 1");
    const stages = f.inbox.db
      .prepare("SELECT stage FROM transitions WHERE roundId=1 ORDER BY id")
      .all()
      .map((r) => r.stage);
    expect(stages).toEqual([
      "IDLE",
      "COLLECTING",
      "CURATING",
      "VOTING",
      "STREAMER_APPROVAL",
      "BUILDING",
      "TESTING",
      "DEPLOYING",
      "LIVE",
    ]);
    expect(
      f.frames.some(
        (v) =>
          v.build?.stage === "TESTING" &&
          v.build.report?.checks.some((c) => c.name === "simulation 1" && c.ok),
      ),
    ).toBe(true);
    await f.loop.safeMode();
    expect(Object.keys(f.host.world.state.mods)).toEqual(["seed"]);
    expect(f.loop.store.mods()).toHaveLength(0);
    expect(f.loop.view().patches).toHaveLength(1);
  } finally {
    await f.cleanup();
  }
});
it("retries gate failures twice, emits FAILED and preserves last good game", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const build = vi.fn(async () => ({
    source:
      "export function register(api){} export const forgeTest={expect:{minEffects:1}};",
    tokens: 0,
  }));
  const f = await fixture({ build });
  const before = f.host.world.hash();
  try {
    await voting(f.loop);
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    expect(build).toHaveBeenCalledTimes(3);
    expect(f.loop.build?.stage).toBe("FAILED");
    expect(f.host.world.hash()).toBe(before);
    expect(f.frames.some((v) => v.build?.stage === "FAILED")).toBe(true);
  } finally {
    await f.cleanup();
  }
});
it("only one build runs while another round collects; cancel aborts the adapter", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  const build = vi.fn(
    ({ signal }: Parameters<Builder["build"]>[0]) =>
      new Promise<{ source: string; tokens: number }>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(Error("cancelled")), {
          once: true,
        }),
      ),
  );
  const f = await fixture({ build });
  try {
    await voting(f.loop);
    await vi.advanceTimersByTimeAsync(40000);
    expect(f.loop.build?.stage).toBe("BUILDING");
    await vi.advanceTimersByTimeAsync(85000);
    expect(f.loop.round?.stage).toBe("COLLECTING");
    expect(build).toHaveBeenCalledOnce();
    expect(() => f.loop.approve()).toThrow();
    f.loop.cancel();
    await f.loop.settled();
    expect(f.loop.build?.stage).toBe("FAILED");
  } finally {
    await f.cleanup();
  }
});
it("restores a persisted checkpoint, mod state and rollback history", async () => {
  const f = await fixture();
  const restored = new ModHost(new World());
  try {
    await f.host.load("generated", goodMod);
    f.host.command("!spark", "Viewer", "");
    f.loop.store.checkpoint(f.host.exportCheckpoint());
    await restored.load("init", "export function register(api){}");
    restored.importCheckpoint(f.loop.store.checkpoint()!);
    expect(restored.world.hash()).toBe(f.host.world.hash());
    restored.rollback("generated");
    expect(Object.keys(restored.world.state.mods)).toEqual(["seed"]);
    f.loop.store.threadId = "persisted-thread";
    const store = new (await import("./forge-store.js")).ForgeStore(f.inbox.db);
    expect(store.threadId).toBe("persisted-thread");
  } finally {
    restored.dispose();
    await f.cleanup();
  }
});

it("keeps each consecutive ship moment LIVE while celebration awaits worker acknowledgement", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  let count = 0;
  const f = await fixture(
    {
      build: async () => ({
        source: goodMod.replaceAll(
          "armageddon-duck",
          `armageddon-duck-${++count}`,
        ),
        tokens: 0,
      }),
    },
    ":memory:",
    async () => {
      await vi.advanceTimersByTimeAsync(250);
    },
  );
  try {
    await voting(f.loop);
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    expect(f.loop.build?.stage).toBe("LIVE");
    await vi.advanceTimersByTimeAsync(45000);
    await f.loop.settled();
    expect(f.loop.round?.stage).toBe("VOTING");
    await vi.advanceTimersByTimeAsync(40000);
    await f.loop.settled();
    expect(count).toBe(2);
    expect(f.loop.build?.stage).toBe("LIVE");
    await vi.advanceTimersByTimeAsync(4000);
    expect(f.loop.build?.stage).toBe("LIVE");
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.loop.build?.stage).toBe("IDLE");
  } finally {
    await f.cleanup();
  }
});
