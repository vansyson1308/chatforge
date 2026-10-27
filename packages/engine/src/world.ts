/** The simulation advances only when tick() is called; one tick is 1/30 second. */
export const TICK_RATE = 30;
export const KEEP = { x: 600, y: 337 } as const;

export const RULE_BOUNDS = {
  waveSize: { min: 1, max: 100, initial: 6 },
  enemySpeedMultiplier: { min: 0.1, max: 4, initial: 1 },
  spawnIntervalTicks: { min: 1, max: 900, initial: 24 },
  gravity: { min: 0, max: 5, initial: 0 },
  heroDamageMultiplier: { min: 0.1, max: 10, initial: 1 },
  maxHeroes: { min: 1, max: 300, initial: 60 },
  heroIdleTicks: { min: 30, max: 324000, initial: 27000 },
} as const;
export type RuleKey = keyof typeof RULE_BOUNDS;
export type Rules = Record<RuleKey, number>;
export type Team = "hero" | "enemy" | "projectile";
export type Behavior = "wander" | "chase" | "orbit" | "ranged" | "guard";
export interface Entity {
  id: number;
  kind: string;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  range: number;
  behavior: Behavior;
  cooldown: number;
  level: number;
  kills: number;
  tags: string[];
  viewer?: string;
  lastActiveTick?: number;
  ownerId?: number;
  lifetime?: number;
}
export type Event = { type: string; [key: string]: string | number | boolean };
export interface WorldState {
  tick: number;
  rng: number;
  nextId: number;
  wave: number;
  cycle: number;
  keepHp: number;
  rules: Rules;
  entities: Entity[];
  queue: string[];
  pendingEnemies: number;
  spawnCountdown: number;
  events: Event[];
  fx: Event[];
}
export interface SpawnOptions {
  kind: string;
  team: Team;
  x: number;
  y: number;
  hp?: number;
  speed?: number;
  damage?: number;
  range?: number;
  behavior?: Behavior;
  viewer?: string;
  ownerId?: number;
  lifetime?: number;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const distance2 = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export class World {
  state: WorldState;
  constructor(seed = 1, snapshot?: WorldState) {
    this.state = snapshot
      ? copy(snapshot)
      : {
          tick: 0,
          rng: seed >>> 0 || 1,
          nextId: 1,
          wave: 0,
          cycle: 1,
          keepHp: 100,
          rules: Object.fromEntries(
            Object.entries(RULE_BOUNDS).map(([key, bounds]) => [
              key,
              bounds.initial,
            ]),
          ) as Rules,
          entities: [],
          queue: [],
          pendingEnemies: 0,
          spawnCountdown: 0,
          events: [],
          fx: [],
        };
  }
  random(): number {
    let x = this.state.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state.rng = x >>> 0;
    return this.state.rng / 0x100000000;
  }
  setRule(key: RuleKey, value: number): number {
    if (!Number.isFinite(value) || !Object.hasOwn(RULE_BOUNDS, key))
      throw new Error("Invalid rule");
    const bounds = RULE_BOUNDS[key];
    return (this.state.rules[key] = Math.max(
      bounds.min,
      Math.min(bounds.max, value),
    ));
  }
  spawn(options: SpawnOptions): Entity {
    if (
      ![
        options.x,
        options.y,
        options.hp ?? 1,
        options.speed ?? 1,
        options.damage ?? 1,
      ].every(Number.isFinite)
    )
      throw new Error("Invalid entity values");
    const entity: Entity = {
      id: this.state.nextId++,
      kind: options.kind,
      team: options.team,
      x: options.x,
      y: options.y,
      vx: 0,
      vy: 0,
      hp: options.hp ?? 30,
      maxHp: options.hp ?? 30,
      speed: options.speed ?? 1,
      damage: options.damage ?? 5,
      range: options.range ?? 20,
      behavior: options.behavior ?? "chase",
      cooldown: 0,
      level: 1,
      kills: 0,
      tags: [],
      ...(options.viewer === undefined
        ? {}
        : { viewer: options.viewer, lastActiveTick: this.state.tick }),
      ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
      ...(options.lifetime === undefined ? {} : { lifetime: options.lifetime }),
    };
    this.state.entities.push(entity);
    return entity;
  }
  joinViewer(name: string): Entity | null {
    const viewer = name.trim().slice(0, 40);
    if (!viewer) throw new Error("Viewer name is empty");
    const found = this.state.entities.find(
      (e) =>
        e.team === "hero" && e.viewer?.toLowerCase() === viewer.toLowerCase(),
    );
    if (found) {
      found.lastActiveTick = this.state.tick;
      return found;
    }
    if (
      this.state.entities.filter((e) => e.team === "hero").length >=
      this.state.rules.maxHeroes
    ) {
      if (
        !this.state.queue.some((v) => v.toLowerCase() === viewer.toLowerCase())
      )
        this.state.queue.push(viewer);
      return null;
    }
    const hero = this.spawn({
      kind: "hero",
      team: "hero",
      x: KEEP.x + (this.random() - 0.5) * 300,
      y: KEEP.y + 105 + this.random() * 100,
      hp: 100,
      speed: 1.6,
      damage: 10,
      range: 25,
      behavior: "guard",
      viewer,
    });
    this.state.events.push({ type: "hero_join", entityId: hero.id, viewer });
    return hero;
  }
  snapshot(): WorldState {
    return copy(this.state);
  }
  restore(snapshot: WorldState): void {
    this.state = copy(snapshot);
  }
  hash(): string {
    const json = JSON.stringify(this.state);
    let hash = 0x811c9dc5;
    for (let i = 0; i < json.length; i++) {
      hash ^= json.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }
  drainEvents(): Event[] {
    return this.state.events.splice(0);
  }
  drainFx(): Event[] {
    return this.state.fx.splice(0);
  }
  private startWave(): void {
    this.state.wave++;
    this.state.pendingEnemies = Math.min(
      100,
      Math.floor(this.state.rules.waveSize + (this.state.wave - 1) * 2),
    );
    this.state.spawnCountdown = 0;
    this.state.events.push({ type: "wave_start", wave: this.state.wave });
    this.state.fx.push({ type: "banner", text: `Wave ${this.state.wave}` });
  }
  damage(target: Entity, amount: number, source?: Entity): void {
    if (target.hp <= 0) return;
    target.hp -= amount;
    this.state.fx.push({ type: "damage", x: target.x, y: target.y, amount });
    if (target.hp <= 0 && target.team === "enemy") {
      this.state.events.push({
        type: "enemy_killed",
        entityId: target.id,
        kind: target.kind,
        x: target.x,
        y: target.y,
      });
      if (source?.team === "hero") {
        source.kills++;
        if (source.kills >= source.level * 3) {
          source.level++;
          source.maxHp += 10;
          source.hp = source.maxHp;
          source.damage += 2;
        }
      }
    }
  }
  tick(): void {
    const state = this.state;
    state.tick++;
    if (state.wave === 0) this.startWave();
    if (state.pendingEnemies > 0 && state.spawnCountdown-- <= 0) {
      const angle = this.random() * Math.PI * 2;
      this.spawn({
        kind: "slime",
        team: "enemy",
        x: KEEP.x + Math.cos(angle) * 600,
        y: KEEP.y + Math.sin(angle) * 380,
        hp: 20 + state.wave * 3,
        speed: 0.7 * state.rules.enemySpeedMultiplier,
        damage: 5,
        range: 18,
      });
      state.pendingEnemies--;
      state.spawnCountdown = Math.floor(state.rules.spawnIntervalTicks);
    }
    const entities = [...state.entities];
    for (const entity of entities) {
      if (entity.hp <= 0) continue;
      if (
        entity.team === "hero" &&
        entity.lastActiveTick !== undefined &&
        state.tick - entity.lastActiveTick >= state.rules.heroIdleTicks
      ) {
        entity.hp = 0;
        continue;
      }
      if (entity.team === "projectile") {
        entity.x += entity.vx;
        entity.y += entity.vy;
        entity.lifetime = (entity.lifetime ?? 0) - 1;
        const owner = entities.find((e) => e.id === entity.ownerId);
        const target = entities.find(
          (e) =>
            e.hp > 0 &&
            e.team !== "projectile" &&
            e.team !== owner?.team &&
            distance2(e, entity) < 100,
        );
        if (target) {
          this.damage(target, entity.damage, owner);
          entity.hp = 0;
        }
        if (entity.lifetime <= 0) entity.hp = 0;
        continue;
      }
      if (entity.cooldown > 0) entity.cooldown--;
      const opponents = entities.filter(
        (e) => e.hp > 0 && e.team !== "projectile" && e.team !== entity.team,
      );
      let target = opponents.reduce<Entity | undefined>(
        (best, candidate) =>
          !best || distance2(entity, candidate) < distance2(entity, best)
            ? candidate
            : best,
        undefined,
      );
      if (
        entity.team === "hero" &&
        entity.behavior === "guard" &&
        target &&
        distance2(entity, target) > 220 ** 2
      )
        target = undefined;
      let destination: { x: number; y: number } = target ?? KEEP;
      if (!target && entity.team === "hero" && entity.behavior === "guard") {
        const angle = state.tick / 200 + entity.id * 2.4;
        destination = {
          x: KEEP.x + Math.cos(angle) * (80 + (entity.id % 5) * 15),
          y: KEEP.y + 135 + Math.sin(angle) * 40,
        };
      }
      if (
        !target &&
        (entity.behavior === "wander" || entity.behavior === "orbit")
      )
        destination = {
          x: KEEP.x + Math.cos((state.tick + entity.id * 31) / 90) * 100,
          y: KEEP.y + Math.sin((state.tick + entity.id * 31) / 90) * 70,
        };
      const dx = destination.x - entity.x;
      const dy = destination.y - entity.y;
      const distance = Math.hypot(dx, dy) || 1;
      const inRange = Boolean(target && distance <= entity.range);
      if (target && inRange && entity.cooldown === 0) {
        if (entity.behavior === "ranged") {
          const projectile = this.spawn({
            kind: "bolt",
            team: "projectile",
            x: entity.x,
            y: entity.y,
            damage: entity.damage,
            ownerId: entity.id,
            lifetime: 90,
          });
          projectile.vx = (dx / distance) * 5;
          projectile.vy = (dy / distance) * 5;
        } else
          this.damage(
            target,
            entity.damage *
              (entity.team === "hero" ? state.rules.heroDamageMultiplier : 1),
            entity,
          );
        entity.cooldown = 30;
      }
      const direction =
        entity.behavior === "ranged" && target && distance < entity.range * 0.55
          ? -1
          : inRange
            ? 0
            : 1;
      entity.vx = (dx / distance) * entity.speed * direction;
      entity.vy = (dy / distance) * entity.speed * direction;
      entity.x += entity.vx;
      entity.y += entity.vy;
      if (
        entity.team === "enemy" &&
        distance2(entity, KEEP) < 24 ** 2 &&
        entity.cooldown === 0
      ) {
        state.keepHp -= entity.damage;
        entity.cooldown = 30;
        state.events.push({
          type: "keep_damaged",
          amount: entity.damage,
          hp: state.keepHp,
        });
      }
    }
    state.entities = state.entities.filter((e) => e.hp > 0);
    if (state.keepHp <= 0) {
      state.keepHp = 100;
      state.wave = 0;
      state.cycle++;
      state.pendingEnemies = 0;
      state.entities = state.entities.filter((e) => e.team !== "enemy");
      state.fx.push({ type: "banner", text: "The keep rises again!" });
    }
    if (
      state.pendingEnemies === 0 &&
      !state.entities.some((e) => e.team === "enemy")
    ) {
      state.events.push({ type: "wave_end", wave: state.wave });
      this.startWave();
    }
    while (
      state.queue.length &&
      state.entities.filter((e) => e.team === "hero").length <
        state.rules.maxHeroes
    ) {
      const next = state.queue.shift();
      if (next) this.joinViewer(next);
    }
  }
}
