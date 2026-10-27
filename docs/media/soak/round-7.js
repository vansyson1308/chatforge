export function register(api) {
  const dragon = {
    grid: [
      ".g........g.",
      ".gg......gg.",
      ".ggg.gg.ggg.",
      "..gggggggg..",
      "...gwggwg...",
      "...gkggkg...",
      ".gggggggggg.",
      "gg..goog..gg",
      "....goog....",
      "...ggoog....",
      "..gg...gg...",
      ".kk.....kk..",
    ],
    palette: { g: "#80dbac", w: "#fff4da", k: "#233249", o: "#ff994f" },
  };
  api.defineEnemy("delivery-pocket-dragon", {
    sprite: dragon,
    team: "hero",
    hp: 110,
    speed: 1.2,
    damage: 6,
    range: 40,
    behavior: "guard",
    scale: 1.8,
  });
  api.defineProjectile("delivery-dragonfire", {
    sprite: dragon,
    speed: 6,
    damage: 7,
    lifetime: 45,
  });
  api.defineHeroWeapon("delivery-dragon-wand", {
    damage: 7,
    range: 190,
    cooldown: 42,
    projectile: "delivery-dragonfire",
  });
  api.defineHat("delivery-dragon-charm", dragon);

  function equipRecipient() {
    if (!api.state.weaponPending) return;
    for (const hero of api.query({ team: "hero", limit: 32 })) {
      if (hero.kind !== "delivery-pocket-dragon") {
        hero.equip("delivery-dragon-wand");
        api.equipHat(hero.id, "delivery-dragon-charm");
        api.fx.beam(700, 320, hero.x, hero.y, "#ff994f", 45);
        api.fx.text(hero.x, hero.y - 65, "DRAGON WAND DELIVERED!");
        api.state.weaponPending = false;
        break;
      }
    }
  }

  function begin() {
    if (api.state.active || api.state.cooling) return;
    if (api.query({ kind: "delivery-pocket-dragon", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.cooling = true;
    api.fx.banner("DRAGON DELIVERY | @TinyTroll (SIM) + @DuckKnight (SIM) + @SparkSage (SIM) + @QuietQuokka (SIM)");
    api.fx.telegraph(760, 525, 110, 60);
    api.fx.ring(760, 525, 125, "#80dbac", 60);
    api.fx.text(760, 410, "HANDLE WITH CARE: POCKET DRAGON! !dragon");
    api.sfx("magic");
    api.schedule("delivery-hatch", 60, null);
    api.schedule("delivery-afterglow", 120, null);
    api.schedule("delivery-ready", 900, null);
  }

  api.onSchedule("delivery-hatch", () => {
    if (api.query({ kind: "delivery-pocket-dragon", limit: 1 }).length === 0) {
      const ally = api.spawn("delivery-pocket-dragon", 760, 525);
      if (ally) {
        ally.tag("delivery-dragon-ally");
        api.fx.trail(ally.id, "#80dbac", 120);
      }
    }
    api.state.weaponPending = true;
    equipRecipient();
    api.fx.banner("HATCHED! One pocket ally and one fiery dragon wand.");
    api.fx.flash("#fff4da", 8);
    api.fx.particles(760, 500, "#ff994f", 35);
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#80dbac", 90);
      api.fx.particles(x, 470, "#ff994f", 12);
    }
  });
  api.onSchedule("delivery-afterglow", () => {
    api.fx.impact(760, 525);
    api.fx.ring(760, 525, 150, "#ff994f", 90);
    api.fx.text(760, 415, "Signed, sealed, dragon delivered.");
    api.state.active = false;
  });
  api.onSchedule("delivery-ready", () => {
    api.state.cooling = false;
  });
  api.on("hero_join", equipRecipient);
  api.registerCommand("!dragon", begin, { cooldownSec: 30 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) begin();
    equipRecipient();
  });
}

export const forgeTest = {
  commands: ["!dragon"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["delivery-pocket-dragon"],
    fx: ["banner", "telegraph", "ring", "particles", "impact", "beam"],
    minEffects: 12,
  },
};
