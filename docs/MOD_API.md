# Mod API v1.1 — spectacle contract

This section extends the base authoring contract below. All calls remain bounded transactional QuickJS bindings. New mods should read `rubber-duck-armageddon.js` and `dragon-raid-ally.js` as gold standards.

- `defineEnemy(name, {sprite,hp,speed,damage,range?,behavior,team?,scale?})`: team `enemy` (default), `hero` (ally), or `prop`; scale 0.5–4. Ground units remain in y=455–610. Define unique names per mod.
- `defineProp(name,{sprite,scale?})`: stationary decoration with no combat AI. Spawn with ordinary `spawn`; still counts against the 100-entity mod budget.
- `defineHat(name,sprite)`, then `equipHat(heroId,name)`: decorate a hero with a sprite owned by this mod.
- `fx.text(x,y,text)`: floating text, 80 characters, two seconds.
- `fx.ring(x,y,radius,color,ticks)`: radius 1–250, duration 1–180 ticks.
- `fx.beam(x1,y1,x2,y2,color,ticks)`: 1–90 ticks; `fx.lightning(x1,y1,x2,y2)` lasts 18 ticks.
- `fx.flash(color,ticks)`: low-opacity flash, 1–30 ticks. `fx.trail(entityId,color,ticks)`: 1–180 ticks.
- `fx.sky(theme,seconds)`: blood-moon, sunset, aurora or storm; 1–30 seconds.
- `sfx(cueId)`: anvil, thunder, magic or cheer. Overlay synth is muted by default; A or Sound button enables it.

Colors are six-digit hex. Co-ordinates remain x=-200..1400 and y=-200..875; visible stage is x=0..1200, ground y=455..610. Props may occupy the sky. Queries return read-only handles; mutate only via documented methods. New FX names are accepted in `forgeTest.expect.fx`.

Every generated mod must draw a recognisable >=12x12 sprite with >=4 colors, register a chat command, use layered FX, credit card contributors, and automatically introduce itself within 10 seconds. Use `every(30)` with `api.state.introduced` and named schedules to stage telegraph → climax → aftermath. Keep balance fair. Target 60–200 lines, source <=24 KiB. Gate scores immediacy 2 + command 2 + drawn sprite 3 + layered event lasting >=3s 3; threshold >=7 plus sprite, command and >=2 FX types. A sprite merely declared but never drawn does not count.

## Base authoring contract

## M3 admission contract

Generated mods also export literal `forgeTest` data. The source must fit 24 KiB UTF-8 and have only the direct named exports `register` and `forgeTest`. Top-level statements are declarations only. Do not use imports, dynamic computed properties, constructors/prototypes, globals or async; use `for...of` for array access. The three seed examples remain handwritten Mod API examples and are not generated-mod admission fixtures.

```js
export const forgeTest = {
  commands: ["!spark"],
  events: ["twitch:cheer"],
  expect: { fx: ["particles", "banner"], minEffects: 2 },
};
export function register(api) {
  const spark = () => {
    api.fx.particles(600, 200, "#ffd66b", 12);
    api.fx.banner("A spark from chat!");
  };
  api.registerCommand("!spark", spark, { cooldownSec: 1 });
  api.on("twitch:cheer", spark);
}
```

`commands` is optional (up to six command names); `events` optionally lists wave_start, wave_end or twitch:sub/cheer/raid/follow (up to eight). `expect` is required: optional `spawnKinds` (up to eight owned kinds), `fx` (up to eight FX types), `rules` (rule-name/finite-number map) and `minEffects` (1..10000, defaults to 1). The test object must contain literal JSON-like values, not executable expressions. No extra fields are accepted.

Gatekeeper starts from the current live checkpoint and mod set, adds eight scripted viewers, and drives all Twitch/wave events and card/test commands during 900 ticks. It repeats from the same checkpoint and compares hashes. Card commands must actually be registered by the candidate. Expected spawns/FX must belong to the candidate; rule expectations must be candidate writes that change the baseline value. Empty banners, zero-count particles and zero-strength effects do not count. A no-op always fails even without explicit expectations. In the Builder workspace run `node forge-test.mjs mods/<modId>.js`; production reruns independently before deploy.

These assertions prove observable effects and simulation safety, not arbitrary English semantics. Choose expectations that reflect the card's visual promise. State, timer phases and pending schedules must remain deterministic after checkpoint restore; a delayed closure is not persistent state.

Write a single ES module exporting `register(api)`. It runs in a separate QuickJS runtime, never in Node or the browser. No imports, network, filesystem, DOM, process, wall clock, `eval`, dynamic function constructors, async functions, Promises or native timers. Use synchronous callbacks, `api.random()` and simulation ticks (30 ticks = 1 second).

## Declaration and persistence rules â€” read before writing a mod

**`register(api)` is a pure declaration phase.** Only `defineEnemy`, `defineProjectile`, `defineHeroWeapon`, `on`, `every`, `registerCommand` and `onSchedule` are allowed. Do not spawn, read the world, access `api.state`, emit FX or mutate rules during registration. Initialize state lazily inside a runtime callback.

