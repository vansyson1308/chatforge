import { z } from "zod";

export const creditSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(40),
  source: z.enum(["twitch", "simulator"]),
});
export function formatCredit(credit: { name: string; source: string }): string {
  return `@${credit.name}${credit.source === "simulator" ? " (SIM)" : ""}`;
}
export function formatCredits(
  credits: readonly { name: string; source: string }[],
): string {
  return credits.length
    ? credits.map(formatCredit).join(", ")
    : "Forge suggestion";
}
export const cardSchema = z.object({
  ideaIds: z.array(z.number().int()).max(200).optional(),
  spectacle: z
    .object({
      visibleWithinSeconds: z.number().min(0).max(10),
      chatInvolvement: z.boolean(),
      customSprite: z.boolean(),
      timedEvent: z.boolean(),
      score: z.number().min(0).max(10),
    })
    .optional(),
  title: z.string().min(1).max(40),
  pitch: z.string().min(1).max(120),
  visualHook: z.string().min(1).max(240),
  acceptance: z.array(z.string().min(1).max(160)).min(1).max(6),
  commands: z.array(z.string().regex(/^![a-z][a-z0-9_]{0,19}$/)).max(3),
  credits: z.array(creditSchema).max(200),
  feasibility: z.string().max(240),
  risk: z.string().max(160),
  suggestion: z.boolean(),
});
export const cardsSchema = z.object({ cards: z.array(cardSchema).length(3) });
export type ForgeCard = z.infer<typeof cardSchema>;
export const forgeTestSchema = z
  .object({
    commands: z
      .array(z.string().regex(/^![a-z][a-z0-9_]{0,19}$/))
      .max(6)
      .optional(),
    events: z
      .array(
        z.enum([
          "twitch:sub",
          "twitch:cheer",
          "twitch:raid",
          "twitch:follow",
          "wave_start",
          "wave_end",
        ]),
      )
      .max(8)
      .optional(),
    expect: z
      .object({
        spawnKinds: z.array(z.string().max(40)).max(8).optional(),
        fx: z
          .array(
            z.enum([
              "banner",
              "telegraph",
              "impact",
              "shake",
              "particles",
              "tint",
              "weather",
              "text",
              "ring",
              "beam",
              "lightning",
              "flash",
              "trail",
              "sky",
            ]),
          )
          .max(8)
          .optional(),
        rules: z.record(z.string(), z.number().finite()).optional(),
        minEffects: z.number().int().min(1).max(10000).optional(),
      })
      .strict(),
  })
  .strict();
export type ForgeTest = z.infer<typeof forgeTestSchema>;
export const stageSchema = z.enum([
  "IDLE",
  "COLLECTING",
  "CURATING",
  "VOTING",
  "STREAMER_APPROVAL",
  "BUILDING",
  "TESTING",
  "DEPLOYING",
  "LIVE",
  "FAILED",
  "ROLLED_BACK",
]);
export type ForgeStage = z.infer<typeof stageSchema>;
export interface GateReport {
  spectacle?: {
    score: number;
    fxTypes: number;
    sprites: number;
    entities: number;
    commands: number;
    durationSeconds: number;
  };
  hostFailure?: boolean;
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  hashes: string[];
  ticks: number;
  durationMs: number;
  effects: number;
}
export interface ForgeRound {
  id: number;
  stage: ForgeStage;
  deadline: number | null;
  startedAt: number;
  cards: ForgeCard[];
  tallies: number[];
  winner: number | null;
  ideaIds: number[];
  modId: string | null;
  attempts: number;
  durationMs: number;
  report: GateReport | null;
}
export interface ForgeView {
  connection?: { twitchEnabled: boolean; eventsub: string };
  retirement?: { enabled: boolean; limit: number };
  patches?: { id: string; title: string; credits: ForgeCard["credits"] }[];
  ideas?: { author: string; text: string; source: string }[];
  type: "forge";
  running: boolean;
  preset: "demo" | "normal";
  season: number;
  round: ForgeRound | null;
  build: ForgeRound | null;
  ideaCount: number;
  activity: string[];
  notice: string;
  mods: { id: string; title: string; credits: ForgeCard["credits"] }[];
  usage: { buildsThisHour: number; cap: number; responsesTokens: number };
  now: number;
}
const gateReportSchema = z.object({
  spectacle: z
    .object({
      score: z.number(),
      fxTypes: z.number(),
      sprites: z.number(),
      entities: z.number(),
      commands: z.number(),
      durationSeconds: z.number(),
    })
    .optional(),
  hostFailure: z.boolean().optional(),
  ok: z.boolean(),
  checks: z
    .array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string() }))
    .max(16),
  hashes: z.array(z.string()).max(2),
  ticks: z.number(),
  durationMs: z.number(),
  effects: z.number(),
});
const roundSchema = z.object({
  id: z.number(),
  stage: stageSchema,
  deadline: z.number().nullable(),
  startedAt: z.number(),
  cards: z.array(cardSchema).max(3),
  tallies: z.array(z.number()).length(3),
  winner: z.number().nullable(),
  ideaIds: z.array(z.number()).max(200),
  modId: z.string().nullable(),
  attempts: z.number(),
  durationMs: z.number(),
  report: gateReportSchema.nullable(),
});
export const forgeViewSchema = z.object({
  connection: z
    .object({ twitchEnabled: z.boolean(), eventsub: z.string() })
    .optional(),
  retirement: z
    .object({ enabled: z.boolean(), limit: z.number().int().min(1).max(24) })
    .optional(),
  patches: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        credits: z.array(creditSchema),
      }),
    )
    .optional(),
  ideas: z
    .array(
      z.object({ author: z.string(), text: z.string(), source: z.string() }),
    )
    .max(4)
    .optional(),
  type: z.literal("forge"),
  running: z.boolean(),
  preset: z.enum(["demo", "normal"]),
  season: z.number(),
  round: roundSchema.nullable(),
  build: roundSchema.nullable(),
  ideaCount: z.number(),
  activity: z.array(z.string().max(180)).max(40),
  notice: z.string(),
  mods: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      credits: z.array(creditSchema),
    }),
  ),
  usage: z.object({
    buildsThisHour: z.number(),
    cap: z.number(),
    responsesTokens: z.number(),
  }),
  now: z.number(),
});
