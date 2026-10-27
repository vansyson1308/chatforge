import {
  World,
  RULE_BOUNDS,
  type Entity,
  type RuleKey,
  type SpawnOptions,
  type WorldState,
  type ModRecord,
} from "../../../packages/engine/src/index.js";
import {
  validateSprite,
  type EntityDefinition,
  type PixelSprite,
} from "../../../packages/mod-api/src/index.js";
import {
  ModRuntime,
  ModExecutionError,
  threadCpuMs,
} from "../../../packages/sandbox/src/index.js";

type Definition = { owner: string; spec: EntityDefinition };
type Transaction = {
  id: string;
  declaring: boolean;
  commands: (() => void)[];
  operations: number;
  failed: boolean;
  rng: number;
  nextId: number;
  spawned: Map<number, Entity>;
  schedules: number;
};
const identifier = /^[a-z][a-z0-9_-]{0,39}$/;
const finite = (value: unknown, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw Error("Expected a finite number");
  return Math.max(min, Math.min(max, value));
};
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string" || value.length > max)
    throw Error("Invalid text");
  return value;
};
const named = (value: unknown): string => {
  const name = text(value, 40);
  if (!identifier.test(name)) throw Error("Invalid name");
  return name;
};
const view = ({ id, kind, team, x, y, hp, maxHp, tags }: Entity) => ({
  id,
  kind,
  team,
  x,
  y,
  hp,
  maxHp,
  tags: [...tags],
});
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected object");
  return value as Record<string, unknown>;
};
export interface ModDiagnostic {
  modId: string;
  message: string;
  stack?: string;
  rollbackVersion: number;
}

