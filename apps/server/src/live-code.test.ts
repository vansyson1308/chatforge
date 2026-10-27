import { expect, it } from "vitest";
import { previewSource, readCandidatePreview } from "./live-code.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
it("redacts arbitrary code strings and identifiers while exposing bounded sprite pixels", () => {
  const preview = previewSource(
    "const mySecret = 'sk-abcdefghijklmnopqrstuvwxyz123456';\nconst sprite={grid:['.aa.','a..a'],palette:{a:'#ff0000'}};",
  );
  expect(JSON.stringify(preview)).not.toContain("sk-");
  expect(JSON.stringify(preview)).not.toContain("mySecret");
  expect(preview.lines).toHaveLength(2);
  expect(preview.sprite?.rows).toEqual([
    [0, 1, 1, 0],
    [1, 0, 0, 1],
  ]);
});
it("refuses traversal and arbitrary workspace paths", async () => {
  expect(await readCandidatePreview(process.cwd(), "../.env")).toBeUndefined();
});
it("reads only the changing candidate and bounds the live tail", async () => {
  const root = resolve("runtime/tmp");
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(join(root, "preview-"));
  try {
    await mkdir(join(dir, "mods"));
    await writeFile(
      join(dir, "mods", "forge-1.js"),
      Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`).join("\n"),
    );
    const preview = await readCandidatePreview(dir, "forge-1");
    expect(preview?.lines).toHaveLength(14);
    expect(preview?.lines.at(-1)).toContain("19");
    await writeFile(
      join(dir, "mods", "forge-1.js"),
      "const sprite={grid:['.aa.','a..a'],palette:{a:'#ff0000'}};",
    );
    expect(
      (await readCandidatePreview(dir, "forge-1"))?.sprite?.rows,
    ).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
