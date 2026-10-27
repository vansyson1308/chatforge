import {
  World,
  RULE_BOUNDS,
  type Entity,
  type RuleKey,
  type SpawnOptions,
} from "../../../packages/engine/src/index.js";
import {
  validateSprite,
  type EntityDefinition,
} from "../../../packages/mod-api/src/index.js";
import { ModRuntime } from "../../../packages/sandbox/src/index.js";

type Definition = { owner: string; spec: EntityDefinition };
type ModEntry = {
  runtime: ModRuntime;
  source: string;
  previous?: ModEntry;
  previousDefinitions?: Map<string, Definition>;
};
const identifier = /^[a-z][a-z0-9_-]{0,39}$/;
const finite = (value: unknown, min: number, max: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error("Expected a finite number");
  return Math.max(min, Math.min(max, value));
};
const shortString = (value: unknown, max: number): string => {
  if (typeof value !== "string" || value.length > max)
    throw new Error("Invalid text");
  return value;
};
const entityView = ({ id, kind, team, x, y, hp, maxHp, tags }: Entity) => ({
  id,
  kind,
  team,
  x,
  y,
  hp,
  maxHp,
  tags: [...tags],
});

/** Validates every request, including calls that bypass the in-sandbox convenience API. */
export class ModHost {
  private mods = new Map<string, ModEntry>();
  private definitions = new Map<string, Definition>();
  private owners = new Map<number, string>();
  private operations = new Map<string, number>();
  private budgetExceeded = new Set<string>();
  constructor(readonly world: World) {}

  sprites(): Record<string, EntityDefinition["sprite"]> {
    return Object.fromEntries(
      [...this.definitions].map(([name, definition]) => [
        name,
        definition.spec.sprite,
      ]),
    );
  }

