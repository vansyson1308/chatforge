export function register(api) {
  const bolt = {
    grid: [
      "......kkkk..",
      ".....kyywk..",
      "....kyywk...",
      "...kyywk....",
      "..kyywkkkk..",
      "..kyyyyyyk..",
      "...kkkyyk...",
      ".....kyk....",
      "....kyk.....",
      "...kyk......",
      "..kck.......",
      "..kk........",
    ],
    palette: { k: "#35435c", y: "#ffdf58", w: "#fffad8", c: "#69dcff" },
  };
  const launcher = {
    grid: [
      "............",
      "...yyyy.....",
      "..ycccy.....",
      ".kkkkkkkkkk.",
      ".kccwwccyyk.",
      ".kccwwccyykk",
      ".kccycccywww",
      ".kkkkkkkkkkk",
      "....kcck....",
      "....kcck....",
      "....kkkk....",
      "............",
    ],
    palette: { k: "#35435c", y: "#ffdf58", w: "#fffad8", c: "#69dcff" },
  };
  api.defineProjectile("boltaction-yellow-shot", {
    sprite: bolt, speed: 7, damage: 8, lifetime: 45,
  });
  api.defineHeroWeapon("boltaction-launcher", {
    damage: 8, range: 220, cooldown: 45, projectile: "boltaction-yellow-shot",
  });
  api.defineHat("boltaction-launcher-badge", launcher);
  api.defineProp("boltaction-bolt-sign", { sprite: bolt, scale: 3 });
  api.defineProp("boltaction-launcher-stand", { sprite: launcher, scale: 2 });

  function equipOne() {
    if (!api.state.pending) return;
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("boltaction-launcher");
      api.equipHat(hero.id, "boltaction-launcher-badge");
      api.fx.lightning(hero.x, hero.y - 180, hero.x, hero.y);
      api.fx.beam(hero.x, hero.y - 110, hero.x - 65, hero.y - 45, "#ffdf58", 30);
      api.fx.beam(hero.x, hero.y - 110, hero.x + 65, hero.y - 45, "#ffdf58", 30);
      api.fx.particles(hero.x, hero.y, "#ffdf58", 24);
      api.fx.text(hero.x, hero.y - 75, "BOLT LAUNCHER: CHARGED!");
      api.state.pending = false;
    }
  }

  function begin() {
    if (api.state.active || api.state.pending) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("BOLT ACTION | @M\\u01b0aNh\\u1ecf (SIM) + @TinyTroll (SIM) + @AnvilAda (SIM)");
    api.fx.telegraph(480, 530, 110, 60);
    api.fx.ring(480, 530, 125, "#ffdf58", 60);
    api.fx.text(600, 365, "FORKED BOLT INCOMING! !boltaction");
    api.fx.lightning(600, 100, 600, 320);
    api.fx.beam(600, 230, 540, 300, "#ffdf58", 60);
    api.fx.beam(600, 230, 660, 300, "#ffdf58", 60);
    if (api.query({ kind: "boltaction-bolt-sign", limit: 1 }).length === 0) {
      api.spawn("boltaction-bolt-sign", 600, 125);
    }
    if (api.query({ kind: "boltaction-launcher-stand", limit: 1 }).length === 0) {
      api.spawn("boltaction-launcher-stand", 240, 430);
    }
    api.sfx("thunder");
    api.schedule("boltaction-equip", 60, null);
    api.schedule("boltaction-aftermath", 150, null);
  }
  api.onSchedule("boltaction-equip", () => {
    api.state.pending = true;
    equipOne();
    api.fx.banner("Circuit crew: @SparkSage (SIM) + @CloudCrafter (SIM)");
    if (api.state.pending) api.fx.text(600, 410, "Charge reserved for the next hero to join.");
    api.fx.flash("#fffad8", 8);
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#69dcff", 90);
      api.fx.particles(x, 470, "#ffdf58", 12);
    }
    api.sfx("anvil");
  });
  api.onSchedule("boltaction-aftermath", () => {
    api.fx.impact(480, 530);
    api.fx.ring(480, 530, 150, "#ffdf58", 90);
    api.fx.particles(480, 500, "#69dcff", 35);
    api.fx.banner("Final spark! The launcher keeps its charge.");
    api.state.active = false;
  });
  api.on("hero_join", equipOne);
  api.registerCommand("!boltaction", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
    equipOne();
  });
}

export const forgeTest = {
  commands: ["!boltaction"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["boltaction-bolt-sign", "boltaction-launcher-stand"],
    fx: ["banner", "telegraph", "ring", "lightning", "beam", "particles", "impact"],
    minEffects: 15,
  },
};
