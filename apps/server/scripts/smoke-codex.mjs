import { Codex } from "@openai/codex-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const model = process.env.CODEX_MODEL || "gpt-6.1-sol";
const auth = process.env.CODEX_SMOKE_AUTH || "chatgpt";

const workspace = await mkdtemp(join(tmpdir(), "chatforge-codex-smoke-"));
let thread;
try {
  if (auth !== "chatgpt" && auth !== "api-key")
    throw new Error("CODEX_SMOKE_AUTH must be chatgpt or api-key");
  if (auth === "api-key" && !process.env.OPENAI_API_KEY)
    throw new Error("OPENAI_API_KEY is required for api-key auth");
  const codex = new Codex(
    auth === "api-key" ? { apiKey: process.env.OPENAI_API_KEY } : {},
  );
  thread = codex.startThread({
    model,
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
  console.log(`Auth: ${auth}; model: ${model}`);
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
