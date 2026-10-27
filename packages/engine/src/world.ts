/** The simulation advances only when tick() is called; one tick is 1/30 second. */
export const TICK_RATE = 30;
export const MAX_ENTITIES = 1000;
export const KEEP = { x: 600, y: 475 } as const;

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
export type Team = "hero" | "enemy" | "projectile" | "prop";
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
  viewerId?: string;
  simulated?: boolean;
  lastActiveTick?: number;
  ownerId?: number;
  lifetime?: number;
  weapon?: string;
  gold: number;
  bornTick?: number;
  lastSiegeTick?: number;
  scale?: number;
  hat?: string;
}
export interface ProjectileSpec {
  speed: number;
  damage: number;
  lifetime: number;
}
export interface WeaponSpec {
  damage: number;
  range: number;
  cooldown: number;
  projectile?: string;
  modOwner?: string;
}
export interface ModRecord {
  source: string;
  declarationTick: number;
  state: Record<string, unknown>;
  timers: { interval: number; next: number }[];
  schedules: { name: string; dueTick: number; payload: unknown }[];
  cooldowns: Record<string, number>;
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
  queue: (string | { name: string; userId: string; simulated: boolean })[];
  pendingEnemies: number;
  spawnCountdown: number;
  events: Event[];
  fx: Event[];
  mods: Record<string, ModRecord>;
  modSetVersion: number;
  weapons: Record<string, WeaponSpec>;
  projectiles: Record<string, ProjectileSpec>;
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
  scale?: number;
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const distance2 = (
  a: { x: number; y: number },
  b: { x: number; y: number },
): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export class World {
  state: WorldState;
  readonly byId = new Map<number, Entity>();
  private grid = new Map<number, Entity[]>();
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
          mods: {},
          modSetVersion: 0,
          weapons: {},
          projectiles: {},
        };
    this.reindex();
  }
  reindex(): void {
    this.byId.clear();
    this.grid.clear();
    for (const entity of this.state.entities) {
      this.byId.set(entity.id, entity);
      const key = Math.floor(entity.x / 80) + Math.floor(entity.y / 80) * 64;
      const cell = this.grid.get(key);
      if (cell) cell.push(entity);
      else this.grid.set(key, [entity]);
    }
  }
  nearby(
    x: number,
    y: number,
    radius: number,
    visit: (entity: Entity) => void,
  ): void {
    for (
      let gy = Math.floor((y - radius) / 80);
      gy <= Math.floor((y + radius) / 80);
      gy++
    )
      for (
        let gx = Math.floor((x - radius) / 80);
        gx <= Math.floor((x + radius) / 80);
        gx++
      ) {
        const cell = this.grid.get(gx + gy * 64);
        if (cell)
          for (const entity of cell)
            if (
              entity.hp > 0 &&
              (entity.x - x) ** 2 + (entity.y - y) ** 2 <= radius * radius
            )
              visit(entity);
      }
  }
  private nearest(entity: Entity): Entity | undefined {
    let best: Entity | undefined;
    let bestDistance = Infinity;
    const limit =
      entity.team === "enemy" ? 90 : entity.behavior === "guard" ? 450 : 1200;
    for (let radius = 80; radius < limit * 2; radius *= 2) {
      this.nearby(entity.x, entity.y, Math.min(limit, radius), (candidate) => {
        if (
          candidate.team === "projectile" ||
          candidate.team === "prop" ||
          candidate.team === entity.team
        )
          return;
        const d = distance2(entity, candidate);
        if (
          d < bestDistance ||
          (d === bestDistance && candidate.id < (best?.id ?? Infinity))
        ) {
          best = candidate;
          bestDistance = d;
        }
      });
      if (best || radius >= limit) break;
    }
    return best;
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
    if (this.state.entities.length >= MAX_ENTITIES)
      throw Error("World entity budget exceeded");
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
      gold: 0,
      bornTick: this.state.tick,
      scale: options.scale ?? 1,
      tags: [],
      ...(options.viewer === undefined
        ? {}
        : { viewer: options.viewer, lastActiveTick: this.state.tick }),
      ...(options.ownerId === undefined ? {} : { ownerId: options.ownerId }),
      ...(options.lifetime === undefined ? {} : { lifetime: options.lifetime }),
    };
    this.state.entities.push(entity);
    this.byId.set(entity.id, entity);
    return entity;
  }
  joinViewer(name: string, userId?: string, simulated = false): Entity | null {
    const viewer = name.trim().slice(0, 40);
    if (!viewer) throw new Error("Viewer name is empty");
    const found = this.state.entities.find(
      (e) =>
        e.team === "hero" &&
        (userId
          ? e.viewerId === userId
          : !e.viewerId && e.viewer?.toLowerCase() === viewer.toLowerCase()),
    );
    if (found) {
      found.lastActiveTick = this.state.tick;
      found.viewer = viewer;
      return found;
    }
    if (
      this.state.entities.filter((e) => e.team === "hero").length >=
      this.state.rules.maxHeroes
    ) {
      if (
        this.state.queue.length < 1000 &&
        !this.state.queue.some((v) =>
          typeof v === "string"
            ? !userId && v.toLowerCase() === viewer.toLowerCase()
            : v.userId === userId,
        )
      )
        this.state.queue.push(
          userId ? { name: viewer, userId, simulated } : viewer,
        );
      return null;
    }
    const hero = this.spawn({
      kind: "hero",
      team: "hero",
      x: KEEP.x + (this.random() - 0.5) * 300,
      y: KEEP.y + this.random() * 95,
      hp: 100,
      speed: 1.6,
      damage: 10,
      range: 25,
      behavior: "guard",
      viewer,
    });
    if (userId) {
      hero.viewerId = userId;
      hero.simulated = simulated;
    }
    this.state.events.push({ type: "hero_join", entityId: hero.id, viewer });
    return hero;
  }
  snapshot(): WorldState {
    return copy(this.state);
  }
  restore(snapshot: WorldState): void {
    this.state = copy(snapshot);
    this.reindex();
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
      Math.floor(
        this.state.rules.waveSize +
          (this.state.wave - 1) * 2 +
          this.state.entities.filter((e) => e.team === "hero").length * 1.8,
      ),
    );
    this.state.spawnCountdown = -2;
    this.state.events.push({ type: "wave_start", wave: this.state.wave });
    this.state.fx.push({ type: "banner", text: `Wave ${this.state.wave}` });
  }
  damage(target: Entity, amount: number, source?: Entity): void {
    if (target.hp <= 0) return;
    // Give newly forged creatures a readable entrance before either side can fight.
    if (
      target.bornTick !== undefined &&
      this.state.tick - target.bornTick < 60 &&
      target.tags.some((t) => t.startsWith("mod:")) &&
      target.team !== "projectile"
    )
      return;
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
        source.gold += 1 + this.state.wave;
        this.state.fx.push({
          type: "loot",
          x: target.x,
          y: target.y,
          amount: 1 + this.state.wave,
        });
        if (source.kills >= source.level * 3) {
          source.level++;
          source.maxHp += 10;
          source.hp = source.maxHp;
          source.damage += 2;
          this.state.fx.push({
            type: "ring",
            x: source.x,
            y: source.y,
            radius: 45,
            ticks: 30,
            color: "#ffe5a3",
          });
        }
      }
    }
  }
  tick(): void {
    const state = this.state;
    state.tick++;
    if (state.wave === 0) this.startWave();
    if (
      state.pendingEnemies > 0 &&
      state.entities.length < MAX_ENTITIES &&
      state.spawnCountdown-- <= 0
    ) {
      const heroes = state.entities.filter((e) => e.team === "hero").length;
      const boss = state.wave % 5 === 0 && state.spawnCountdown < -1;
      this.spawn({
        kind: boss ? "slime-king" : "slime",
        team: "enemy",
        x: this.random() < 0.5 ? 0 : 1200,
        y: 470 + this.random() * 100,
        hp:
          (36 +
            state.wave * 5 +
            heroes * 3 +
            Object.keys(state.mods).length * 2) *
          (boss ? 5 : 1),
        speed: (boss ? 1.5 : 2.2) * state.rules.enemySpeedMultiplier,
        damage: boss ? 16 : 6,
        scale: boss ? 2.5 : 1,
        range: 18,
      });
      state.pendingEnemies--;
      state.spawnCountdown = Math.floor(state.rules.spawnIntervalTicks);
    }
    const entities = state.entities;
    const initialCount = entities.length;
    this.reindex();
    const modCounts = new Map<string, number>();
    for (let i=0;i<initialCount;i++) {
      const entity=entities[i]!;
      for (const tag of entity.tags)
        if (tag.startsWith("mod:"))
          modCounts.set(tag, (modCounts.get(tag) ?? 0) + 1);
    }
    for (let index=0;index<initialCount;index++) {
      const entity=entities[index]!;
      if (entity.hp <= 0) continue;
      if (entity.team === "prop") {
        if (entity.lifetime !== undefined && --entity.lifetime <= 0)
          entity.hp = 0;
        continue;
      }
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
        entity.vy += state.rules.gravity * 0.01;
        const owner = this.byId.get(entity.ownerId ?? -1);
        let target: Entity | undefined;
        this.nearby(entity.x, entity.y, 10, (e) => {
          if (
            !target &&
            e.team !== "projectile" &&
            e.team !== "prop" &&
            e.team !== owner?.team
          )
            target = e;
        });
        if (target) {
          this.damage(target, entity.damage, owner);
          entity.hp = 0;
        }
        if (
          entity.lifetime <= 0 ||
          entity.x < -200 ||
          entity.x > 1400 ||
          entity.y < -200 ||
          entity.y > 875
        )
          entity.hp = 0;
        continue;
      }
      if (
        entity.bornTick !== undefined &&
        state.tick - entity.bornTick < 60 &&
        entity.tags.some((t) => t.startsWith("mod:"))
      )
        continue;
      // A minority of seed raiders lob visible siege shots while approaching or fighting.
      // This lets the keep take pressure without forcing every melee enemy through heroes.
      if (
        entity.team === "enemy" &&
        (entity.kind === "slime" || entity.kind === "slime-king") &&
        entity.id % 2 === 0 &&
        distance2(entity, KEEP) < 500 ** 2 &&
        state.tick - (entity.lastSiegeTick ?? entity.bornTick ?? 0) >=
          (entity.lastSiegeTick === undefined ? 60 : 180)
      ) {
        entity.lastSiegeTick = state.tick;
        const amount = entity.kind === "slime-king" ? 2 : 0.5;
        state.keepHp -= amount;
        state.events.push({ type: "keep_damaged", amount, hp: state.keepHp });
        state.fx.push({
          type: "beam",
          x: entity.x,
          y: entity.y - 10,
          x2: KEEP.x,
          y2: KEEP.y - 40,
          color: "#ffa65c",
          ticks: 9,
        });
      }
      if (entity.cooldown > 0) entity.cooldown--;
      let target = this.nearest(entity);
      // Siege units keep marching; chasing a remote hero must not stall the wave.
      if (
        entity.team === "enemy" &&
        target &&
        distance2(entity, target) > 90 ** 2
      )
        target = undefined;
      if (
        entity.team === "hero" &&
        entity.behavior === "guard" &&
        target &&
        distance2(entity, target) > 450 ** 2
      )
        target = undefined;
      // Siege units at the wall focus the keep instead of standing idle against nearby defenders.
      if (entity.team === "enemy" && distance2(entity, KEEP) < 64 ** 2)
        target = undefined;
      let destination: { x: number; y: number } = target ?? KEEP;
      if (!target && entity.team === "hero" && entity.behavior === "guard") {
        destination = {
          x: 360 + (entity.id % 12) * 44,
          y: 480 + (Math.floor(entity.id / 12) % 3) * 38,
        };
      }
      if (!target && entity.behavior === "wander") {
        const heading = Math.floor(state.tick / 120) * 2.399 + entity.id * 31;
        destination = {
          x: KEEP.x + Math.cos(heading) * 350,
          y: KEEP.y + Math.sin(heading) * 240,
        };
      }
      if (entity.behavior === "orbit")
        destination = {
          x:
            (target?.x ?? KEEP.x) +
            Math.cos((state.tick + entity.id * 31) / 90) * 60,
          y:
            (target?.y ?? KEEP.y) +
            Math.sin((state.tick + entity.id * 31) / 90) * 45,
        };
      const dx = destination.x - entity.x;
      const dy = destination.y - entity.y;
      const distance = Math.sqrt(dx*dx+dy*dy) || 1;
      const weapon = entity.weapon ? state.weapons[entity.weapon] : undefined;
      const range = weapon?.range ?? entity.range;
      const targetDistance = target
        ? Math.sqrt(distance2(entity, target))
        : Infinity;
      const inRange = Boolean(target && targetDistance <= range);
      if (target && inRange && entity.cooldown === 0) {
        if (entity.behavior === "ranged" || weapon?.projectile) {
          const ownerTag = weapon?.modOwner
            ? `mod:${weapon.modOwner}`
            : undefined;
          if (
            state.entities.length >= MAX_ENTITIES ||
            (ownerTag && (modCounts.get(ownerTag) ?? 0) >= 100)
          ) {
            entity.cooldown = weapon?.cooldown ?? 30;
            continue;
          }
          const spec = weapon?.projectile
            ? state.projectiles[weapon.projectile]
            : undefined;
          const projectile = this.spawn({
            kind: weapon?.projectile ?? "bolt",
            team: "projectile",
            x: entity.x,
            y: entity.y,
            damage:
              (weapon?.damage ?? spec?.damage ?? entity.damage) *
              (entity.team === "hero" ? state.rules.heroDamageMultiplier : 1),
            ownerId: entity.id,
            lifetime: spec?.lifetime ?? 90,
          });
          if (ownerTag) {
            projectile.tags.push(ownerTag);
            modCounts.set(ownerTag, (modCounts.get(ownerTag) ?? 0) + 1);
          }
          projectile.vx =
            ((target.x - entity.x) / (targetDistance || 1)) *
            (spec?.speed ?? 5);
          projectile.vy =
            ((target.y - entity.y) / (targetDistance || 1)) *
            (spec?.speed ?? 5);
        } else
          this.damage(
            target,
            (weapon?.damage ?? entity.damage) *
              (entity.team === "hero" ? state.rules.heroDamageMultiplier : 1),
            entity,
          );
        entity.cooldown = weapon?.cooldown ?? 30;
      }
      const direction =
        (entity.behavior === "ranged" || weapon?.projectile) &&
        target &&
        targetDistance < range * 0.55
          ? -1
          : inRange && entity.behavior !== "orbit"
            ? 0
            : 1;
      entity.vx = (dx / distance) * entity.speed * direction;
      entity.vy = (dy / distance) * entity.speed * direction;
      if (entity.team === "hero") {
        this.nearby(entity.x, entity.y, 36, (other) => {
          if (other.id === entity.id || other.team !== "hero") return;
          const sx = entity.x - other.x,
            sy = entity.y - other.y;
          const d = Math.sqrt(sx*sx+sy*sy);
          const force = ((36 - d) / 36) * 0.65;
          entity.vx +=
            (d > 0.01 ? sx / d : entity.id < other.id ? -1 : 1) * force;
          entity.vy += (d > 0.01 ? sy / d : 0) * force;
        });
      }
      entity.x += entity.vx;
      entity.y += entity.vy;
      entity.x = Math.max(-200, Math.min(1400, entity.x));
      entity.y = Math.max(455, Math.min(610, entity.y));
      if (
        entity.team === "enemy" &&
        distance2(entity, KEEP) < 24 ** 2 &&
        entity.cooldown === 0
      ) {
        const siegeDamage = Math.max(1, Math.ceil(entity.damage * 0.15));
        state.keepHp -= siegeDamage;
        entity.cooldown = 30;
        state.events.push({
          type: "keep_damaged",
          amount: siegeDamage,
          hp: state.keepHp,
        });
      }
    }
    if(state.entities.some(e=>e.hp<=0)) {
      state.entities = state.entities.filter((e) => e.hp > 0);
      for (const [id, entity] of this.byId)
        if (entity.hp <= 0) this.byId.delete(id);
    }
    if (state.keepHp <= 0) {
      state.keepHp = 100;
      state.wave = 0;
      state.cycle++;
      state.pendingEnemies = 0;
      state.entities = state.entities.filter((e) => e.team !== "enemy");
      this.reindex();
      state.fx.push({
        type: "banner",
        text: "THE KEEP HAS FALLEN — REBUILDING",
        ticks: 150,
      });
      state.fx.push({ type: "flash", color: "#ff6048", ticks: 20 });
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
      if (next) {
        if (typeof next === "string") this.joinViewer(next);
        else this.joinViewer(next.name, next.userId, next.simulated);
      }
    }
  }
}
