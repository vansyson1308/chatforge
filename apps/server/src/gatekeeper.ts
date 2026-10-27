import { parse, type Node } from "acorn";
import {
  World,
  RULE_BOUNDS,
  type WorldState,
  type RuleKey,
} from "../../../packages/engine/src/index.js";
import {
  forgeTestSchema,
  type ForgeTest,
  type GateReport,
} from "../../../packages/shared/src/forge.js";
import { ModHost } from "./mod-host.js";

type Ast = Node & Record<string, unknown>;
const forbidden = new Set([
  "require",
  "eval",
  "Function",
  "AsyncFunction",
  "GeneratorFunction",
  "Promise",
  "WebAssembly",
  "globalThis",
  "global",
  "window",
  "self",
  "process",
  "module",
  "exports",
  "fetch",
  "XMLHttpRequest",
  "Worker",
  "SharedArrayBuffer",
  "Atomics",
  "Reflect",
  "Proxy",
  "constructor",
  "prototype",
  "__proto__",
  "getPrototypeOf",
  "setPrototypeOf",
  "defineProperty",
  "defineProperties",
  "getOwnPropertyDescriptor",
  "getOwnPropertyDescriptors",
  "Date",
]);
function literal(node: Ast): unknown {
  if (
    node.type === "Literal" &&
    (node.value === null ||
      ["string", "number", "boolean"].includes(typeof node.value))
  )
    return node.value;
  if (
    node.type === "UnaryExpression" &&
    node.operator === "-" &&
    (node.argument as Ast).type === "Literal" &&
    typeof (node.argument as Ast).value === "number"
  )
    return -Number((node.argument as Ast).value);
  if (node.type === "ArrayExpression")
    return (node.elements as Ast[]).map(literal);
  if (node.type === "ObjectExpression") {
    const result: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    for (const property of node.properties as Ast[]) {
      if (
        property.type !== "Property" ||
        property.computed ||
        property.method ||
        property.kind !== "init"
      )
        throw Error("forgeTest must be literal data");
      const key = property.key as Ast;
      const name = String(key.name ?? key.value);
      if (forbidden.has(name) || Object.hasOwn(result, name))
        throw Error("Unsafe or duplicate test key");
      result[name] = literal(property.value as Ast);
    }
    return result;
  }
  throw Error("forgeTest must be literal data");
}
export function inspectMod(source: string): ForgeTest {
  if (Buffer.byteLength(source, "utf8") > 24 * 1024)
    throw Error("Source exceeds 24 KiB");
  const ast = parse(source, {
    ecmaVersion: 2022,
    sourceType: "module",
  }) as unknown as Ast;
  let count = 0;
  function walk(node: Ast): void {
    if (++count > 12000) throw Error("AST budget exceeded");
    if (
      [
        "ImportDeclaration",
        "ImportExpression",
        "ExportAllDeclaration",
        "ExportDefaultDeclaration",
        "WithStatement",
        "AwaitExpression",
        "YieldExpression",
        "ThisExpression",
        "MetaProperty",
      ].includes(node.type) ||
      node.async ||
      node.generator
    )
      throw Error(`Forbidden syntax: ${node.type}`);
    if (
      (node.type === "Identifier" && forbidden.has(String(node.name))) ||
      (node.type === "Literal" && forbidden.has(String(node.value)))
    )
      throw Error("Forbidden host/global access");
    if (
      node.type === "MemberExpression" &&
      node.computed &&
      (node.property as Ast).type !== "Literal"
    )
      throw Error("Computed member access requires a literal key");
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === "object" && "type" in child)
            walk(child as Ast);
        }
      } else if (value && typeof value === "object" && "type" in value)
        walk(value as Ast);
    }
  }
  walk(ast);
  let registered = false,
    test: unknown;
  for (const statement of ast.body as Ast[]) {
    if (
      ![
        "ExportNamedDeclaration",
        "FunctionDeclaration",
        "VariableDeclaration",
      ].includes(statement.type)
    )
      throw Error("Top level must contain declarations only");
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.source || !statement.declaration)
      throw Error("Only direct named declarations allowed");
    const declaration = statement.declaration as Ast;
    if (
      declaration.type === "FunctionDeclaration" &&
      (declaration.id as Ast).name === "register"
    )
      registered = true;
    else if (
      declaration.type === "VariableDeclaration" &&
      declaration.kind === "const"
    ) {
      const entries = declaration.declarations as Ast[];
      if (entries.length !== 1 || (entries[0]!.id as Ast).name !== "forgeTest")
        throw Error("Only register and forgeTest may be exported");
      test = literal(entries[0]!.init as Ast);
    } else throw Error("Only register and forgeTest may be exported");
  }
  if (!registered || !test)
    throw Error("Export register(api) and literal forgeTest");
  return forgeTestSchema.parse(test);
}
export interface GateInput {
  modId: string;
  source: string;
  checkpoint: WorldState;
  commands: string[];
}
export async function gatekeeper(input: GateInput): Promise<GateReport> {
  const start = performance.now();
  const report: GateReport = {
    ok: false,
    checks: [],
    hashes: [],
    ticks: 0,
    durationMs: 0,
    effects: 0,
  };
  let phase = "static contract";
  try {
    const test = inspectMod(input.source);
    report.checks.push({
      name: phase,
      ok: true,
      detail: "24 KiB / restricted AST / literal contract",
    });
    for (let run = 0; run < 2; run++) {
      phase = `simulation ${run + 1}`;
      const world = new World(2026),
        host = new ModHost(world);
      const fx = new Set<string>(),
        kinds = new Set<string>(),
        rules = new Map<string, number>();
      let effects = 0;
      try {
        // Initialize QuickJS before synchronous checkpoint re-registration.
        await host.load("gate-init", "export function register(api) {}");
        host.restore(input.checkpoint);
        await host.load(input.modId, input.source);
        for (const command of input.commands)
          if (!host.commands(input.modId).includes(command))
            throw Error(`Card command not registered: ${command}`);
        world.drainFx();
        for (let i = 0; i < 8; i++)
          world.joinViewer(`Gate${i}`, `gate:${i}`, true);
        for (let tick = 0; tick < 900; tick++) {
          host.tick();
          if (tick % 150 === 0) {
            for (const type of new Set([
              "wave_start",
              "wave_end",
              "twitch:sub",
              "twitch:cheer",
              "twitch:raid",
              "twitch:follow",
              ...(test.events ?? []),
            ]))
              host.dispatch({
                type,
                wave: 3 + tick / 150,
                count: 5,
                viewer: "Gate",
                userId: "gate:0",
                source: "simulator",
              });
            for (const command of new Set([
              ...input.commands,
              ...(test.commands ?? []),
            ]))
              host.command(command, "Gate", "");
          }
          if (host.diagnostics.length)
            throw Error(`Runtime rollback: ${host.diagnostics[0]!.message}`);
          if (
            world.state.entities.length > 1000 ||
            !Number.isFinite(world.state.keepHp)
          )
            throw Error("World invariant failed");
          for (const entity of world.state.entities) {
            if (
              ![entity.x, entity.y, entity.hp, entity.maxHp].every(
                Number.isFinite,
              ) ||
              entity.x < -200 ||
              entity.x > 1400 ||
              entity.y < -200 ||
              entity.y > 875
            )
              throw Error("Entity invariant failed");
            if (entity.tags.includes(`mod:${input.modId}`))
              kinds.add(entity.kind);
          }
          for (const effect of world.drainFx())
            if (effect.modId === input.modId) {
              const visible =
                effect.type === "banner"
                  ? String(effect.text ?? "").trim().length > 0
                  : effect.type === "particles"
                    ? Number(effect.count) > 0
                    : effect.type === "shake"
                      ? Number(effect.intensity) > 0 && Number(effect.ticks) > 0
                      : Number(effect.ticks) > 0;
              if (visible) {
                fx.add(effect.type);
                effects++;
              }
            }
          for (const [key, value] of Object.entries(world.state.rules)) {
            const bounds = RULE_BOUNDS[key as RuleKey];
            if (
              !Number.isFinite(value) ||
              value < bounds.min ||
              value > bounds.max
            )
              throw Error("Rule invariant failed");
            if (value !== input.checkpoint.rules[key as RuleKey])
              rules.set(key, value);
          }
        }
        // Rule changes must be attributable to this candidate, not another live mod.
        const ownedRules =
          host.observedRules.get(input.modId) ?? new Map<string, number>();
        for (const kind of test.expect.spawnKinds ?? [])
          if (!kinds.has(kind)) throw Error(`Missing spawn: ${kind}`);
        for (const name of test.expect.fx ?? [])
          if (!fx.has(name)) throw Error(`Missing FX: ${name}`);
        for (const [key, value] of Object.entries(test.expect.rules ?? {}))
          if (rules.get(key) !== value || ownedRules.get(key) !== value)
            throw Error(`Missing changed rule: ${key}`);
        effects +=
          kinds.size +
          [...ownedRules].filter(([key, value]) => rules.get(key) === value)
            .length;
        if (effects < (test.expect.minEffects ?? 1))
          throw Error(
            "No observable candidate effects (or fewer than promised)",
          );
        report.effects = effects;
        report.hashes.push(world.hash());
        report.ticks += 900;
        report.checks.push({
          name: phase,
          ok: true,
          detail: `900 ticks; ${effects} observed effects; bounded world; no rollback`,
        });
      } finally {
        host.dispose();
      }
    }
    phase = "determinism";
    if (report.hashes[0] !== report.hashes[1]) throw Error("Hash mismatch");
    report.checks.push({ name: phase, ok: true, detail: report.hashes[0]! });
    report.ok = true;
  } catch (error) {
    report.checks.push({
      name: phase,
      ok: false,
      detail: (error instanceof Error ? error.message : String(error)).slice(
        0,
        600,
      ),
    });
  }
  report.durationMs = Math.round(performance.now() - start);
  return report;
}