**Closures are ephemeral. Only JSON survives restart or rollback.** Put every persistent counter, flag and value in `api.state`. Functions, accessors, cycles, non-finite numbers and class instances are rejected. Do not save entity handles; save numeric IDs and re-query. State starts as `{}` on a new deployment and is restored after re-registration when resuming a checkpoint.

`every(ticks, fn)` is declaration-only. Its next due tick and original declaration tick survive a checkpoint, so re-registration does not reset its phase. `after(ticks, fn)` has been removed. Use `onSchedule(name, handler)` in register and `schedule(name, delayTicks, jsonPayload)` at runtime. Pending schedules persist their name, due tick and payload. Schedules with the same name are separate entries, delivered in insertion order. A callback must return synchronously.

Each callback invocation (all listeners for one event, one command, one repeating timer, or one named schedule) creates a bounded command buffer. Validated writes apply together only after the callback and state validation succeed. Throwing, timeout, oversized state or a quota failure discards all writes and RNG advancement. Reads return detached views of the **live world before this buffer commits**; they do not see pending writes. A newly spawned handle has a reserved ID and can receive buffered operations, but does not appear in `query` until commit. Handles are snapshots, not live getters: re-query on the next callback.

A failure restores that source version's complete pre-deploy checkpoint (including when a different mod was deployed later) and re-registers that mod set: entities, RNG, rules, sources/version, state, schedules, repeating phases and command cooldowns. Errors are separate diagnostics so they cannot alter the restored state hash. Successful worlds also checkpoint every 300 ticks for persistence and explicit last-good rollback. Unload removes owned definitions/entities and schedules; arbitrary effects on shared rules remain until changed or a whole-world checkpoint is restored. Replacing a mod starts its state/timers afresh; old owned entities remain until death/unload.

## Definitions and entity handles

- `defineEnemy(name, {sprite, hp, speed, damage, behavior, range?})`: `hp` 1â€“5000, speed 0â€“10, damage 0â€“500, range 1â€“500 (default 20). Behaviors: `wander`, `chase`, `orbit`, `ranged` (kite), `guard` (keep patrol).
- `defineProjectile(name, {sprite, speed, damage, lifetime})`: speed 1â€“20 units/tick, damage 0â€“500, lifetime 1â€“300 ticks. Declare it before a weapon referencing it. Projectiles are fired automatically by equipped heroes; `spawn` creates enemy definitions only.
- `defineHeroWeapon(name, {damage, range, cooldown, projectile?})`: damage 0â€“500, range 1â€“500, cooldown 1â€“300 ticks. Omit projectile for melee. Weapon damage overrides the projectile's base damage. All hero damage is multiplied by `heroDamageMultiplier`.
- Sprite: `{grid: ['.aa.', 'aaaa'], palette: {a:'#ff8833'}}`; rectangular 1â€“24 cells on each axis, 1â€“8 single-character palette keys, six-digit hex colors, `.` transparent. Definitions share a global namespace; a mod may only spawn/equip/reference its own definitions.
- `spawn(kind, x, y)` returns an enemy handle. Coordinates clamp to x âˆ’200â€¦1400, y âˆ’200â€¦875.
- `query({team?, kind?, tag?, limit?})` returns up to 300 live handles (optional `limit` clamps to 1â€“300; use it to avoid copying unused entities) in stable entity order. Team is `hero`, `enemy` or `projectile`.
- Handle fields: `id, kind, team, x, y, hp, maxHp, tags`. Methods: `damage(0â€¦500)`, `heal(0â€¦500)`, `setSpeed(0â€¦10)`, `tag(name)`, `equip(weaponName)` (heroes only). Damage emits kill/progression/loot events through the same engine combat path.
- Definition/schedule/tag names: `/^[a-z][a-z0-9_-]{0,39}$/`.

## Events, commands, state and rules

`on(name, fn)` accepts `tick`, `wave_start`, `wave_end`, `hero_join`, `enemy_killed`, `keep_damaged`, `twitch:sub`, `twitch:cheer`, `twitch:raid`, `twitch:follow`. Tick payload has `tick`; waves have `wave`; join has `entityId, viewer`; kills have `entityId, kind, x, y`; keep damage has `amount, hp`; dev Twitch events have `viewer`. Twitch wiring arrives in M2.

`registerCommand('!name', (viewer, args) => {}, {cooldownSec})`: names match `!` plus 1â€“20 lowercase letters/digits/underscore. Cooldown 0â€“3600 seconds is **global per mod command**, persisted in ticks. Viewer/argument strings are capped at 40/200 characters.

`random()` returns seeded `[0,1)`. `log(text)` emits a diagnostic event (200 characters). `state` is a mod-private JSON object, maximum 16 KiB UTF-8, depth 32, 4096 visited values. Store needed data there, not in outer variables.

`rules.get(key)` reads and `rules.set(key, value)` clamps and returns the proposed value:

