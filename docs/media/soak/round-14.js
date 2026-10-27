export function register(api) {
  const slice = {
    grid: [
      "............",
      ".cccccccccc.",
      "..cyyyyyyc..",
      "..cyrryyyc..",
      "...yrryyy...",
      "...yyyyry...",
      "....yyrr....",
      "....yyyy....",
      ".....ry.....",
      ".....yy.....",
      ".....y......",
      "............",
    ],
    palette: { c: "#be733c", y: "#ffdc68", r: "#dc5045", w: "#fff5d5" },
  };
  const launcher = {
    grid: [
      "............",
      "..kkkkkkkk..",
      ".kwwwwwwwwk.",
      ".kwrrrrrrwk.",
      ".kwryyyyrwk.",
      ".kwryrryrwkk",
      ".kwryyyyrwww",
      ".kwrrrrrrwkk",
      ".kwwwwwwwwk.",
      "..kkkkkkkk..",
      "....kk......",
      "....kk......",
    ],
    palette: { k: "#42394a", w: "#fff5d5", r: "#dc5045", y: "#ffdc68" },
  };
  api.defineProjectile("pizza-action-slice", {
    sprite: slice, speed: 6, damage: 8, lifetime: 50,
  });
  api.defineHeroWeapon("pizza-action-launcher", {
    damage: 8, range: 220, cooldown: 45, projectile: "pizza-action-slice",
  });
  api.defineHat("pizza-action-box", launcher);
  api.defineProp("pizza-action-sign", { sprite: slice, scale: 3 });
  api.defineProp("pizza-action-stand", { sprite: launcher, scale: 2 });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("PIZZA THE ACTION | @CloudCrafter (SIM) + @SparkSage (SIM) + @GearGnome (SIM)");
    api.fx.telegraph(480, 530, 110, 45);
    api.fx.ring(480, 530, 125, "#ffdc68", 45);
    api.fx.text(600, 350, "HOT DELIVERY! TWO LAUNCHERS. !pizzatime");
    if (api.query({ kind: "pizza-action-sign", limit: 1 }).length === 0) {
      api.spawn("pizza-action-sign", 600, 125);
    }
    if (api.query({ kind: "pizza-action-stand", limit: 1 }).length === 0) {
      api.spawn("pizza-action-stand", 240, 430);
    }
    api.fx.ring(600, 125, 60, "#dc5045", 45);
    api.fx.beam(555, 100, 645, 150, "#ffdc68", 45);
    api.sfx("magic");
    api.schedule("pizza-action-delivery", 45, null);
    api.schedule("pizza-action-close", 150, null);
  }

  api.onSchedule("pizza-action-delivery", () => {
    let equipped = 0;
    for (const hero of api.query({ team: "hero", limit: 2 })) {
      hero.equip("pizza-action-launcher");
      api.equipHat(hero.id, "pizza-action-box");
      api.fx.beam(240, 430, hero.x, hero.y, "#ffdc68", 45);
      api.fx.particles(hero.x, hero.y, "#dc5045", 16);
      api.fx.text(hero.x, hero.y - 65, "PIZZA LAUNCHER READY!");
      equipped += 1;
    }
    api.state.lastEquipped = equipped;
    api.fx.banner(equipped > 0
      ? "DELIVERED! Pixel pizzas are on the menu."
      : "No heroes at delivery time. The pizza stand awaits !pizzatime.");
    api.fx.flash("#fff5d5", 8);
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 430, "#ffdc68", 14);
      api.fx.ring(x, 545, 60, "#dc5045", 90);
    }
  });
  api.onSchedule("pizza-action-close", () => {
    api.fx.impact(480, 530);
    api.fx.ring(480, 530, 150, "#ffdc68", 90);
    api.fx.particles(480, 500, "#dc5045", 30);
    api.fx.banner("Delivery complete. Keep the launchers; share the slices!");
    api.sfx("cheer");
    api.state.active = false;
  });

  api.registerCommand("!pizzatime", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!pizzatime"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["pizza-action-sign", "pizza-action-stand"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "impact"],
    minEffects: 15,
  },
};
