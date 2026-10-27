import { config } from "dotenv";
import { fileURLToPath } from "node:url";

const loaded = config({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true,
});
const key = loaded.parsed?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
if (!key) {
  console.log("OPENAI_API_KEY is not set; model availability was not checked.");
} else {
  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(
        `Model list request failed: HTTP ${response.status} ${response.statusText}`,
      );
    const body = await response.json();
    const ids = body.data.map((model) => model.id).sort();
    console.log("Available model IDs:");
    for (const id of ids) console.log(`  ${id}`);
    // These are candidates, not defaults; check them again against each account's list.
    for (const [variable, fallback] of [
      ["PRODUCER_MODEL", "gpt-6.1-terra"],
      ["BUILDER_MODEL", "gpt-6.1-sol"],
      ["CODEX_MODEL", "gpt-6.1-sol"],
      ["MODERATION_MODEL", "omni-moderation-latest"],
      ["ALTERNATE_MODEL", "gpt-6-astra"],
      ["ALTERNATE_MODEL", "gpt-6-sol"],
      ["ALTERNATE_MODEL", "gpt-6-luna"],
      ["IMAGE_MODEL", "gpt-image-2"],
    ]) {
      const candidate = process.env[variable] || fallback;
      console.log(
        `${variable} candidate ${candidate}: ${ids.includes(candidate) ? "found" : "not found"}`,
      );
    }
  } catch (error) {
    console.error("OpenAI smoke failed:", error);
    process.exitCode = 1;
  }
}
