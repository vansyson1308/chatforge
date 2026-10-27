import { describe, expect, it } from "vitest";
import { World } from "./world.js";

describe("deterministic simulation", () => {
  it("replays the same seed and inputs with identical snapshots and hash", () => {
    const a = new World(123);
    const b = new World(123);
    for (let tick = 0; tick < 900; tick++) {
      if (tick === 0) {
        a.joinViewer("Ada");
        b.joinViewer("Ada");
      }
      if (tick === 100) {
        a.joinViewer("Lin");
        b.joinViewer("Lin");
      }
      a.tick();
      b.tick();
    }
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.hash()).toBe(b.hash());
    expect(a.state.tick).toBe(900);
  });
  it("restores a JSON round-trip and continues identically", () => {
    const a = new World(99);
    a.joinViewer("viewer");
    for (let tick = 0; tick < 100; tick++) a.tick();
    const b = new World(1, JSON.parse(JSON.stringify(a.snapshot())));
    for (let tick = 0; tick < 150; tick++) {
      a.tick();
      b.tick();
    }
    expect(a.hash()).toBe(b.hash());
    const saved = a.snapshot();
    a.tick();
    a.restore(saved);
    expect(a.snapshot()).toEqual(b.snapshot());
  });
  it("clamps rules and queues viewers until a slot is available", () => {
    const world = new World();
    expect(world.setRule("maxHeroes", -2)).toBe(1);
    world.setRule("heroIdleTicks", 30);
    world.joinViewer("first");
    expect(world.joinViewer("second")).toBeNull();
    expect(world.state.queue).toEqual(["second"]);
    for (let i = 0; i < 30; i++) world.tick();
    expect(
      world.state.entities.some((entity) => entity.viewer === "second"),
    ).toBe(true);
  });
});
