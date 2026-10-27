import { ModIsolate } from "./isolate.js";

/** A host must validate every operation and enforce entity/FX limits independently. */
export type ModHost = (
  modId: string,
  operation: string,
  args: unknown[],
) => unknown;

const bootstrap = `
(() => {
  const bridge = globalThis.__forgeBridge;
  const handlers = Object.create(null);
  const commands = Object.create(null);
  const timers = [];
  const events = new Set(['tick','wave_start','wave_end','hero_join','enemy_killed','keep_damaged','twitch:sub','twitch:cheer','twitch:raid','twitch:follow']);
  let tick = 0;
  const state = {};
  function host(operation, ...args) {
    const reply = JSON.parse(bridge(JSON.stringify({ operation, args })));
    if (!reply.ok) throw new Error(reply.error);
    return reply.result;
  }
  function handle(value) {
    if (value === null) return null;
    const id = value.id;
    return Object.assign(value, {
      damage: (amount) => host('entity.damage', id, amount),
      heal: (amount) => host('entity.heal', id, amount),
      setSpeed: (speed) => host('entity.setSpeed', id, speed),
      tag: (name) => host('entity.tag', id, name),
    });
  }
  function schedule(interval, handler, repeat) {
    if (!Number.isInteger(interval) || interval < 1 || interval > 108000 || typeof handler !== 'function') throw new Error('Invalid timer');
    if (timers.length >= 32) throw new Error('Timer budget exceeded');
    timers.push({ next: tick + interval, interval, handler, repeat });
  }
  const api = Object.freeze({
    defineEnemy: (name, spec) => host('defineEnemy', name, spec),
    defineHeroWeapon: (name, spec) => host('defineHeroWeapon', name, spec),
    defineProjectile: (name, spec) => host('defineProjectile', name, spec),
    spawn: (kind, x, y) => handle(host('spawn', kind, x, y)),
    query: (filter) => host('query', filter).map(handle),
    on: (event, handler) => {
      if (!events.has(event) || typeof handler !== 'function') throw new Error('Invalid event handler');
      (handlers[event] ||= []).push(handler);
      if (handlers[event].length > 32) throw new Error('Handler budget exceeded');
    },
    registerCommand: (name, handler, options) => {
      if (!/^![a-z0-9_]{1,20}$/.test(name) || typeof handler !== 'function' || !options || !Number.isFinite(options.cooldownSec) || options.cooldownSec < 0 || options.cooldownSec > 3600) throw new Error('Invalid command');
      if (Object.keys(commands).length >= 16 || commands[name]) throw new Error('Command budget exceeded or duplicate');
      commands[name] = { handler, cooldown: Math.ceil(options.cooldownSec * 30), last: -Infinity };
    },
    every: (interval, fn) => schedule(interval, fn, true),
    after: (interval, fn) => schedule(interval, fn, false),
    rules: Object.freeze({ get: (key) => host('rules.get', key), set: (key, value) => host('rules.set', key, value) }),
    fx: Object.freeze({
      telegraph: (...args) => host('fx.telegraph', ...args), shake: (...args) => host('fx.shake', ...args), particles: (...args) => host('fx.particles', ...args),
      banner: (...args) => host('fx.banner', ...args), tint: (...args) => host('fx.tint', ...args), weather: (...args) => host('fx.weather', ...args),
    }),
    random: () => host('random'), state, log: (message) => host('log', message),
  });
  globalThis.__forgeRuntime = {
    register: (fn) => { if (typeof fn !== 'function') throw new Error('Expected export function register(api)'); fn(api); },
    event: (event) => {
      if (event.type === 'tick') {
        tick++;
        for (const timer of [...timers]) if (tick >= timer.next) {
          if (timer.repeat) timer.next += timer.interval;
          else timers.splice(timers.indexOf(timer), 1);
          timer.handler();
        }
      }
      for (const handler of handlers[event.type] || []) handler(event);
    },
    command: (name, viewer, args) => {
      const command = commands[name];
      if (!command || tick - command.last < command.cooldown) return false;
      command.last = tick; command.handler(viewer, args); return true;
    },
    state: () => JSON.stringify(state),
  };
})();
`;

/** Per-mod QuickJS runtime. Every host operation crosses as a bounded JSON message. */
export class ModRuntime {
  private constructor(private readonly isolate: ModIsolate) {}
  static async load(
    id: string,
    source: string,
    host: ModHost,
    options: { budgetMs?: number; memoryBytes?: number } = {},
  ): Promise<ModRuntime> {
    const isolate = await ModIsolate.create(id, options);
    try {
      isolate.bindJson("__forgeBridge", (request) => {
        if (!request || typeof request !== "object")
          throw new Error("Invalid host request");
        const value = request as { operation?: unknown; args?: unknown };
        if (typeof value.operation !== "string" || !Array.isArray(value.args))
          throw new Error("Invalid host request");
        return host(id, value.operation, value.args);
      });
      isolate.evaluate(bootstrap, 1000);
      isolate.evaluate(
        `${source}\n;globalThis.__forgeRuntime.register(register);`,
        undefined,
        true,
      );
      return new ModRuntime(isolate);
    } catch (error) {
      isolate.dispose();
      throw error;
    }
  }
  event(event: Record<string, unknown>): void {
    this.isolate.evaluate(
      `globalThis.__forgeRuntime.event(${JSON.stringify(event)})`,
    );
  }
  command(name: string, viewer: string, args: string): boolean {
    return (
      this.isolate.evaluate(
        `globalThis.__forgeRuntime.command(${JSON.stringify(name)},${JSON.stringify(viewer)},${JSON.stringify(args)})`,
      ) === true
    );
  }
  state(): unknown {
    const json = this.isolate.evaluate("globalThis.__forgeRuntime.state()");
    if (typeof json !== "string" || json.length > 65536)
      throw new Error("Invalid mod state");
    return JSON.parse(json) as unknown;
  }
  dispose(): void {
    this.isolate.dispose();
  }
}
