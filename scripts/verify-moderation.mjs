import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import OpenAI from "../apps/server/node_modules/openai/index.mjs";
import { moderateIdeas } from "../apps/server/dist/apps/server/src/moderation-policy.js";
import { moderationCorpus } from "../apps/server/dist/apps/server/src/moderation-corpus.js";
import { allowedIdea } from "../apps/server/dist/apps/server/src/producer.js";
const env = parseEnv(await readFile(".env", "utf8"));
if (!env.OPENAI_API_KEY) throw Error("OPENAI_API_KEY is required in .env");
const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  timeout: 20000,
  maxRetries: 0,
});
const flags = await moderateIdeas(
  client,
  moderationCorpus.map((entry) => entry.text),
  AbortSignal.timeout(30000),
);
const cases = moderationCorpus.map((entry, index) => ({
  id: entry.id,
  text: entry.text,
  expected: entry.block ? "BLOCK" : "PASS",
  actual: !allowedIdea(entry.text) || flags[index] ? "BLOCK" : "PASS",
  ruleBlocked: !allowedIdea(entry.text),
  categoryPolicyBlocked: flags[index],
}));
for (const entry of cases)
  console.log(`${entry.id}\t${entry.expected}\t${entry.actual}`);
await writeFile(
  "docs/media/moderation-live-report.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      model: "omni-moderation-latest",
      live: true,
      cases,
    },
    null,
    2,
  ) + "\n",
);
if (cases.some((entry) => entry.expected !== entry.actual))
  process.exitCode = 1;
