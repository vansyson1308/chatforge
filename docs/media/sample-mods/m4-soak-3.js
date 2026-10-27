export function register(api) {
  const pizza = {
    grid: [
      "............",
      ".cccccccccc.",
      ".cttttttttc.",
      "..tyyrryyt..",
      "..tyyrryyt..",
      "...tyyyyt...",
      "...tygyyt...",
      "....tyyt....",
      "....trrt....",
      ".....tt.....",
      ".....tt.....",
      "............",
    ],
    palette: {
      c: "#b85d32", t: "#ffbe62", y: "#ffe89b",
      r: "#e34c42", g: "#65b85e",
    },
  };
  api.defineProjectile("flourious-pizza-slice", {
    sprite: pizza,
    speed: 9,
    damage: 12,
    lifetime: 45,
  });
  api.defineHeroWeapon("flourious-pizza-launcher", {
    damage: 12,
    range: 260,
    cooldown: 36,
    projectile: "flourious-pizza-slice",
  });
  // The portal display guarantees visible pixel art even with no heroes.
  api.defineProp("flourious-pizza-display", { sprite: pizza, scale: 3 });

  function begin() {
    if (api.state.cooling) return;
    api.state.cooling = true;
    if (!api.state.displayPlaced) {
      const display = api.spawn("flourious-pizza-display", 600, 455);
      if (display) api.state.displayPlaced = true;
    }
    api.fx.banner("The Fast and the Flourious | CloudCrafter + SparkSage + GearGnome (SIM)");
    api.fx.text(600, 385, "OVEN PORTAL OPENING! Try !pizza");
    api.fx.telegraph(600, 520, 95, 30);
    api.fx.ring(600, 520, 115, "#e34c42", 30);
    api.fx.particles(600, 490, "#ffbe62", 18);
    api.sfx("magic");
    api.schedule("pizza-delivery", 30, null);
    api.schedule("pizza-celebration", 150, null);
    api.schedule("pizza-ready", 300, null);
  }

  api.onSchedule("pizza-delivery", () => {
    let delivered = false;
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("flourious-pizza-launcher");
      api.fx.beam(600, 455, hero.x, hero.y, "#ffe89b", 30);
      api.fx.trail(hero.id, "#ffbe62", 120);
      api.fx.text(hero.x, hero.y - 55, "PIZZA LAUNCHER EQUIPPED!");
      delivered = true;
    }
    api.fx.flash("#ffe89b", 8);
    api.fx.ring(600, 520, 145, "#ffbe62", 120);
    api.fx.particles(600, 455, "#e34c42", 24);
    api.fx.banner(delivered
      ? "Special delivery! Slice through the next wave."
      : "Pizza is ready! No hero available - try !pizza later.");
    api.sfx("anvil");
  });
  api.onSchedule("pizza-celebration", () => {
    api.fx.impact(600, 520);
    api.fx.ring(600, 520, 180, "#ffe89b", 60);
    api.fx.particles(600, 470, "#65b85e", 20);
    api.fx.text(600, 385, "CRUST COMPLETE! Keep the launcher, share the glory.");
    api.sfx("cheer");
  });
  api.onSchedule("pizza-ready", () => {
    api.state.cooling = false;
  });
  api.registerCommand("!pizza", begin, { cooldownSec: 10 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      begin();
    }
  });
}

export const forgeTest = {
  commands: ["!pizza"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["flourious-pizza-display"],
    fx: ["banner", "telegraph", "ring", "particles", "impact"],
    minEffects: 12,
  },
};

