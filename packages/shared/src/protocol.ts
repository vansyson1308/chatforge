import { z } from "zod";
/** id, kind, team, x, y, hp, maxHp, viewer, level, joined tick, simulated. */
export const renderEntitySchema = z.tuple([
  z.number().int().positive(),
  z.string().max(40),
  z.enum(["hero", "enemy", "projectile"]),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.string().max(40),
  z.number().int(),
  z.number().int(),
  z.boolean().optional(),
]);
export const renderSnapshotSchema = z.object({
  type: z.literal("snapshot"),
  tick: z.number().int(),
  wave: z.number().int(),
  cycle: z.number().int(),
  keepHp: z.number(),
  entities: z.array(renderEntitySchema).max(1200),
  fx: z
    .array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])))
    .max(2000),
  sprites: z.record(
    z.string(),
    z.object({
      grid: z.array(z.string().max(24)).max(24),
      palette: z.record(z.string(), z.string().regex(/^#[0-9a-fA-F]{6}$/)),
    }),
  ),
});
export type RenderEntity = z.infer<typeof renderEntitySchema>;
export type RenderSnapshot = z.infer<typeof renderSnapshotSchema>;
