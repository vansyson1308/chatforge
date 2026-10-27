import { expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { cleanRuntime } from "./clean-runtime.mjs";

it("removes only regenerable caches and preserves login, sessions and databases", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatforge-clean-test-")),
    home = join(root, "runtime/secrets/forge-codex");
  try {
    for (const directory of [".sandbox-bin", "plugins/cache", "sessions"])
      await mkdir(join(home, directory), { recursive: true });
    for (const file of [
      "auth.json",
      "sessions/keep.jsonl",
      "state.sqlite",
      ".sandbox-bin/cache",
      "plugins/cache/cache",
    ])
      await writeFile(join(home, file), "preserve");
    await cleanRuntime(root);
    for (const file of ["auth.json", "sessions/keep.jsonl", "state.sqlite"])
      expect(await readFile(join(home, file), "utf8")).toBe("preserve");
    await expect(readFile(join(home, ".sandbox-bin/cache"))).rejects.toThrow();
    await expect(readFile(join(home, "plugins/cache/cache"))).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("refuses a junction that points outside the allowlisted runtime tree", async () => {
  const root = await mkdtemp(join(tmpdir(), "chatforge-clean-link-")),
    outside = await mkdtemp(join(tmpdir(), "chatforge-clean-outside-"));
  try {
    await mkdir(join(root, "runtime/secrets/forge-codex"), { recursive: true });
    await writeFile(join(outside, "keep"), "safe");
    await symlink(
      outside,
      join(root, "runtime/secrets/forge-codex/.sandbox-bin"),
      "junction",
    );
    await expect(cleanRuntime(root)).rejects.toThrow("linked cache path");
    expect(await readFile(join(outside, "keep"), "utf8")).toBe("safe");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
