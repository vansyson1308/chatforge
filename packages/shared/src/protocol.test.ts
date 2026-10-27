import { expect, it } from "vitest";
import { renderSnapshotSchema } from "./protocol.js";
it("validates compact render fields and rejects malformed/unbounded input", () => {
  const good = {
    type: "snapshot",
    tick: 1,
    wave: 1,
    cycle: 1,
    keepHp: 100,
    entities: [
      [1, "hero", "hero", 10, 20, 100, 100, "<script>alert(1)</script>", 1, 0],
    ],
    fx: [],
    sprites: {},
  };
  expect(renderSnapshotSchema.safeParse(good).success).toBe(true);
  expect(
    renderSnapshotSchema.safeParse({
      ...good,
      entities: [[1, "bad", "node", NaN]],
    }).success,
  ).toBe(false);
  expect(
    renderSnapshotSchema.safeParse({
      ...good,
      entities: Array(1201).fill(good.entities[0]),
    }).success,
  ).toBe(false);
});