| Rule                 | Minimum | Maximum | Default |
| -------------------- | ------: | ------: | ------: |
| waveSize             |       1 |     100 |       6 |
| enemySpeedMultiplier |     0.1 |       4 |       1 |
| spawnIntervalTicks   |       1 |     900 |      24 |
| gravity              |       0 |       5 |       0 |
| heroDamageMultiplier |     0.1 |      10 |       1 |
| maxHeroes            |       1 |     300 |      60 |
| heroIdleTicks        |      30 |  324000 |   27000 |

Gravity accelerates projectile vertical velocity by `gravity * 0.01` per tick. Enemy speed multiplier applies when each wave enemy spawns. Shared rule writes are ordered; coordinate temporary buffs with saved state and generation tokens.

## Visual effects

All text is rendered through Canvas `fillText`. Effects are render events, never executable HTML.

- `fx.banner(text)` â‰¤120 characters.
- `fx.telegraph(x,y,radius,ticks)`: radius 1â€“150, duration 1â€“300; pulsing/filling meteor target and incoming fireball.
- `fx.impact(x,y)`: flash and fading crater, 90 ticks.
- `fx.shake(intensity,ticks)`: intensity 0â€“20, duration 0â€“300.
- `fx.particles(x,y,'#rrggbb',count)`: count 0â€“100 (renderer samples up to 40).
- `fx.tint('#rrggbb',ticks)` and `fx.weather(kind,ticks)`: duration 0â€“1800; weather `rain|snow|ash|meteor|aurora`.

## Enforced budgets

4 MiB memory and 256 KiB stack per mod; 50 ms registration; aggregate 20 ms thread CPU execution per mod per simulation tick (60 ms on shared CI runners). Deadlines also bound infinite loops. 16 loaded mods; 32 definitions per mod; 100 owned living entities (including weapon projectiles); 1000 total world entities; 128 buffered writes and 256 host operations per invocation. Catching a buffer/operation quota exception cannot rescue the transaction.

Per mod: 32 repeating timers, 32 named schedule declarations, 32 pending schedules, 16 commands, 32 listeners per event. Delays/intervals are integer 1â€“108000 ticks; schedule payload â‰¤4 KiB UTF-8. Definition/source maximum 100000 characters (file loader additionally caps bytes). The JSON bridge caps each request/response at 65536 characters. Tags cap at 16 per entity. Numeric values must be finite; invalid shapes throw, valid numbers are clamped to the documented bounds.

## Complete examples

Welcome:

```js
export function register(api) {
  api.on("hero_join", (e) => api.fx.banner(`Welcome ${e.viewer}`));
}
```

Command with persisted cooldown:

```js
export function register(api) {
  api.registerCommand(
    "!spark",
    (viewer) => api.fx.banner(`${viewer} sparks the forge`),
    { cooldownSec: 10 },
  );
}
```

Repeating timer with persistent count:

```js
export function register(api) {
  api.every(90, () => {
    api.state.count = (api.state.count || 0) + 1;
    api.fx.particles(600, 440, "#ff9933", 12);
  });
}
```

Named delayed work (replaces closure-based `after`):

```js
export function register(api) {
  api.onSchedule("burst", ({ x, y }) => api.fx.impact(x, y));
  api.on("twitch:sub", () => {
    const x = 400 + api.random() * 400;
    api.fx.telegraph(x, 440, 40, 30);
    api.schedule("burst", 30, { x, y: 440 });
  });
}
```

Custom creature:

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

Hero weapon and custom projectile:

```js
export function register(api) {
  api.defineProjectile("spark-bolt", {
    sprite: { grid: [".a.", "aaa", ".a."], palette: { a: "#ffcf68" } },
    speed: 7,
    damage: 12,
    lifetime: 90,
  });
  api.defineHeroWeapon("spark-staff", {
    damage: 12,
    range: 180,
    cooldown: 30,
    projectile: "spark-bolt",
  });
  api.on("twitch:raid", () => {
    for (const hero of api.query({ team: "hero", limit: 16 }))
      hero.equip("spark-staff");
  });
}
```

Bounded healing and weather:

```js
export function register(api) {
  api.on("twitch:follow", () => {
    for (const hero of api.query({ team: "hero", limit: 16 })) hero.heal(10);
    api.fx.weather("snow", 90);
  });
}
```

See `apps/server/examples/` for tested meteor impacts, third-wave splitting Slime King, and Aurora's 20-second all-hero damage buff. Aurora also grants a persistent staff to the first 16 heroes present; the global buff expires, the granted weapon remains. Keep bursts bounded; do not iterate all 300 heroes with a host mutation for each in one callback.

CPU accounting uses Node 24's [process.threadCpuUsage](https://nodejs.org/docs/latest-v24.x/api/process.html#processthreadcpuusagepreviousvalue), excluding OS descheduling. A secondary wall deadline (at least 250 ms) also bounds each evaluation. Windows CPU timer granularity can overshoot a CPU limit by one OS accounting quantum. Performance gates independently measure real elapsed tick time.

Deployment rollback retains the latest 32 in-memory deployment checkpoints. If no matching history exists (for example, a fresh host restored only from a persistence snapshot), failure restores the host's initial safe baseline, disabling the unknown set. Persisting deployment history across process restarts belongs to M3; JSON world/timer continuation is already supported. Explicit last-good rollback uses the latest periodic checkpoint.
