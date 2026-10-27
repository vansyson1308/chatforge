import { Codex } from "@openai/codex-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspace = await mkdtemp(join(tmpdir(), "chatforge-codex-smoke-"));
let thread;
try {
  const codex = new Codex();
  thread = codex.startThread({
    workingDirectory: workspace,
    skipGitRepoCheck: true,
    sandboxMode: "read-only",
    approvalPolicy: "never",
  });
  const result = await thread.run(
    "Reply with exactly FORGE_OK and nothing else.",
    {
      signal: AbortSignal.timeout(120_000),
    },
  );
  console.log(`Thread ID: ${thread.id}`);
  console.log(`Output: ${result.finalResponse}`);
  if (result.finalResponse.trim() !== "FORGE_OK") {
    throw new Error("Codex response did not match FORGE_OK.");
  }
} catch (error) {
  console.error(`Thread ID: ${thread?.id ?? "not available"}`);
  console.error("Codex smoke failed:", error);
  process.exitCode = 1;
} finally {
  await rm(workspace, { recursive: true, force: true });
}
