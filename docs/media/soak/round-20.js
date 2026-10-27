export function register(api) {
  const wand = {
    grid: [
      "....tttt....",
      "...twwppt...",
      "..tw....pt..",
      "..tw....pt..",
      "..tt....tt..",
      "...tppppt...",
      "....tttt....",
      ".....kk.....",
      ".....kt.....",
      ".....kt.....",
      ".....kt.....",
      ".....kk.....",
    ],
    palette: { t: "#55d9d0", w: "#f1ffff", p: "#e4b8f5", k: "#375373" },
  };
  api.defineProp("bubble-trouble-wand-display", { sprite: wand, scale: 3 });
  api.defineHat("bubble-trouble-wand-badge", wand);
  api.defineProjectile("bubble-trouble-pearl", {
    sprite: {
      grid: [
        "....tttt....",
        "..ttwwpptt..",
        ".tww....ppt.",
        ".tw......pt.",
        "tw........pt",
        "tw........pt",
        "tt........pt",
        "tt........pt",
        ".tt......pt.",
        ".tpp....ppt.",
        "..ttpppktt..",
        "....tttt....",
      ],
      palette: { t: "#55d9d0", w: "#f1ffff", p: "#e4b8f5", k: "#375373" },
    },
    speed: 4,
    damage: 7,
    lifetime: 60,
  });
  api.defineHeroWeapon("bubble-trouble-wand", {
    damage: 7, range: 220, cooldown: 45, projectile: "bubble-trouble-pearl",
  });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("BUBBLE TROUBLE | @EmberEli (SIM) + @M\\u01b0aNh\\u1ecf (SIM) | !bubble");
    if (api.query({ kind: "bubble-trouble-wand-display", limit: 1 }).length === 0) {
      api.spawn("bubble-trouble-wand-display", 480, 245);
    }
    api.fx.telegraph(480, 530, 110, 60);
    api.fx.ring(480, 530, 125, "#55d9d0", 60);
    api.fx.ring(480, 245, 65, "#e4b8f5", 60);
    api.fx.text(600, 385, "PEARLY WAND DELIVERY: READY TO MAKE TROUBLE?");
    api.sfx("magic");
    api.schedule("bubble-trouble-equip", 60, null);
    api.schedule("bubble-trouble-close", 150, null);
  }

  api.onSchedule("bubble-trouble-equip", () => {
    let equipped = false;
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("bubble-trouble-wand");
      api.equipHat(hero.id, "bubble-trouble-wand-badge");
      api.fx.beam(480, 245, hero.x, hero.y, "#55d9d0", 45);
      api.fx.ring(hero.x, hero.y, 65, "#e4b8f5", 90);
      api.fx.text(hero.x, hero.y - 70, "BUBBLE WAND EQUIPPED!");
      equipped = true;
    }
    api.state.lastEquipped = equipped;
    api.fx.banner(equipped
      ? "Bubbles away! Oversized pearl shots are ready for combat."
      : "No hero available. The wand display still gets its bubble party!");
    api.fx.flash("#f1ffff", 8);
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 480, 45, "#55d9d0", 90);
      api.fx.particles(x, 480, "#e4b8f5", 12);
    }
    api.schedule("bubble-trouble-pops", 60, null);
  });
  api.onSchedule("bubble-trouble-pops", () => {
    api.fx.flash("#e4b8f5", 8);
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 480, 70, "#f1ffff", 30);
      api.fx.particles(x, 480, "#55d9d0", 18);
    }
  });
  api.onSchedule("bubble-trouble-close", () => {
    api.fx.flash("#f1ffff", 10);
    api.fx.impact(480, 530);
    api.fx.ring(480, 530, 150, "#55d9d0", 90);
    api.fx.particles(480, 500, "#e4b8f5", 30);
    api.fx.banner("POP! Delivery complete. The equipped wand stays bubbly.");
    api.state.active = false;
  });

  api.registerCommand("!bubble", begin, { cooldownSec: 20 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!bubble"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["bubble-trouble-wand-display"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "flash", "impact"],
    minEffects: 20,
  },
};

