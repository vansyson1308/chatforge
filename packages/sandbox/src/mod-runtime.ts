import { ModIsolate } from "./isolate.js";
export type ModHost = (
  modId: string,
  operation: string,
  args: unknown[],
) => unknown;
export interface Declarations {
  events: string[];
  intervals: number[];
  schedules: string[];
  commands: Record<string, number>;
}
const bootstrap = `
(() => {
  const bridge = globalThis.__forgeBridge;
  delete globalThis.__forgeBridge;
  const stringify = JSON.stringify, parse = JSON.parse;
  const descriptors = Object.getOwnPropertyDescriptors, keys = Reflect.ownKeys, isArray = Array.isArray, proto = Object.getPrototypeOf;
  const objectProto = Object.prototype, arrayProto = Array.prototype;
  function jsonState(value) {
    let nodes = 0;
    const seen = new Set();
    function check(item,depth) {
      if (++nodes > 4096 || depth > 32) throw Error('JSON state complexity exceeded');
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number' && Number.isFinite(item)) return;
      if (typeof item !== 'object' || seen.has(item)) throw Error('State must contain only finite, acyclic JSON values');
      const p = proto(item);
      if (p !== objectProto && p !== arrayProto && p !== null) throw Error('State must contain plain JSON objects');
      seen.add(item);
      const ds = descriptors(item);
      for (const key of keys(ds)) {
        if (typeof key !== 'string' || key === '__proto__' || key === 'constructor' || key === 'prototype') throw Error('Unsafe JSON key');
        if (isArray(item) && key === 'length') continue;
        const d = ds[key];
        if (!('value' in d)) throw Error('State accessors are forbidden');
        check(d.value,depth+1);
      }
      seen.delete(item);
    }
    check(value,0);return stringify(value);
  }
  const handlers = Object.create(null), commands = Object.create(null), schedules = Object.create(null), timers = [];
  let declaring = true, state = {};
  const events = new Set(['tick','wave_start','wave_end','hero_join','enemy_killed','keep_damaged','twitch:sub','twitch:cheer','twitch:raid','twitch:follow']);
  function declaration() { if (!declaring) throw Error('Declaration only: register(api)'); }
  function host(operation, ...args) {
    if (declaring && !operation.startsWith('define')) throw Error('Mutation or read during register: ' + operation);
    const reply = parse(bridge(stringify({operation,args})));
    if (!reply.ok) throw Error(reply.error);
    return reply.result;
  }
  function handle(value) {
    if (value === null) return null;
    const id = value.id;
    return Object.freeze(Object.assign(value, {
      damage: amount => host('entity.damage',id,amount), heal: amount => host('entity.heal',id,amount),
      setSpeed: speed => host('entity.setSpeed',id,speed), tag: name => host('entity.tag',id,name),
      equip: name => host('entity.equip',id,name),
    }));
  }
  const api = Object.freeze({
    defineHat: (name,sprite) => { declaration(); return host('defineHat',name,{sprite}); },
    defineProp: (name,spec) => { declaration(); return host('defineProp',name,spec); },
    equipHat: (id,name) => host('entity.equipHat',id,name),
    sfx: cue => host('sfx',cue),
    defineEnemy: (name,spec) => { declaration(); return host('defineEnemy',name,spec); },
    defineHeroWeapon: (name,spec) => { declaration(); return host('defineHeroWeapon',name,spec); },
    defineProjectile: (name,spec) => { declaration(); return host('defineProjectile',name,spec); },
    spawn: (kind,x,y) => handle(host('spawn',kind,x,y)),
    query: filter => host('query',filter).map(handle),
    on: (event,fn) => {
      declaration(); if (!events.has(event) || typeof fn !== 'function') throw Error('Invalid handler');
      (handlers[event] ||= []).push(fn); if (handlers[event].length > 32) throw Error('Handler budget exceeded');
    },
    registerCommand: (name,fn,options) => {
      declaration(); if (!/^![a-z0-9_]{1,20}$/.test(name) || typeof fn !== 'function' || !options || !Number.isFinite(options.cooldownSec) || options.cooldownSec < 0 || options.cooldownSec > 3600) throw Error('Invalid command');
      if (Object.keys(commands).length >= 16 || commands[name]) throw Error('Command budget exceeded');
      commands[name] = { fn, cooldown: Math.ceil(options.cooldownSec * 30) };
    },
    every: (ticks,fn) => {
      declaration(); if (!Number.isInteger(ticks) || ticks < 1 || ticks > 108000 || typeof fn !== 'function' || timers.length >= 32) throw Error('Invalid timer or timer budget exceeded');
      timers.push({ticks,fn});
    },
    onSchedule: (name,fn) => {
      declaration(); if (!/^[a-z][a-z0-9_-]{0,39}$/.test(name) || typeof fn !== 'function' || schedules[name] || Object.keys(schedules).length >= 32) throw Error('Invalid schedule declaration');
      schedules[name] = fn;
    },
    schedule: (name,delay,payload) => host('schedule',name,delay,parse(jsonState(payload))),
    rules: Object.freeze({get: key => host('rules.get',key), set: (key,value) => host('rules.set',key,value)}),
    fx: Object.freeze(Object.fromEntries(['telegraph','shake','particles','banner','tint','weather','impact','text','ring','beam','lightning','flash','trail','sky'].map(name => [name,(...args) => host('fx.'+name,...args)]))),
    random: () => host('random'),
    get state() { if (declaring) throw Error('api.state is runtime-only; register must be pure'); return state; },
    log: message => host('log',message),
  });
  function run(fn, ...args) {
    const result = fn(...args);
    if (result && typeof result.then === 'function') throw Error('Mod callbacks must be synchronous; async/Promise callbacks are unsupported');
  }
  // Non-writable entry points and captured intrinsics keep guest globals out of host control flow.
  Object.defineProperty(globalThis,'__forgeRuntime',{writable:false,configurable:false,value:Object.freeze({
    register: fn => { if (!declaring || typeof fn !== 'function') throw Error('Expected register(api)'); run(fn,api); declaring = false; },
    describe: () => ({events:Object.keys(handlers),intervals:timers.map(t=>t.ticks),schedules:Object.keys(schedules),commands:Object.fromEntries(Object.entries(commands).map(([name,c])=>[name,c.cooldown]))}),
    restore: json => { state = parse(json); },
    invoke: (kind,name,payload) => {
      if (kind === 'event') for (const fn of handlers[name] || []) run(fn,payload);
      else if (kind === 'timer') run(timers[name].fn);
      else if (kind === 'schedule') run(schedules[name],payload);
      else if (kind === 'command') run(commands[name].fn,payload.viewer,payload.args);
      return jsonState(state);
    },
  })});
  for (const intrinsic of [Object,Array,Number,String,Boolean,JSON,Math,Reflect,Set,Map]) {
    if (intrinsic.prototype) Object.freeze(intrinsic.prototype);
    Object.freeze(intrinsic);
  }
})();
`;

