# Mod API (M1 in progress)

Write one ES module with `export function register(api)`. Code runs in its own QuickJS context; it has no Node, network, filesystem or wall clock access. Use `api.random()` for deterministic randomness and `api.state` for JSON data. This contract is still being implemented; `defineHeroWeapon` and `defineProjectile` are not available yet.

`api.on(event, handler)` accepts `tick`, `wave_start`, `wave_end`, `hero_join`, `enemy_killed`, `keep_damaged`, `twitch:sub`, `twitch:cheer`, `twitch:raid`, and `twitch:follow`. Tick events have `tick`; wave events have `wave`; joins and Twitch dev events have `viewer`; enemy kills have `entityId`, `kind`, `x`, `y`. `api.every(ticks, fn)` and `api.after(ticks, fn)` schedule work at 30 ticks per second. `api.registerCommand('!name', fn, {cooldownSec})` passes viewer and arguments.

`api.defineEnemy(name, {sprite, hp, speed, damage, behavior, range})` registers a kind. `api.spawn(kind, x, y)` creates one and `api.query({team, kind, tag})` returns handles with `id`, `kind`, `team`, `x`, `y`, `hp`, `maxHp`, `tags`, plus `damage(n)`, `heal(n)`, `setSpeed(n)` and `tag(name)`. `api.rules.get(key)` and `.set(key, value)` read and clamp a rule. Rule names and bounds are in `packages/engine/src/world.ts`.

`api.fx` offers `banner(text)`, `shake(intensity, ticks)`, `particles(x, y, '#rrggbb', count)`, `telegraph(x, y, radius, ticks)`, `tint('#rrggbb', ticks)`, and `weather(kind, ticks)`, with kind `rain`, `snow`, `ash`, `meteor`, or `aurora`. `api.log(text)` records a diagnostic event.

Limits currently enforced: 4 MiB per isolate, 256 KiB stack, 50 ms per callback, 256 host operations per callback, 32 timers, 16 commands, 32 handlers per event, 32 enemy kinds and 100 living entities per mod, 16 active mods, 120 characters per banner, 100 particles per call and a 24×24 sprite with at most eight `#rrggbb` colors. Use `.` for transparent sprite cells. All host inputs are validated; rule values and effect coordinates are clamped. These limits and rollback behavior are still under M1 validation.

Each example below is a complete independent mod:

```js
export function register(api) {
  api.on("hero_join", (e) => api.fx.banner(`Welcome ${e.viewer}`));
}
```

```js
export function register(api) {
  api.registerCommand(
    "!spark",
    (viewer) => api.fx.banner(`${viewer} sparks the forge`),
    { cooldownSec: 10 },
  );
}
```

```js
export function register(api) {
  api.every(90, () => api.fx.particles(600, 440, "#ff9933", 12));
}
```

```js
export function register(api) {
  api.on("twitch:raid", () => {
    api.fx.weather("aurora", 600);
    api.fx.shake(3, 20);
  });
}
```

```js
export function register(api) {
  api.defineEnemy("ember", {
    sprite: { grid: [".aa.", "aaaa", ".aa."], palette: { a: "#ff8833" } },
    hp: 40,
    speed: 1,
    damage: 5,
    behavior: "chase",
  });
  api.on("wave_start", () => api.spawn("ember", 50, 300));
}
```

```js
export function register(api) {
  api.on("twitch:sub", () => {
    api.fx.telegraph(600, 440, 40, 30);
    api.after(30, () => {
      for (const enemy of api.query({ team: "enemy" }).slice(0, 20))
        enemy.damage(10);
    });
  });
}
```
