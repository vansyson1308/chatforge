import { lstat, rm } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
export async function cleanRuntime(root) {
  root = resolve(root);
  if ((await lstat(root)).isSymbolicLink()) throw Error("Refusing linked root");
  // Deliberate allowlist. Never traverse login, sessions, SQLite, or the forge workspace.
  for (const name of [
    "runtime/secrets/forge-codex/.sandbox-bin",
    "runtime/secrets/forge-codex/plugins/cache",
  ]) {
    const target = resolve(root, name),
      rel = relative(root, target);
    if (rel.startsWith("..") || !rel.startsWith("runtime" + sep))
      throw Error("Cleanup escaped runtime");
    let current = root,
      exists = true;
    for (const part of rel.split(sep)) {
      current = resolve(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw Error(`Refusing linked cache path: ${name}`);
      } catch (error) {
        if (error.code === "ENOENT") {
          exists = false;
          break;
        }
        throw error;
      }
    }
    if (exists) {
      await rm(target, { recursive: true, force: true });
      console.log(`Removed regenerable cache: ${name}`);
    } else console.log(`Already clean: ${name}`);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await cleanRuntime(fileURLToPath(new URL("../", import.meta.url)));
