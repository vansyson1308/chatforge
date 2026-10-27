export function register(api) {
  api.defineEnemy("forecast-rubber-duck", {
    sprite: {
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
      palette: { y: "#ffd347", w: "#fff4d1", k: "#26354a", o: "#ff843d" },
    },
    team: "enemy",
    hp: 28,
    speed: 0.9,
    damage: 2,
    range: 18,
    behavior: "chase",
    scale: 1.7,
  });

  function begin() {
    if (api.state.active || api.state.cooling) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.cooling = true;
    api.fx.banner("DUCK FORECAST | @CrownCat (SIM) + @\\u6a58\\u5b50\\u9a91\\u58eb (SIM)");
    api.fx.weather("rain", 90);
    api.fx.telegraph(850, 530, 120, 90);
    api.fx.ring(850, 530, 135, "#65baff", 90);
    api.fx.text(850, 415, "100% CHANCE OF QUACKS! !duckstorm");
    api.sfx("magic");
    api.schedule("forecast-duck-step", 30, { x: 805 });
    api.schedule("forecast-duck-step", 60, { x: 850 });
    api.schedule("forecast-duck-step", 90, { x: 895 });
    // Scheduled after the last step so the splash follows its spawn commit.
    api.schedule("forecast-splash", 90, null);
    api.schedule("forecast-ready", 900, null);
  }

  api.onSchedule("forecast-duck-step", (payload) => {
    const living = api.query({ kind: "forecast-rubber-duck", limit: 3 });
    if (living.length < 3) {
      const duck = api.spawn("forecast-rubber-duck", payload.x, 530);
      if (duck) {
        duck.tag("forecast-duck");
        api.fx.trail(duck.id, "#ffd347", 90);
      }
    }
    api.fx.ring(payload.x, 530, 55, "#ffd347", 45);
    api.fx.particles(payload.x, 520, "#65baff", 18);
    api.fx.text(payload.x, 450, "QUACK!");
    api.sfx("cheer");
  });
  api.onSchedule("forecast-splash", () => {
    api.fx.weather("rain", 0);
    api.fx.impact(850, 530);
    api.fx.ring(850, 530, 150, "#65baff", 90);
    api.fx.banner("SPLASH! Rain cleared. Rubber ducks remain on patrol.");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 490, "#65baff", 16);
      api.fx.ring(x, 550, 65, "#ffd347", 60);
    }
    api.state.active = false;
  });
  api.onSchedule("forecast-ready", () => {
    api.state.cooling = false;
  });

  api.registerCommand("!duckstorm", begin, { cooldownSec: 30 });
  api.on("twitch:cheer", begin);
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!duckstorm"],
  events: ["twitch:cheer"],
  expect: {
    spawnKinds: ["forecast-rubber-duck"],
    fx: ["banner", "weather", "telegraph", "ring", "particles", "impact"],
    minEffects: 20,
  },
};
