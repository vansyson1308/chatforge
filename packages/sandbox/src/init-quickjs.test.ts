import { expect, it } from "vitest";
import { ModIsolate, initQuickJS } from "./isolate.js";

it("initQuickJS makes synchronous isolate creation safe (season resume path)", async () => {
  await initQuickJS();
  const isolate = ModIsolate.createSync("resume-check");
  expect(isolate.id).toBe("resume-check");
  isolate.dispose();
});
