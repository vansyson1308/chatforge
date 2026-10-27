/** Public mod contract. Implementations execute inside QuickJS, never in the host realm. */
export type ModEventName =
  | "tick"
  | "wave_start"
  | "wave_end"
  | "hero_join"
  | "enemy_killed"
  | "keep_damaged"
  | "twitch:sub"
  | "twitch:cheer"
  | "twitch:raid"
  | "twitch:follow";
export type Weather = "rain" | "snow" | "ash" | "meteor" | "aurora";
export type RuleKey =
  | "waveSize"
  | "enemySpeedMultiplier"
  | "spawnIntervalTicks"
  | "gravity"
  | "heroDamageMultiplier"
  | "maxHeroes"
  | "heroIdleTicks";
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type ModEvent = { type: ModEventName; [key: string]: JsonValue };
export interface PixelSprite {
  grid: string[];
  palette: Record<string, string>;
}
export interface EntityDefinition {
  sprite: PixelSprite;
  hp: number;
  speed: number;
  damage: number;
  behavior: "wander" | "chase" | "orbit" | "ranged" | "guard";
  range?: number;
}
export interface EntityView {
  id: number;
  kind: string;
  team: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tags: string[];
}
export interface EntityHandle extends EntityView {
  damage(amount: number): void;
  heal(amount: number): void;
  setSpeed(value: number): void;
  tag(name: string): void;
}
export interface ModApi {
  defineEnemy(name: string, definition: EntityDefinition): void;
  defineHeroWeapon(name: string, definition: JsonValue): void;
  defineProjectile(name: string, definition: JsonValue): void;
  spawn(kind: string, x: number, y: number): EntityHandle | null;
  query(filter: { team?: string; kind?: string; tag?: string }): EntityHandle[];
  on(event: ModEventName, handler: (event: ModEvent) => void): void;
  registerCommand(
    name: string,
    handler: (viewer: string, args: string) => void,
    options: { cooldownSec: number },
  ): void;
  every(ticks: number, handler: () => void): void;
  after(ticks: number, handler: () => void): void;
  rules: {
    get(key: RuleKey): number;
    set(key: RuleKey, value: number): number;
  };
  fx: {
    telegraph(x: number, y: number, radius: number, ticks: number): void;
    shake(intensity: number, ticks: number): void;
    particles(x: number, y: number, color: string, count: number): void;
    banner(text: string): void;
    tint(color: string, ticks: number): void;
    weather(kind: Weather, ticks: number): void;
  };
  random(): number;
  state: Record<string, JsonValue>;
  log(message: string): void;
}

/** Sprite characters are opaque palette keys; dot means transparent. */
export function validateSprite(sprite: unknown): sprite is PixelSprite {
  if (!sprite || typeof sprite !== "object" || Array.isArray(sprite))
    return false;
  const value = sprite as Record<string, unknown>;
  if (
    !Array.isArray(value.grid) ||
    value.grid.length < 1 ||
    value.grid.length > 24 ||
    !value.grid.every((row) => typeof row === "string")
  )
    return false;
  const grid = value.grid as string[];
  const width = grid[0]?.length ?? 0;
  if (width < 1 || width > 24 || !grid.every((row) => row.length === width))
    return false;
  if (
    !value.palette ||
    typeof value.palette !== "object" ||
    Array.isArray(value.palette)
  )
    return false;
  const palette = value.palette as Record<string, unknown>;
  const entries = Object.entries(palette);
  if (
    entries.length < 1 ||
    entries.length > 8 ||
    entries.some(
      ([key, color]) =>
        key.length !== 1 ||
        key === "." ||
        typeof color !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(color),
    )
  )
    return false;
  return grid.every((row) =>
    [...row].every((char) => char === "." || Object.hasOwn(palette, char)),
  );
}
