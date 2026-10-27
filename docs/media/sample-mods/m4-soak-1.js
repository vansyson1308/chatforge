export function register(api) {
  api.defineProp("thunder-lizard-forge", {
    scale: 3,
    sprite: {
      grid: [
        ".g........g.....",
        ".gg......gg.....",
        ".ggg.gg.ggg.....",
        "..gggggggg......",
        "...gwggwg.......",
        "...gkggkg.......",
        ".gggggggggg.....",
        "gg..goog..gg....",
        "....goog....g...",
        "...ggoog...gg...",
        "..gggggggggg....",
        "..kkkookkk......",
        "..kkooookk......",
        "..kkowwokk......",
        ".kkkkkkkkkk.....",
        "kkkkkkkkkkkk....",
      ],
      palette: {
        g: "#76dcab", w: "#f5ffe8", k: "#203044", o: "#ffbd60",
      },
    },
  });
  api.defineProjectile("lizard-lightning-bolt", {
    sprite: {
      grid: [
        "......ww....",
        ".....wcw....",
        ".....cw.....",
        "....wcw.....",
        "....cw......",
        "...wccccww..",
        "..wwcccww...",
        ".....cw.....",
        "....wcw.....",
        "....cw......",
        "...wcw......",
        "...ww.......",
      ],
      palette: { w: "#f5ffe8", c: "#75dfff" },
    },
    speed: 10,
    damage: 12,
    lifetime: 45,
  });
  api.defineHeroWeapon("thunder-lizard-gear", {
    damage: 12,
    range: 260,
    cooldown: 36,
    projectile: "lizard-lightning-bolt",
  });

  function ignite() {
    if (api.state.cooling) return;
    api.state.cooling = true;
    // A single permanent prop keeps repeat activations within entity budgets.
    if (!api.state.forgePlaced) {
      const forge = api.spawn("thunder-lizard-forge", 600, 505);
      if (forge) api.state.forgePlaced = true;
    }
    api.fx.banner("Thunder Lizard Armory | TinyTroll + M\u01b0aNh\u1ecf (SIM)");
    api.fx.text(600, 400, "!dragon charges the forge - stand clear!");
    api.fx.telegraph(600, 505, 85, 60);
    api.fx.ring(600, 505, 105, "#75dfff", 60);
    api.fx.lightning(600, 180, 600, 440);
    api.sfx("magic");
    api.schedule("lizard-arm", 60, null);
    api.schedule("lizard-ready", 900, null);
  }

  api.onSchedule("lizard-arm", () => {
    let equipped = 0;
    for (const hero of api.query({ team: "hero", limit: 2 })) {
      hero.equip("thunder-lizard-gear");
      api.fx.lightning(600, 440, hero.x, hero.y);
      api.fx.trail(hero.id, "#75dfff", 90);
      equipped += 1;
    }
    api.fx.lightning(600, 100, 600, 505);
    api.fx.flash("#caffff", 8);
    api.fx.particles(600, 480, "#ffbd60", 28);
    api.fx.ring(600, 505, 130, "#76dcab", 60);
    api.fx.banner(equipped > 0
      ? "Dragon gear armed! Lightning bolts ready."
      : "Forge charged! No heroes yet - try !dragon again in 30s.");
    api.sfx("anvil");
    api.schedule("lizard-afterglow", 60, null);
  });
  api.onSchedule("lizard-afterglow", () => {
    api.fx.lightning(560, 440, 640, 505);
    api.fx.ring(600, 505, 155, "#75dfff", 60);
    api.fx.particles(600, 505, "#76dcab", 18);
    api.fx.text(600, 410, "The forge cools. Chat keeps the spark.");
  });
  api.onSchedule("lizard-ready", () => {
    api.state.cooling = false;
  });
  api.registerCommand("!dragon", ignite, { cooldownSec: 30 });
  api.on("twitch:raid", ignite);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      ignite();
    }
  });
}

export const forgeTest = {
  commands: ["!dragon"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["thunder-lizard-forge"],
    fx: ["banner", "telegraph", "lightning", "ring", "particles"],
    minEffects: 12,
  },
};
