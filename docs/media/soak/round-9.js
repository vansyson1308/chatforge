export function register(api) {
  api.defineEnemy("bootcamp-captain", {
    sprite: {
      grid: [
        ".....rrr........",
        "....rryr........",
        ".....ry.........",
        "...kkkkkk.......",
        "...kyyyyk.......",
        "...bbbbbb.......",
        "...bwbbwb.......",
        "...bkbbkb.......",
        "...bbbbbb.......",
        "...byyyyb.......",
        "...bbyybb.......",
        "...bbbbbbbbbbb..",
        "...bbbbbbbbbbbk.",
        "...bbbbbbbbbbbk.",
        "...kkkkkkkkkkkk.",
        "................",
      ],
      palette: {
        r: "#ef6661", y: "#ffd36a", k: "#283040",
        b: "#ac744e", w: "#fff0d2",
      },
    },
    hp: 65, speed: 0.8, damage: 3, range: 22,
    behavior: "chase", scale: 2,
  });
  api.defineEnemy("bootcamp-recruit", {
    sprite: {
      grid: [
        "............",
        "..bbbbbb....",
        "..byyyyb....",
        "..bwbbwb....",
        "..bkbbkb....",
        "..bbbbbb....",
        "..bbyybb....",
        "..bbbbbb....",
        "..bbbbbbbbb.",
        "..bbbbbbbbb.",
        "..kkkkkkkkk.",
        "............",
      ],
      palette: {
        b: "#b98a60", y: "#ffd36a", k: "#283040", w: "#fff0d2",
      },
    },
    hp: 24, speed: 0.8, damage: 1, range: 18,
    behavior: "chase", scale: 1.2,
  });

  function hasSurvivors() {
    return api.query({ kind: "bootcamp-captain", tag: "bootcamp-parade", limit: 1 }).length > 0
      || api.query({ kind: "bootcamp-recruit", tag: "bootcamp-parade", limit: 1 }).length > 0;
  }
  function begin() {
    if (api.state.active || hasSurvivors()) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("BOOT CAMP | @DuckKnight (SIM) + @QuietQuokka (SIM) + @PixelBao (SIM)");
    api.fx.text(850, 410, "LEFT! RIGHT! TINY BOOTS INBOUND! !bootparade");
    api.fx.telegraph(850, 535, 130, 60);
    api.fx.ring(850, 535, 140, "#ffd36a", 60);
    api.sfx("anvil");
    api.schedule("bootcamp-arrival", 60, null);
  }

  api.onSchedule("bootcamp-arrival", () => {
    if (!hasSurvivors()) {
      const captain = api.spawn("bootcamp-captain", 810, 525);
      if (captain) {
        captain.tag("bootcamp-parade");
        api.fx.trail(captain.id, "#ffd36a", 120);
      }
      for (const y of [485, 570]) {
        const recruit = api.spawn("bootcamp-recruit", 900, y);
        if (recruit) recruit.tag("bootcamp-parade");
      }
    }
    api.fx.banner("March makers: @ChaosBean (SIM) + @EmberEli (SIM)");
    api.fx.flash("#fff0d2", 8);
    api.fx.particles(850, 520, "#ffd36a", 35);
    api.fx.text(850, 405, "CAPTAIN SOLE AND THE PINT-SIZE PLATOON!");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 550, 60, "#ef6661", 90);
      api.fx.particles(x, 470, "#ffd36a", 12);
    }
    api.schedule("bootcamp-cheer", 120, null);
  });
  api.onSchedule("bootcamp-cheer", () => {
    api.fx.banner("Parade cheers: @MossMoth (SIM) + @LunaLurk (SIM)");
    api.fx.text(600, 410, "THREE CHEERS FOR TINY BOOTS!");
    api.fx.ring(850, 535, 150, "#ffd36a", 90);
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 420, "#ef6661", 15);
      api.fx.particles(x, 520, "#ffd36a", 15);
    }
    api.sfx("cheer");
    api.state.active = false;
  });

  api.registerCommand("!bootparade", begin, { cooldownSec: 30 });
  api.on("wave_start", (event) => {
    if (event.wave > 0 && event.wave % 10 === 0) begin();
  });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!bootparade"],
  events: ["wave_start"],
  expect: {
    spawnKinds: ["bootcamp-captain", "bootcamp-recruit"],
    fx: ["banner", "telegraph", "ring", "particles", "flash"],
    minEffects: 20,
  },
};
