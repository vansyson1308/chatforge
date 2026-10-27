import { expect, it } from "vitest";
import { World } from "./world.js";

it("keeps 15 active viewers engaged over 15 waves, with damage and a rebuild", () => {
  const world = new World(2026);
  for (let i = 0; i < 15; i++) world.joinViewer(`Viewer${i}`, `sim:${i}`, true);
  const stationary = new Map<number, number>();
  let waves = 0,
    damaged = 0,
    falls = 0,
    hit = false,
    cycle = 1,
    movingWindows = 0,
    activeWindows = 0,
    moved = false,
    active = false,
    maxIdle = 0;
  for (let tick = 0; tick < 100000 && waves < 15; tick++) {
    // An active crowd chats periodically and rejoins after death.
    if (tick % 900 === 0)
      for (let i = 0; i < 15; i++)
        world.joinViewer(`Viewer${i}`, `sim:${i}`, true);
    const before = new Map(
      world.state.entities.map((e) => [e.id, { x: e.x, y: e.y }]),
    );
    world.tick();
    const events = world.drainEvents();
    world.drainFx();
    if (events.some((e) => e.type === "keep_damaged")) hit = true;
    if (world.state.cycle !== cycle) {
      falls++;
      cycle = world.state.cycle;
      waves++;
      if (hit) damaged++;
      hit = false;
    } else if (events.some((e) => e.type === "wave_end")) {
      waves++;
      if (hit) damaged++;
      hit = false;
    }
    const heroes = world.state.entities.filter((e) => e.team === "hero");
    if (world.state.entities.some((e) => e.team === "enemy")) active = true;
    if (
      heroes.some((e) => {
        const old = before.get(e.id);
        return old && Math.hypot(e.x - old.x, e.y - old.y) > 0.05;
      })
    )
      moved = true;
    for (const enemy of world.state.entities.filter(
      (e) => e.team === "enemy",
    )) {
      const old = before.get(enemy.id),
        engaged =
          enemy.cooldown > 0 ||
          heroes.some(
            (h) => Math.hypot(h.x - enemy.x, h.y - enemy.y) <= enemy.range + 2,
          );
      const idle =
        !engaged && old && Math.hypot(enemy.x - old.x, enemy.y - old.y) < 0.01
          ? (stationary.get(enemy.id) ?? 0) + 1
          : 0;
      stationary.set(enemy.id, idle);
      maxIdle = Math.max(maxIdle, idle);
    }
    if (tick % 150 === 149) {
      if (active) {
        activeWindows++;
        if (moved) movingWindows++;
      }
      active = false;
      moved = false;
    }
  }
  console.log(
    `PACING ${JSON.stringify({ waves, damaged, falls, maxIdle, activeWindows, movingWindows, ticks: world.state.tick })}`,
  );
  expect(waves).toBe(15);
  expect(damaged).toBeGreaterThanOrEqual(9);
  expect(falls).toBeGreaterThanOrEqual(1);
  expect(maxIdle).toBeLessThanOrEqual(150);
  expect(movingWindows).toBe(activeWindows);
}, 60000);
