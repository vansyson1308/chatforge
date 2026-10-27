import {
  MAX_ENTITIES,
  RULE_BOUNDS,
  type WorldState,
  type RuleKey,
} from "./world.js";
export function invariantFailure(w: WorldState): string | undefined {
  const at = `tick=${w.tick}`;
  if (w.entities.length > MAX_ENTITIES)
    return `${at} entity count=${w.entities.length} exceeds ${MAX_ENTITIES}`;
  if (!Number.isFinite(w.keepHp) || w.keepHp < 0 || w.keepHp > 100)
    return `${at} keepHp=${w.keepHp} outside 0..100`;
  const ids = new Set<number>();
  for (const e of w.entities) {
    const label = `${at} entity=${e.id} kind=${e.kind}`;
    if (ids.has(e.id)) return `${label} duplicate id`;
    ids.add(e.id);
    for (const key of ["x", "y", "hp", "maxHp", "vx", "vy"] as const)
      if (!Number.isFinite(e[key]))
        return `${label} ${key}=${e[key]} must be finite`;
    if (e.x < -200 || e.x > 1400) return `${label} x=${e.x} outside -200..1400`;
    if (e.y < -200 || e.y > 875) return `${label} y=${e.y} outside -200..875`;
  }
  for (const [key, bounds] of Object.entries(RULE_BOUNDS)) {
    const value = w.rules[key as RuleKey];
    if (!Number.isFinite(value) || value < bounds.min || value > bounds.max)
      return `${at} rule=${key} value=${value} outside ${bounds.min}..${bounds.max}`;
  }
}
/** Deterministic repair of legacy snapshots; report every repair to the operator. */
export function healWorld(w: WorldState): string[] {
  const repairs: string[] = [];
  const seen = new Set<number>();
  w.entities = w.entities
    .filter((e) => {
      const valid =
        !seen.has(e.id) &&
        [e.x, e.y, e.hp, e.maxHp, e.vx, e.vy].every(Number.isFinite);
      seen.add(e.id);
      const escaped = e.x < -200 || e.x > 1400 || e.y < -200 || e.y > 875;
      if (!valid || (escaped && e.team === "projectile")) {
        repairs.push(`removed entity=${e.id} kind=${e.kind}`);
        return false;
      }
      if (escaped) {
        repairs.push(`clamped entity=${e.id} x=${e.x} y=${e.y}`);
        e.x = Math.max(-200, Math.min(1400, e.x));
        e.y = Math.max(-200, Math.min(875, e.y));
      }
      return true;
    })
    .slice(0, MAX_ENTITIES);
  if (!Number.isFinite(w.keepHp) || w.keepHp < 0 || w.keepHp > 100) {
    repairs.push(`keepHp=${w.keepHp}`);
    w.keepHp = 100;
  }
  for (const [key, b] of Object.entries(RULE_BOUNDS)) {
    const k = key as RuleKey,
      v = w.rules[k];
    if (!Number.isFinite(v) || v < b.min || v > b.max) {
      repairs.push(`rule=${key} value=${v}`);
      w.rules[k] = Number.isFinite(v)
        ? Math.max(b.min, Math.min(b.max, v))
        : b.initial;
    }
  }
  w.nextId = Math.max(w.nextId, ...w.entities.map((e) => e.id + 1));
  return repairs;
}
