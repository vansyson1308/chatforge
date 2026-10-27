import { expect, it } from "vitest";
import { appearance, placeLabels } from "./presentation.js";
it("uses stable viewer appearance with visual variety", () => {
  expect(appearance("Ada")).toEqual(appearance("Ada"));
  expect(
    new Set(
      Array.from({ length: 30 }, (_, i) => appearance(`Viewer${i}`).variant),
    ).size,
  ).toBeGreaterThan(20);
});
it("prioritizes readable labels and reserves damage-number rectangles", () => {
  const base = { x: 100, y: 100, width: 60, height: 18 };
  expect(
    placeLabels(
      [
        { ...base, text: "Old", priority: 1 },
        { ...base, text: "New", priority: 100 },
      ],
      [],
    ).map((x) => x.text),
  ).toEqual(["New"]);
  expect(
    placeLabels([{ ...base, text: "Hidden", priority: 999 }], [base]),
  ).toEqual([]);
});