/** A transaction contains validated host commands, never a copy of the world. */
export class ModHost {
  private mods = new Map<string, ModRuntime>();
  private definitions = new Map<string, Definition>();
  private spritesByName: Record<string, PixelSprite> = {};
  private definitionOwners = new Map<string, string>();
  private tx?: Transaction;
  private cpu = new Map<string, number>();
  private deployments: { id: string; source: string; before: WorldState }[] =
    [];
  private readonly safeBaseline: WorldState;
  private lastGood?: WorldState;
  readonly diagnostics: ModDiagnostic[] = [];
  private notices: ModDiagnostic[] = [];
  private epoch = 0;
  constructor(readonly world: World) {
    this.safeBaseline = world.snapshot();
  }
  sprites(): Record<string, PixelSprite> {
    return this.spritesByName;
  }
  checkpoint(): WorldState {
    return this.world.snapshot();
  }
  persistenceCheckpoint(): WorldState | undefined {
    return this.lastGood;
  }
  drainDiagnostics(): ModDiagnostic[] {
    return this.notices.splice(0);
  }
  rollbackToLastGood(): void {
    if (!this.lastGood) throw Error("No good checkpoint available");
    this.restore(this.lastGood);
  }
  private begin(id: string, declaring = false): void {
    this.tx = {
      id,
      declaring,
      commands: [],
      operations: 0,
      failed: false,
      rng: this.world.state.rng,
      nextId: this.world.state.nextId,
      spawned: new Map(),
      schedules: 0,
    };
  }
  private append(command: () => void): void {
    const tx = this.tx!;
    if (tx.commands.length >= 128) {
      tx.failed = true;
      throw Error("Command buffer budget exceeded (128)");
    }
    tx.commands.push(command);
  }
  private commit(): void {
    const tx = this.tx!;
    if (tx.failed)
      throw Error("Command buffer or host operation budget exceeded");
    for (const apply of tx.commands) apply();
    this.world.state.rng = tx.rng;
    this.tx = undefined;
  }
  private operation = (id: string, op: string, args: unknown[]): unknown => {
    const tx = this.tx;
    if (!tx || tx.id !== id) throw Error("No active mod call");
    if (++tx.operations > 256) {
      tx.failed = true;
      throw Error("Host operation budget exceeded (256)");
    }
    if (tx.declaring !== op.startsWith("define"))
      throw Error(
        tx.declaring
          ? "Only declarations allowed during register"
          : "Definitions only allowed during register",
      );
    if (op.startsWith("define")) {
      const name = named(args[0]),
        spec = object(args[1]);
      const owner = this.definitionOwners.get(name);
      if (owner && owner !== id) throw Error("Definition name already in use");
      if (
        !owner &&
        [...this.definitionOwners.values()].filter((v) => v === id).length >= 32
      )
        throw Error("Definition budget exceeded");
      if (op === "defineEnemy") {
        if (!validateSprite(spec.sprite)) throw Error("Invalid sprite");
        if (
          !["wander", "chase", "orbit", "ranged", "guard"].includes(
            String(spec.behavior),
          )
        )
          throw Error("Invalid behavior");
        const safe: EntityDefinition = {
          sprite: spec.sprite,
          hp: finite(spec.hp, 1, 5000),
          speed: finite(spec.speed, 0, 10),
          damage: finite(spec.damage, 0, 500),
          range: finite(spec.range ?? 20, 1, 500),
          behavior: spec.behavior as EntityDefinition["behavior"],
        };
        this.definitions.set(name, { owner: id, spec: safe });
        this.spritesByName[name] = safe.sprite;
      } else if (op === "defineProjectile") {
        if (!validateSprite(spec.sprite)) throw Error("Invalid sprite");
        this.world.state.projectiles[name] = {
          speed: finite(spec.speed, 1, 20),
          damage: finite(spec.damage, 0, 500),
          lifetime: Math.floor(finite(spec.lifetime, 1, 300)),
        };
        this.spritesByName[name] = spec.sprite;
      } else if (op === "defineHeroWeapon") {
        const projectile =
          spec.projectile === undefined ? undefined : named(spec.projectile);
        if (
          projectile &&
          (!this.world.state.projectiles[projectile] ||
            this.definitionOwners.get(projectile) !== id)
        )
          throw Error("Declare your projectile before its weapon");
        this.world.state.weapons[name] = {
          modOwner: id,
          damage: finite(spec.damage, 0, 500),
          range: finite(spec.range, 1, 500),
          cooldown: Math.floor(finite(spec.cooldown, 1, 300)),
          ...(projectile ? { projectile } : {}),
        };
      } else throw Error("Unknown definition");
      this.definitionOwners.set(name, id);
      return null;
    }
    if (op === "random") {
      let x = tx.rng;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      tx.rng = x >>> 0;
      return tx.rng / 0x100000000;
    }
    if (op === "rules.get" || op === "rules.set") {
      const key = text(args[0], 40) as RuleKey;
      if (!Object.hasOwn(RULE_BOUNDS, key)) throw Error("Unknown rule");
      if (op === "rules.get") return this.world.state.rules[key];
      const bounds = RULE_BOUNDS[key],
        value = finite(args[1], bounds.min, bounds.max);
      this.append(() => {
        this.world.state.rules[key] = value;
      });
      return value;
    }
    if (op === "schedule") {
      const name = named(args[0]),
        delay = finite(args[1], 1, 108000);
      if (
        !Number.isInteger(delay) ||
        !this.mods.get(id)?.declarations.schedules.includes(name)
      )
        throw Error("Unknown schedule or invalid delay");
      const record = this.world.state.mods[id]!;
      if (record.schedules.length + ++tx.schedules > 32) {
        tx.failed = true;
        throw Error("Schedule budget exceeded (32)");
      }
      const payload = args[2] ?? null;
      if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 4096)
        throw Error("Schedule payload exceeds 4096 bytes");
      const item = { name, dueTick: this.world.state.tick + delay, payload };
      this.append(() => record.schedules.push(item));
      return null;
    }
    if (op === "spawn") {
      const name = named(args[0]),
        definition = this.definitions.get(name);
      if (!definition || definition.owner !== id)
        throw Error("Unknown enemy kind");
      let count = tx.spawned.size;
      for (const entity of this.world.state.entities)
        if (entity.tags.includes(`mod:${id}`)) count++;
      if (
        count >= 100 ||
        this.world.state.entities.length + tx.spawned.size >= 1000
      )
        throw Error("Entity budget exceeded");
      const options: SpawnOptions = {
        kind: name,
        team: "enemy",
        x: finite(args[1], -200, 1400),
        y: finite(args[2], -200, 875),
        ...definition.spec,
      };
      const entity = {
        id: tx.nextId++,
        kind: name,
        team: "enemy",
        x: options.x,
        y: options.y,
        hp: options.hp!,
        maxHp: options.hp!,
        tags: [`mod:${id}`],
      } as Entity;
      tx.spawned.set(entity.id, entity);
      this.append(() => {
        const spawned = this.world.spawn(options);
        spawned.tags.push(`mod:${id}`);
      });
      return view(entity);
    }
    if (op === "query") {
      const q = object(args[0]);
      if (
        Object.keys(q).some(
          (key) => !["team", "kind", "tag", "limit"].includes(key),
        )
      )
        throw Error("Invalid query field");
      for (const [key, value] of Object.entries(q))
        if (key !== "limit") text(value, 40);
      const limit = Math.floor(finite(q.limit ?? 300, 1, 300));
      const result = [];
      for (const e of this.world.state.entities) {
        if (
          e.hp > 0 &&
          (!q.team || e.team === q.team) &&
          (!q.kind || e.kind === q.kind) &&
          (!q.tag || e.tags.includes(String(q.tag)))
        )
          result.push(view(e));
        if (result.length === limit) break;
      }
      return result;
    }
    if (op.startsWith("entity.")) {
      const entityId = finite(args[0], 1, Number.MAX_SAFE_INTEGER),
        entity = this.world.byId.get(entityId) ?? tx.spawned.get(entityId);
      if (!entity) throw Error("Unknown entity");
      if (op === "entity.equip") {
        const name = named(args[1]);
        if (
          entity.team !== "hero" ||
          !this.world.state.weapons[name] ||
          this.definitionOwners.get(name) !== id
        )
          throw Error("Unknown hero weapon");
        this.append(() => {
          this.world.byId.get(entityId)!.weapon = name;
        });
      } else if (op === "entity.tag") {
        const tag = named(args[1]);
        this.append(() => {
          const e = this.world.byId.get(entityId)!;
          if (!e.tags.includes(tag) && e.tags.length < 16) e.tags.push(tag);
        });
      } else {
        const amount = finite(args[1], 0, op === "entity.setSpeed" ? 10 : 500);
        if (!["entity.damage", "entity.heal", "entity.setSpeed"].includes(op))
          throw Error("Unknown entity operation");
        this.append(() => {
          const e = this.world.byId.get(entityId)!;
          if (op === "entity.damage") this.world.damage(e, amount);
          if (op === "entity.heal") e.hp = Math.min(e.maxHp, e.hp + amount);
          if (op === "entity.setSpeed") e.speed = amount;
        });
      }
      return null;
    }
    const fx: { type: string; [key: string]: string | number | boolean } = {
      type: op.slice(3),
      modId: id,
    };
    const color = (value: unknown) => {
      const c = text(value, 7);
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw Error("Invalid color");
      return c;
    };
    switch (op) {
      case "log": {
        const message = text(args[0], 200);
        this.append(() =>
          this.world.state.events.push({ type: "mod_log", modId: id, message }),
        );
        return null;
      }
      case "fx.banner":
        fx.text = text(args[0], 120);
        break;
      case "fx.telegraph":
        fx.x = finite(args[0], -200, 1400);
        fx.y = finite(args[1], -200, 875);
        fx.radius = finite(args[2], 1, 150);
        fx.ticks = finite(args[3], 1, 300);
        break;
      case "fx.impact":
        fx.x = finite(args[0], -200, 1400);
        fx.y = finite(args[1], -200, 875);
        fx.ticks = 90;
        break;
      case "fx.shake":
        fx.intensity = finite(args[0], 0, 20);
        fx.ticks = finite(args[1], 0, 300);
        break;
      case "fx.particles":
        fx.x = finite(args[0], -200, 1400);
        fx.y = finite(args[1], -200, 875);
        fx.color = color(args[2]);
        fx.count = finite(args[3], 0, 100);
        break;
      case "fx.tint":
        fx.color = color(args[0]);
        fx.ticks = finite(args[1], 0, 1800);
        break;
      case "fx.weather":
        fx.weather = text(args[0], 20);
        if (!["rain", "snow", "ash", "meteor", "aurora"].includes(fx.weather))
          throw Error("Invalid weather");
        fx.ticks = finite(args[1], 0, 1800);
        break;
      default:
        throw Error(`Unknown host operation: ${op}`);
    }
    this.append(() => this.world.state.fx.push(fx));
    return null;
  };
  private removeDefinitions(id: string): void {
    for (const [name, owner] of this.definitionOwners)
      if (owner === id) {
        this.definitionOwners.delete(name);
        this.definitions.delete(name);
        delete this.spritesByName[name];
        delete this.world.state.weapons[name];
        delete this.world.state.projectiles[name];
      }
  }
  async load(id: string, source: string): Promise<void> {
    if (
      !identifier.test(id) ||
      source.length > 100000 ||
      (!this.mods.has(id) && this.mods.size >= 16)
    )
      throw Error("Invalid mod or mod budget exceeded");
    const before = this.checkpoint();
    let runtime: ModRuntime | undefined;
    try {
      this.removeDefinitions(id);
      this.begin(id, true);
      runtime = await ModRuntime.load(id, source, this.operation, {
        budgetMs: 10,
      });
      this.commit();
      this.mods.get(id)?.dispose();
      this.mods.set(id, runtime);
      const record: ModRecord = {
        source,
        declarationTick: this.world.state.tick,
        state: {},
        timers: runtime.declarations.intervals.map((interval) => ({
          interval,
          next: this.world.state.tick + interval,
        })),
        schedules: [],
        cooldowns: {},
      };
      this.world.state.mods[id] = record;
      this.world.state.modSetVersion++;
      this.deployments.push({ id, source, before });
      if (this.deployments.length > 32) this.deployments.shift();
      this.lastGood = this.checkpoint();
    } catch (error) {
      runtime?.dispose();
      this.tx = undefined;
      this.restore(before);
      throw error;
    }
  }
  /** Re-register the exact source set, then restore JSON state and host-owned timer phases. */
  restore(snapshot: WorldState): void {
    for (const runtime of this.mods.values()) runtime.dispose();
    this.mods.clear();
    this.definitions.clear();
    this.definitionOwners.clear();
    this.spritesByName = {};
    this.world.restore(snapshot);
    this.cpu.clear();
    this.epoch++;
    for (const [id, record] of Object.entries(this.world.state.mods)) {
      this.begin(id, true);
      const runtime = ModRuntime.loadSync(id, record.source, this.operation, {
        budgetMs: 10,
      });
      this.commit();
      runtime.restore(record.state);
      this.mods.set(id, runtime);
    }
    // Declaration code is pure, and derived definitions must not perturb snapshot order/data.
    this.world.restore(snapshot);
  }
  unload(id: string): void {
    if (!this.mods.has(id)) return;
    this.lastGood = this.checkpoint();
    this.mods.get(id)!.dispose();
    this.mods.delete(id);
    delete this.world.state.mods[id];
    this.removeDefinitions(id);
    this.world.state.entities = this.world.state.entities.filter(
      (e) => !e.tags.includes(`mod:${id}`),
    );
    this.world.reindex();
    this.world.state.modSetVersion++;
  }
  private fail(id: string, error: unknown): void {
    this.tx = undefined;
    const failedSource = this.world.state.mods[id]?.source;
    let index = this.deployments.length - 1;
    while (index >= 0) {
      const deployment = this.deployments[index]!;
      if (deployment.id === id && deployment.source === failedSource) break;
      index--;
    }
    const target =
      index >= 0 ? this.deployments[index]!.before : this.safeBaseline;
    this.restore(target);
    this.deployments = index >= 0 ? this.deployments.slice(0, index) : [];
    this.lastGood = target;
    const details =
      error instanceof ModExecutionError ? error.details : undefined;
    this.diagnostics.push({
      modId: id,
      message: (error instanceof Error ? error.message : String(error)).slice(
        0,
        500,
      ),
      ...(details?.stack ? { stack: details.stack.slice(0, 2000) } : {}),
      rollbackVersion: this.world.state.modSetVersion,
    });
    if (this.diagnostics.length > 32) this.diagnostics.shift();
    this.notices.push(this.diagnostics.at(-1)!);
    if (this.notices.length > 32) this.notices.shift();
  }
  private call(
    id: string,
    kind: "event" | "timer" | "schedule" | "command",
    name: string | number,
    payload: unknown,
  ): boolean {
    const runtime = this.mods.get(id);
    if (!runtime) return false;
    const budget = (process.env.CI ? 60 : 20) - (this.cpu.get(id) ?? 0);
    const start = threadCpuMs();
    this.begin(id);
    try {
      if (budget <= 0) throw Error("Per-tick CPU budget exceeded");
      const state = runtime.invoke(kind, name, payload, budget);
      if (threadCpuMs() - start > budget)
        throw Error("Per-tick CPU budget exceeded");
      this.commit();
      this.world.state.mods[id]!.state = state;
      this.cpu.set(id, (this.cpu.get(id) ?? 0) + threadCpuMs() - start);
      return true;
    } catch (error) {
      this.fail(id, error);
      return false;
    }
  }
  dispatch(event: Record<string, unknown>): void {
    for (const [id, runtime] of this.mods)
      if (
        runtime.declarations.events.includes(String(event.type)) &&
        !this.call(id, "event", String(event.type), event)
      )
        break;
  }
  tick(): void {
    this.cpu.clear();
    this.world.tick();
    const epoch = this.epoch;
    const events = this.world.drainEvents();
    this.dispatch({ type: "tick", tick: this.world.state.tick });
    if (epoch !== this.epoch) return;
    for (const [id, record] of Object.entries(this.world.state.mods)) {
      for (let index = 0; index < record.timers.length; index++) {
        const timer = record.timers[index]!;
        if (timer.next <= this.world.state.tick) {
          if (!this.call(id, "timer", index, null)) return;
          timer.next += timer.interval;
        }
      }
      const due = record.schedules.filter(
        (item) => item.dueTick <= this.world.state.tick,
      );
      for (const item of due) {
        // Remove only after a successful callback; the pending queue is checkpointed.
        if (!this.call(id, "schedule", item.name, item.payload)) return;
        record.schedules.splice(record.schedules.indexOf(item), 1);
      }
    }
    for (const event of events) {
      this.dispatch(event);
      if (epoch !== this.epoch) return;
    }
    if (this.world.state.tick % 300 === 0) this.lastGood = this.checkpoint();
  }
  command(name: string, viewer: string, args: string): void {
    for (const [id, runtime] of this.mods) {
      const cooldown = runtime.declarations.commands[name],
        record = this.world.state.mods[id]!;
      if (
        cooldown === undefined ||
        this.world.state.tick < (record.cooldowns[name] ?? -1)
      )
        continue;
      if (
        !this.call(id, "command", name, {
          viewer: viewer.slice(0, 40),
          args: args.slice(0, 200),
        })
      )
        break;
      record.cooldowns[name] = this.world.state.tick + cooldown;
    }
  }
  dispose(): void {
    for (const runtime of this.mods.values()) runtime.dispose();
    this.mods.clear();
  }
}