export class ModRuntime {
  readonly declarations: Declarations;
  private constructor(private readonly isolate: ModIsolate) {
    this.declarations = isolate.evaluate(
      "globalThis.__forgeRuntime.describe()",
    ) as Declarations;
  }
  static async load(
    id: string,
    source: string,
    host: ModHost,
    options: { budgetMs?: number; memoryBytes?: number } = {},
  ): Promise<ModRuntime> {
    const isolate = await ModIsolate.create(id, options);
    return this.initialize(isolate, id, source, host);
  }
  static loadSync(
    id: string,
    source: string,
    host: ModHost,
    options: { budgetMs?: number; memoryBytes?: number } = {},
  ): ModRuntime {
    return this.initialize(
      ModIsolate.createSync(id, options),
      id,
      source,
      host,
    );
  }
  private static initialize(
    isolate: ModIsolate,
    id: string,
    source: string,
    host: ModHost,
  ): ModRuntime {
    try {
      isolate.bindJson("__forgeBridge", (request) => {
        if (!request || typeof request !== "object")
          throw Error("Invalid host request");
        const value = request as { operation?: unknown; args?: unknown };
        if (typeof value.operation !== "string" || !Array.isArray(value.args))
          throw Error("Invalid host request");
        return host(id, value.operation, value.args);
      });
      isolate.evaluate(bootstrap, 1000);
      isolate.evaluate(
        `${source}\n;globalThis.__forgeRuntime.register(register);`,
        50,
        true,
      );
      const runtime = new ModRuntime(isolate);
      runtime.restore({});
      return runtime;
    } catch (error) {
      isolate.dispose();
      throw error;
    }
  }
  restore(state: Record<string, unknown>): void {
    this.isolate.evaluate(
      `globalThis.__forgeRuntime.restore(${JSON.stringify(JSON.stringify(state))})`,
    );
  }
  invoke(
    kind: "event" | "timer" | "schedule" | "command",
    name: string | number,
    payload: unknown,
    budgetMs: number,
  ): Record<string, unknown> {
    const json = this.isolate.evaluate(
      `globalThis.__forgeRuntime.invoke(${JSON.stringify(kind)},${JSON.stringify(name)},${JSON.stringify(payload)})`,
      budgetMs,
    );
    if (typeof json !== "string" || Buffer.byteLength(json, "utf8") > 16384)
      throw Error("api.state exceeds 16384 bytes or is not JSON");
    const state: unknown = JSON.parse(json);
    if (!state || typeof state !== "object" || Array.isArray(state))
      throw Error("api.state must be a JSON object");
    return state as Record<string, unknown>;
  }
  dispose(): void {
    this.isolate.dispose();
  }
}
