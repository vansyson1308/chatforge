import OpenAI from "openai";
import type { Moderation } from "openai/resources/moderations";

// A narrow exception: only non-graphic violence clearly targeting game actors.
// Model flags for every other category remain authoritative.
const fantasy =
  /\b(?:game|keep|enemy|enemies|monster|monsters|slime|slimes|goblin|goblins|boss|bosses|skeleton|skeletons|dragon|dragons|orc|orcs|zombie|zombies|creature|creatures)\b/iu;
const realPerson =
  /\b(?:people|person|persons|human|humans|children|child|kid|kids|minor|minors|school|teacher|classmate|neighbor|neighbour|streamer|viewer|viewers|police|civilian|civilians|family|mother|father|woman|women|man|men|real[ -]world|in real life|irl|myself|yourself|someone|anyone|everyone)\b/iu;
const directThreat =
  /\b(?:kill|murder|shoot|stab|attack|hurt|burn|bomb|assault|poison|torture)\s+(?:the\s+|a\s+|my\s+|your\s+|our\s+|all\s+|every\s+)*(?:people|person|humans?|children|child|kids?|minors?|teacher|streamer|viewers?|neighbors?|neighbours?|civilians?|family|someone|anyone|everyone|myself|yourself)\b/iu;

export function blockedByModeration(text: string, result: Moderation): boolean {
  if (!result || !result.categories || !result.category_scores)
    throw Error("Malformed moderation response");
  const flags = result.categories;
  const scores = result.category_scores;
  const names = [
    "harassment",
    "harassment/threatening",
    "hate",
    "hate/threatening",
    "illicit",
    "illicit/violent",
    "self-harm",
    "self-harm/instructions",
    "self-harm/intent",
    "sexual",
    "sexual/minors",
    "violence",
    "violence/graphic",
  ] as const;
  for (const name of names)
    if (
      typeof flags[name] !== "boolean" ||
      typeof scores[name] !== "number" ||
      !Number.isFinite(scores[name])
    )
      throw Error("Incomplete moderation categories");
  if (names.some((name) => name !== "violence" && flags[name])) return true;
  if (scores["violence/graphic"] >= 0.5 || directThreat.test(text)) return true;
  if (flags.violence) return !fantasy.test(text) || realPerson.test(text);
  return false;
}

export async function moderateIdeas(
  client: OpenAI,
  texts: string[],
  signal: AbortSignal,
): Promise<boolean[]> {
  const result = await client.moderations.create(
    { model: "omni-moderation-latest", input: texts },
    { signal },
  );
  if (result.results.length !== texts.length)
    throw Error("Moderation returned an incomplete result");
  return result.results.map((entry, index) =>
    blockedByModeration(texts[index]!, entry),
  );
}
