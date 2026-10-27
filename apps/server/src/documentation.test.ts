import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { World } from "../../../packages/engine/src/index.js";
import { ModHost } from "./mod-host.js";
it("all documented standalone examples compile and execute against the real contract", async () => {
  const doc = await readFile(
    new URL("../../../docs/MOD_API.md", import.meta.url),
    "utf8",
  );
  const sources = [...doc.matchAll(/```js\r?\n([\s\S]*?)```/g)].map(
    (match) => match[1]!,
  );
  expect(sources.length).toBeGreaterThanOrEqual(6);
  for (const source of sources) {
    const host = new ModHost(new World(9));
    try {
      await host.load("documented", source);
      host.world.joinViewer("Ada");
      host.dispatch({ type: "twitch:sub", viewer: "Ada" });
      host.dispatch({ type: "twitch:raid", viewer: "Ada" });
      host.dispatch({ type: "twitch:follow", viewer: "Ada" });
      host.command("!spark", "Ada", "");
      for (let i = 0; i < 100; i++) host.tick();
      expect(host.diagnostics).toEqual([]);
    } finally {
      host.dispose();
    }
  }
});
