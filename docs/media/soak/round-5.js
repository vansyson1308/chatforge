export function register(api) {
  api.defineEnemy("beeware-striped-bee", {
    sprite: {
      grid: [
        "................",
        "....ww....ww....",
        "...wccw..wccw...",
        "...wcccwwcccw...",
        "....wwwwwwww....",
        "....yyyykk......",
        "..yyyykkyykk....",
        ".yywyykkyykkk...",
        ".yykyykkyykkk...",
        ".yyyyykkyykkk.k.",
        "..yyyykkyykk....",
        "....yyyykk......",
        ".....k..k.......",
        "....kk..kk......",
        "................",
        "................",
      ],
      palette: {
        y: "#ffd34f", k: "#302736", w: "#fff9dc", c: "#bfefff",
      },
    },
    hp: 22,
    speed: 1.4,
    damage: 2,
    range: 18,
    behavior: "chase",
    scale: 1.8,
  });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("BEEWARE | @ChaosBean (SIM) + @LunaLurk (SIM) + @CloudCrafter (SIM)");
    api.fx.telegraph(860, 520, 120, 45);
    api.fx.ring(860, 520, 135, "#ffd34f", 45);
    api.fx.text(860, 410, "BUZZ BUZZ... !beeware");
    api.sfx("magic");
    api.schedule("beeware-release", 45, null);
    api.schedule("beeware-afterglow", 180, null);
  }

  api.onSchedule("beeware-release", () => {
    // Count committed survivors, then reserve each new slot locally.
    let room = 3 - api.query({ kind: "beeware-striped-bee", limit: 3 }).length;
    for (const offset of [-45, 0, 45]) {
      if (room > 0) {
        const bee = api.spawn("beeware-striped-bee", 860 + offset, 520);
        if (bee) {
          bee.tag("beeware-swarm");
          api.fx.trail(bee.id, "#ffd34f", 120);
          room -= 1;
        }
      }
    }
    api.fx.banner("Buzz credits: @\\u661f\\u306e\\u935b\\u51b6\\u5c4b (SIM) + @TinyTroll (SIM)");
    api.fx.flash("#fff9dc", 8);
    api.fx.particles(860, 500, "#ffd34f", 35);
    api.fx.text(860, 420, "THREE STRIPES OF TROUBLE!");
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 65, "#ffd34f", 90);
      api.fx.particles(x, 465, "#fff9dc", 12);
    }
  });

  api.onSchedule("beeware-afterglow", () => {
    api.fx.impact(860, 520);
    api.fx.ring(860, 520, 150, "#e8aa32", 90);
    api.fx.particles(860, 520, "#ffd34f", 24);
    api.fx.banner("The buzzing fades. Surviving bees still have a sting!");
    api.state.active = false;
  });

  api.registerCommand("!beeware", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!beeware"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["beeware-striped-bee"],
    fx: ["banner", "telegraph", "ring", "particles", "flash", "impact"],
    minEffects: 15,
  },
};

