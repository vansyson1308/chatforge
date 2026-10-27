export function register(api) {
  const launcher = {
    grid: [
      "............",
      "..tttttt....",
      ".twwwwwtt...",
      "ktwwwwwtkkkk",
      "ktwwwwwtwwtk",
      "ktttttttwwtk",
      "koottootkkkk",
      ".kkkkkkkk...",
      "....kok.....",
      "....kok.....",
      "....kkk.....",
      "............",
    ],
    palette: { k: "#413447", t: "#c99564", w: "#fff5e5", o: "#ff9b52" },
  };
  api.defineProp("mallow-toaster-display", { sprite: launcher, scale: 2.5 });
  api.defineHat("mallow-launcher-badge", launcher);
  api.defineProjectile("mallow-fluffy-shot", {
    sprite: {
      grid: [
        "............",
        "...tttttt...",
        "..twwwwwwt..",
        ".twwwwwwwwt.",
        ".twwwwwwwwt.",
        ".twwwwwwwwt.",
        ".twwwppwwwt.",
        ".twwwwwwwwt.",
        ".twwwwwwwwt.",
        "..toowwoot..",
        "...tttttt...",
        "............",
      ],
      palette: { w: "#fff5e5", t: "#c99564", o: "#ff9b52", p: "#f0cbd7" },
    },
    speed: 5,
    damage: 8,
    lifetime: 50,
  });
  api.defineHeroWeapon("mallow-toaster-launcher", {
    damage: 8, range: 210, cooldown: 45, projectile: "mallow-fluffy-shot",
  });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("MALLOW MAYHEM | @QuietQuokka (SIM) + @\\u661f\\u306e\\u935b\\u51b6\\u5c4b (SIM)");
    api.fx.telegraph(480, 530, 110, 30);
    api.fx.ring(480, 530, 125, "#ff9b52", 30);
    api.fx.text(600, 370, "TOASTY DELIVERY! ONE HERO, ONE FLUFFY LAUNCHER. !mallow");
    if (api.query({ kind: "mallow-toaster-display", limit: 1 }).length === 0) {
      api.spawn("mallow-toaster-display", 240, 430);
    }
    api.fx.particles(240, 395, "#fff5e5", 16);
    api.sfx("magic");
    api.schedule("mallow-equip", 30, null);
    api.schedule("mallow-close", 120, null);
  }

  api.onSchedule("mallow-equip", () => {
    let equipped = false;
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("mallow-toaster-launcher");
      api.equipHat(hero.id, "mallow-launcher-badge");
      api.fx.beam(240, 430, hero.x, hero.y, "#ff9b52", 45);
      api.fx.text(hero.x, hero.y - 70, "FLUFFY SHOTS READY!");
      equipped = true;
    }
    api.state.lastEquipped = equipped;
    api.fx.banner("Toast crew: @SparkSage (SIM) + @TinyTroll (SIM)");
    api.fx.text(600, 400, equipped
      ? "Marshmallow launcher equipped. Combat just got toastier!"
      : "No hero available. Keeping this batch safely on display.");
    api.fx.flash("#fff5e5", 8);
    api.sfx("anvil");
    api.schedule("mallow-impact", 1, null);
  });
  api.onSchedule("mallow-impact", () => {
    api.fx.impact(480, 530);
    api.fx.ring(480, 530, 140, "#ff9b52", 90);
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 450, "#fff5e5", 14);
      api.fx.ring(x, 545, 55, "#ff9b52", 90);
    }
  });
  api.onSchedule("mallow-close", () => {
    api.fx.banner("Sweet finish | @M\\u01b0aNh\\u1ecf (SIM) + @NoodleMage (SIM)");
    api.fx.ring(480, 530, 150, "#f0cbd7", 90);
    api.fx.particles(480, 500, "#ff9b52", 24);
    api.fx.text(600, 400, "Batch complete. Keep the launcher; pass the marshmallows!");
    api.sfx("cheer");
    api.state.active = false;
  });

  api.registerCommand("!mallow", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!mallow"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["mallow-toaster-display"],
    fx: ["banner", "telegraph", "ring", "particles", "beam", "flash", "impact"],
    minEffects: 15,
  },
};
