export function register(api) {
  api.defineEnemy("mayhem-marshmallow", {
    sprite: {
      grid: [
        "............",
        "...wwwwww...",
        "..wwwwwwww..",
        ".wwwwwwwwww.",
        ".wwkwwwwkww.",
        ".wwkwwwwkww.",
        ".ppwwwwwwpp.",
        ".wwwkkkkwww.",
        ".wwwwppwwww.",
        "..cccccccc..",
        "..cc....cc..",
        ".ttt....ttt.",
      ],
      palette: {
        w: "#fff5e6", c: "#d6c9ef", p: "#ff9ebc",
        k: "#392e4a", t: "#ce925b",
      },
    },
    hp: 30,
    speed: 0.65,
    damage: 3,
    range: 18,
    behavior: "chase",
    scale: 2.5,
  });
  api.defineProjectile("mayhem-fluff-shot", {
    sprite: {
      grid: [
        "..wwww..",
        ".wwwwww.",
        "wwwwwwww",
        "wwwppwww",
        "wwwwwwww",
        "wccccccw",
        ".cccccc.",
        "..cccc..",
      ],
      palette: { w: "#fff5e6", c: "#d6c9ef", p: "#ff9ebc" },
    },
    speed: 8,
    damage: 12,
    lifetime: 45,
  });
  api.defineHeroWeapon("mayhem-mallow-launcher", {
    damage: 12,
    range: 260,
    cooldown: 36,
    projectile: "mayhem-fluff-shot",
  });

  function begin() {
    if (api.state.cooling) return;
    api.state.cooling = true;
    api.fx.banner("Marshmallow Mayhem | QuietQuokka + \u661f\u306e\u935b\u51b6\u5c4b + SparkSage (SIM)");
    api.fx.text(750, 420, "SUGAR AMBUSH! !mallow calls the fluff");
    api.fx.telegraph(750, 520, 120, 60);
    api.fx.ring(750, 520, 135, "#d6c9ef", 60);
    api.fx.particles(750, 480, "#ff9ebc", 16);
    api.sfx("magic");
    api.schedule("mallow-ambush", 60, null);
    api.schedule("mallow-aftermath", 150, null);
    api.schedule("mallow-ready", 900, null);
  }

  api.onSchedule("mallow-ambush", () => {
    // Bound living ambushers even if the arena has no heroes for many rounds.
    const survivors = api.query({ kind: "mayhem-marshmallow", limit: 6 });
    if (survivors.length <= 3) {
      for (const x of [670, 750, 830]) {
        const mallow = api.spawn("mayhem-marshmallow", x, 520);
        if (mallow) api.fx.trail(mallow.id, "#ff9ebc", 90);
        api.fx.particles(x, 520, "#fff5e6", 18);
      }
    }
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("mayhem-mallow-launcher");
      api.fx.beam(750, 440, hero.x, hero.y, "#ff9ebc", 24);
      api.fx.text(hero.x, hero.y - 55, "MARSHMALLOW LAUNCHER!");
    }
    api.fx.flash("#fff5e6", 8);
    api.fx.ring(750, 520, 145, "#ff9ebc", 90);
    api.fx.banner("Three grins, one sweet ambush! Launcher stays equipped.");
    api.sfx("cheer");
  });
  api.onSchedule("mallow-aftermath", () => {
    api.fx.impact(750, 520);
    api.fx.ring(750, 520, 180, "#d6c9ef", 60);
    api.fx.particles(750, 490, "#ff9ebc", 24);
    api.fx.text(750, 420, "Sweet landing! The fluff settles.");
  });
  api.onSchedule("mallow-ready", () => {
    api.state.cooling = false;
  });
  api.registerCommand("!mallow", begin, { cooldownSec: 30 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      begin();
    }
  });
}

export const forgeTest = {
  commands: ["!mallow"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["mayhem-marshmallow"],
    fx: ["banner", "telegraph", "ring", "particles", "impact"],
    minEffects: 12,
  },
};
