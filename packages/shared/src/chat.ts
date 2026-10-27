import { z } from "zod";

export const sourceSchema = z.enum(["twitch", "simulator"]);
export type Source = z.infer<typeof sourceSchema>;
export const chatSchema = z.object({
  type: z.literal("chat"),
  source: sourceSchema,
  userId: z.string().min(1).max(100),
  login: z.string().max(100),
  displayName: z.string().max(100),
  text: z.string().max(2000),
  badges: z.array(z.string().max(100)).max(30),
  isBroadcaster: z.boolean(),
  isMod: z.boolean(),
  emoteOnly: z.boolean().default(false),
});
export const audienceEventSchema = z.object({
  type: z.enum(["twitch:sub", "twitch:cheer", "twitch:raid", "twitch:follow"]),
  source: sourceSchema,
  userId: z.string().max(100),
  viewer: z.string().max(100),
  count: z.number().int().nonnegative(),
  detail: z.string().max(100),
});
export type Chat = z.infer<typeof chatSchema>;
export type AudienceEvent = z.infer<typeof audienceEventSchema>;
export type SourceEvent = Chat | AudienceEvent;
export interface ChatSource {
  start(): void;
  stop(): void;
}
export const ideaSchema = z.object({
  id: z.number().int(),
  author: z.string(),
  userId: z.string(),
  text: z.string(),
  status: z.enum(["pending", "accepted", "rejected"]),
  createdAt: z.number(),
  source: sourceSchema,
});
export type Idea = z.infer<typeof ideaSchema>;
export const sourceConfigSchema = z.object({
  sources: z.array(sourceSchema).min(1).max(2),
  intensity: z.enum(["chill", "normal", "hype"]),
  autoJoin: z.boolean(),
});
export const dashboardSchema = z.object({
  auth: z.object({
    health: z.string(),
    account: z.string(),
    expiresAt: z.number(),
    configured: z.boolean(),
  }),
  eventsub: z.object({
    state: z.string(),
    subscriptions: z.array(
      z.object({
        type: z.string(),
        version: z.string(),
        status: z.string(),
        reason: z.string(),
      }),
    ),
  }),
  config: sourceConfigSchema,
  log: z.array(
    z.object({
      id: z.number(),
      source: z.string(),
      text: z.string(),
      time: z.number(),
    }),
  ),
  ideas: z.array(ideaSchema),
  votes: z.array(
    z.object({ userId: z.string(), choice: z.number(), source: sourceSchema }),
  ),
  outbound: z.string(),
});
export type DashboardState = z.infer<typeof dashboardSchema>;
