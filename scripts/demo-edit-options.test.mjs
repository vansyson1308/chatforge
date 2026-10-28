import { expect, it } from "vitest";
import {
  parseEditArgs,
  titleBand,
  moderationScene,
  moderationChatFilter,
} from "./demo-edit-options.mjs";

it("supports any new take with an independently annotated moderation take", () => {
  expect(parseEditArgs(["runtime/recordings/take-3"])).toEqual({
    take: "runtime/recordings/take-3",
    moderationFrom: undefined,
  });
  expect(
    parseEditArgs([
      "--",
      "runtime/recordings/take-3",
      "--moderation-from",
      "runtime/recordings/take-1",
    ]),
  ).toEqual({
    take: "runtime/recordings/take-3",
    moderationFrom: "runtime/recordings/take-1",
  });
  const scene = moderationScene({ moderationAtSeconds: 300 }, 720, "take-1");
  expect(scene.sourceTake).toBe("take-1");
  expect(scene.start).toBe(300);
  expect(scene.sourceDuration).toBe(720);
  expect(scene.kind).toBe("chat");
  expect(
    moderationScene({ moderationAtSeconds: 715 }, 720, "take-1").start,
  ).toBe(711);
});
it.each([
  [],
  ["take", "--moderation-from"],
  ["take", "--unknown"],
  ["--moderation-from", "take"],
])("rejects malformed edit arguments: %j", (...args) => {
  expect(() => parseEditArgs(args)).toThrow();
});
it("rejects missing or out-of-range moderation timestamps instead of using the wrong clip", () => {
  for (const at of [undefined, NaN, -1, 721])
    expect(() =>
      moderationScene({ moderationAtSeconds: at }, 720, "take-1"),
    ).toThrow();
});
it("places titles below the HUD and above the caption bar with a dedicated backdrop", () => {
  const filter = titleBand("font", "title");
  expect(filter).toContain("drawbox=x=0:y=785:w=1920:h=90");
  expect(filter).toContain("y=810");
  expect(filter).not.toContain("y=35");
});
it("uses the source take's annotated chat rows and bounds malformed metadata", () => {
  expect(
    moderationChatFilter({
      chatCropWidth: 1200,
      chatCropHeight: 650,
      maliciousRowY: 295,
      refusalRowY: 475,
    }),
  ).toContain("y=374");
  expect(
    moderationChatFilter({
      maliciousRowY: "drawtext=untrusted",
      chatCropWidth: -10,
    }),
  ).not.toContain("untrusted");
});