  private operation(id: string, op: string, args: unknown[]): unknown {
    const count = (this.operations.get(id) ?? 0) + 1;
    this.operations.set(id, count);
    if (count > 256) {
      this.budgetExceeded.add(id);
      throw new Error("Host operation budget exceeded");
    }
    switch (op) {
      case "random":
        return this.world.random();
      case "log":
        return this.world.state.events.push({
          type: "mod_log",
          modId: id,
          message: shortString(args[0], 200),
        });
      case "rules.get":
      case "rules.set": {
        const key = shortString(args[0], 40);
        if (!Object.hasOwn(RULE_BOUNDS, key)) throw new Error("Unknown rule");
        return op === "rules.get"
          ? this.world.state.rules[key as RuleKey]
          : this.world.setRule(key as RuleKey, finite(args[1], -1e6, 1e6));
      }
      case "defineEnemy": {
        const name = shortString(args[0], 40);
        if (!identifier.test(name)) throw new Error("Invalid definition name");
        const spec = args[1];
        if (!spec || typeof spec !== "object" || Array.isArray(spec))
          throw new Error("Invalid enemy definition");
        const value = spec as Record<string, unknown>;
        if (!validateSprite(value.sprite)) throw new Error("Invalid sprite");
        if (
          !["wander", "chase", "orbit", "ranged", "guard"].includes(
            String(value.behavior),
          )
        )
          throw new Error("Invalid behavior");
        const safe: EntityDefinition = {
          sprite: value.sprite,
          hp: finite(value.hp, 1, 5000),
          speed: finite(value.speed, 0, 10),
          damage: finite(value.damage, 0, 500),
          behavior: value.behavior as EntityDefinition["behavior"],
          ...(value.range === undefined
            ? {}
            : { range: finite(value.range, 1, 500) }),
        };
        const existing = this.definitions.get(name);
        if (existing && existing.owner !== id)
          throw new Error("Definition name already in use");
        if (
          !existing &&
          [...this.definitions.values()].filter((item) => item.owner === id)
            .length >= 32
        )
          throw new Error("Definition budget exceeded");
        this.definitions.set(name, { owner: id, spec: safe });
        return null;
      }
      case "spawn": {
        const name = shortString(args[0], 40);
        const definition = this.definitions.get(name);
        if (!definition || definition.owner !== id)
          throw new Error("Unknown enemy kind");
        if (
          [...this.owners.values()].filter((owner) => owner === id).length >=
          100
        )
          throw new Error("Entity budget exceeded");
        const { hp, speed, damage, behavior, range } = definition.spec;
        const spawn: SpawnOptions = {
          kind: name,
          team: "enemy",
          x: finite(args[1], -200, 1400),
          y: finite(args[2], -200, 875),
          hp,
          speed,
          damage,
          behavior,
          ...(range === undefined ? {} : { range }),
        };
        const entity = this.world.spawn(spawn);
        this.owners.set(entity.id, id);
        return entityView(entity);
      }
      case "query": {
        const filter = args[0];
        if (!filter || typeof filter !== "object" || Array.isArray(filter))
          throw new Error("Invalid query");
        const q = filter as Record<string, unknown>;
        if (
          Object.keys(q).some((key) => !["team", "kind", "tag"].includes(key))
        )
          throw new Error("Invalid query field");
        for (const value of Object.values(q)) shortString(value, 40);
        return this.world.state.entities
          .filter(
            (e) =>
              (!q.team || e.team === q.team) &&
              (!q.kind || e.kind === q.kind) &&
              (!q.tag || e.tags.includes(String(q.tag))),
          )
          .slice(0, 300)
          .map(entityView);
      }
      case "entity.damage":
      case "entity.heal":
      case "entity.setSpeed":
      case "entity.tag": {
        const entity = this.world.state.entities.find(
          (item) => item.id === args[0],
        );
        if (!entity) throw new Error("Unknown entity");
        if (op === "entity.damage")
          this.world.damage(entity, finite(args[1], 0, 500));
        if (op === "entity.heal")
          entity.hp = Math.min(
            entity.maxHp,
            entity.hp + finite(args[1], 0, 500),
          );
        if (op === "entity.setSpeed") entity.speed = finite(args[1], 0, 10);
        if (op === "entity.tag") {
          const tag = shortString(args[1], 40);
          if (!identifier.test(tag)) throw new Error("Invalid tag");
          if (!entity.tags.includes(tag) && entity.tags.length < 16)
            entity.tags.push(tag);
        }
        return null;
      }
      case "fx.banner":
        this.world.state.fx.push({
          type: "banner",
          text: shortString(args[0], 120),
          modId: id,
        });
        return null;
      case "fx.telegraph":
        this.world.state.fx.push({
          type: "telegraph",
          x: finite(args[0], -200, 1400),
          y: finite(args[1], -200, 875),
          radius: finite(args[2], 1, 150),
          ticks: finite(args[3], 1, 300),
          modId: id,
        });
        return null;
      case "fx.shake":
        this.world.state.fx.push({
          type: "shake",
          intensity: finite(args[0], 0, 20),
          ticks: finite(args[1], 0, 300),
          modId: id,
        });
        return null;
      case "fx.particles": {
        const color = shortString(args[2], 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Invalid color");
        this.world.state.fx.push({
          type: "particles",
          x: finite(args[0], -200, 1400),
          y: finite(args[1], -200, 875),
          color,
          count: finite(args[3], 0, 100),
          modId: id,
        });
        return null;
      }
      case "fx.tint": {
        const color = shortString(args[0], 7);
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error("Invalid color");
        this.world.state.fx.push({
          type: "tint",
          color,
          ticks: finite(args[1], 0, 1800),
          modId: id,
        });
        return null;
      }
      case "fx.weather": {
        const weather = shortString(args[0], 20);
        if (!["rain", "snow", "ash", "meteor", "aurora"].includes(weather))
          throw new Error("Invalid weather");
        this.world.state.fx.push({
          type: "weather",
          weather,
          ticks: finite(args[1], 0, 1800),
          modId: id,
        });
        return null;
      }
      default:
        throw new Error(`Unknown host operation: ${op}`);
    }
  }
  async load(id: string, source: string): Promise<void> {
    if (!identifier.test(id) || source.length > 100000)
      throw new Error("Invalid mod id or source size");
    if (!this.mods.has(id) && this.mods.size >= 16)
      throw new Error("Mod budget exceeded");
    const snapshot = this.world.snapshot();
    const definitions = new Map(this.definitions);
    const owners = new Map(this.owners);
    try {
      this.operations.set(id, 0);
      this.budgetExceeded.delete(id);
      for (const [name, definition] of this.definitions)
        if (definition.owner === id) this.definitions.delete(name);
      const runtime = await ModRuntime.load(
        id,
        source,
        (modId, op, args) => this.operation(modId, op, args),
        { budgetMs: 50 },
      );
      if (this.budgetExceeded.has(id)) {
        runtime.dispose();
        throw new Error("Host operation budget exceeded");
      }
      const previous = this.mods.get(id);
      if (previous?.previous) {
        previous.previous.runtime.dispose();
        delete previous.previous;
      }
      this.mods.set(id, {
        runtime,
        source,
        ...(previous ? { previous, previousDefinitions: definitions } : {}),
      });
    } catch (error) {
      this.world.restore(snapshot);
      this.definitions = definitions;
      this.owners = owners;
      throw error;
    }
  }
  unload(id: string): void {
    const entry = this.mods.get(id);
    if (!entry) return;
    entry.runtime.dispose();
    entry.previous?.runtime.dispose();
    this.mods.delete(id);
    for (const [name, definition] of this.definitions)
      if (definition.owner === id) this.definitions.delete(name);
    for (const [entityId, owner] of this.owners)
      if (owner === id) {
        this.world.state.entities = this.world.state.entities.filter(
          (entity) => entity.id !== entityId,
        );
        this.owners.delete(entityId);
      }
  }
  private fail(
    id: string,
    entry: ModEntry,
    error: unknown,
    snapshot: ReturnType<World["snapshot"]>,
    definitions: Map<string, Definition>,
    owners: Map<number, string>,
  ): void {
    this.world.restore(snapshot);
    this.definitions = definitions;
    this.owners = owners;
    entry.runtime.dispose();
    if (entry.previous) {
      for (const [name, definition] of this.definitions)
        if (definition.owner === id) this.definitions.delete(name);
      for (const [name, definition] of entry.previousDefinitions ?? [])
        if (definition.owner === id) this.definitions.set(name, definition);
      this.mods.set(id, entry.previous);
    } else {
      this.mods.delete(id);
      for (const [name, definition] of this.definitions)
        if (definition.owner === id) this.definitions.delete(name);
    }
    this.world.state.fx.push({
      type: "banner",
      text: `Mod ${id} disabled`,
      modId: id,
    });
    this.world.state.events.push({
      type: "mod_error",
      modId: id,
      message:
        error instanceof Error
          ? error.message.slice(0, 200)
          : String(error).slice(0, 200),
    });
  }
  dispatch(event: Record<string, unknown>): void {
    for (const [id, entry] of this.mods) {
      const snapshot = this.world.snapshot();
      const definitions = new Map(this.definitions);
      const owners = new Map(this.owners);
      try {
        this.operations.set(id, 0);
        this.budgetExceeded.delete(id);
        entry.runtime.event(event);
        if (this.budgetExceeded.has(id))
          throw new Error("Host operation budget exceeded");
      } catch (error) {
        this.fail(id, entry, error, snapshot, definitions, owners);
      }
    }
    for (const [entityId] of this.owners)
      if (!this.world.state.entities.some((entity) => entity.id === entityId))
        this.owners.delete(entityId);
  }
  tick(): void {
    this.world.tick();
    const events = this.world.drainEvents();
    this.dispatch({ type: "tick", tick: this.world.state.tick });
    for (const event of events) this.dispatch(event);
  }
  command(name: string, viewer: string, args: string): void {
    for (const [id, entry] of this.mods) {
      const snapshot = this.world.snapshot();
      const definitions = new Map(this.definitions);
      const owners = new Map(this.owners);
      try {
        this.operations.set(id, 0);
        this.budgetExceeded.delete(id);
        entry.runtime.command(name, viewer.slice(0, 40), args.slice(0, 200));
        if (this.budgetExceeded.has(id))
          throw new Error("Host operation budget exceeded");
      } catch (error) {
        this.fail(id, entry, error, snapshot, definitions, owners);
      }
    }
  }
  dispose(): void {
    for (const id of [...this.mods.keys()]) this.unload(id);
  }
}
