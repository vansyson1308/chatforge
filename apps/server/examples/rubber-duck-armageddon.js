export function register(api) {
  const duck = {
    grid: [
      "............",
      ".....yyyy...",
      "....ywwyyy..",
      "....ywkyyy..",
      "....yyyyoooo",
      "..y..yyyy...",
      ".yyy.yyyyy..",
      ".yyyyyyyyyy.",
      "..yyyyyyyyy.",
      "...yyyyyyy..",
      "....oooo....",
      "............",
    ],
    palette: { y: "#ffd347", w: "#fff4d1", k: "#1c2634", o: "#ff843d" },
  };
  api.defineEnemy("armageddon-duck", {
    sprite: duck,
    team: "hero",
    hp: 90,
    speed: 1.5,
    damage: 8,
    behavior: "guard",
    scale: 2,
  });
  function begin() {
    if (api.state.active) return;
    api.state.active = true;
    api.fx.sky("storm", 9);
    api.fx.banner("RUBBER DUCK ARMAGEDDON — forged by the community");
    api.fx.text(600, 445, "QUACK WARNING");
    api.fx.ring(600, 510, 140, "#ffd347", 90);
    api.sfx("thunder");
    api.schedule("duck-impact", 90, null);
  }
  api.onSchedule("duck-impact", () => {
    for (let n = 0; n < 4; n++) {
      const x = 400 + n * 130;
      api.spawn("armageddon-duck", x, 520);
      api.fx.lightning(x, 50, x, 520);
      api.fx.particles(x, 520, "#ffd347", 32);
    }
    api.fx.flash("#fff4d1", 8);
    api.fx.shake(5, 20);
    api.fx.banner("THE QUACKEN HAS LANDED! Try !quack");
    api.sfx("anvil");
    api.schedule("duck-aftermath", 150, null);
  });
  api.onSchedule("duck-aftermath", () => {
    api.fx.sky("sunset", 5);
    api.fx.text(600, 445, "The keep has new defenders.");
    api.state.active = false;
  });
  api.registerCommand("!quack", begin, { cooldownSec: 20 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      begin();
    }
  });
}
export const forgeTest = {
  commands: ["!quack"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["armageddon-duck"],
    fx: ["ring", "lightning", "particles", "banner"],
    minEffects: 8,
  },
};
