export function register(api) {
  api.defineEnemy("smug-storm-cloud", {
    sprite: {
      grid: [
        ".....wwwww......",
        "...wwaaaaaww....",
        "..waaaaaaaaaw...",
        ".waaaaaaaaaaaww.",
        "waaaaaaaaaaaaaww",
        "waakkaaakkaaaaw.",
        "waakkaaakkaaaaw.",
        "waaaaaaaaaaaaaw.",
        ".waaakaaaakaaaw.",
        "..waaakkkkaaaw..",
        "...wwaaaaaaww...",
        ".....wwwwww.....",
        "....b...b...b...",
        "...bb..bb..bb...",
        "....b...b...b...",
        "................",
      ],
      palette: {
        w: "#f1f7ff", a: "#92abc9", k: "#263449", b: "#59caff",
      },
    },
    hp: 65,
    speed: 0.5,
    damage: 3,
    range: 24,
    behavior: "wander",
    scale: 3,
  });

  function begin() {
    const now = api.state.now || 0;
    if (api.state.active || (api.state.activations || 0) >= 3) return;
    if (now < (api.state.nextAllowed || 0)) return;
    api.state.activations = (api.state.activations || 0) + 1;
    api.state.nextAllowed = now + 240;
    api.state.active = true;
    api.state.weather = api.state.activations === 2 ? "snow" : "rain";
    api.fx.banner("Forecast: Smug | @ChaosBean (SIM) + @DuckKnight (SIM)");
    api.fx.text(960, 395, "SMUG FRONT INCOMING! !forecast");
    api.fx.telegraph(960, 520, 95, 30);
    api.fx.ring(960, 520, 110, "#59caff", 30);
    api.fx.sky("storm", 7);
    api.sfx("thunder");
    api.schedule("smug-arrival", 30, null);
    api.schedule("smug-next-front", 240, null);
  }

  api.on("tick", (event) => {
    api.state.now = event.tick;
  });
  api.onSchedule("smug-arrival", () => {
    const cloud = api.spawn("smug-storm-cloud", 960, 520);
    if (cloud) api.state.cloudId = cloud.id;
    api.fx.weather(api.state.weather, 150);
    api.fx.flash("#dceeff", 8);
    api.fx.particles(960, 495, "#f1f7ff", 35);
    api.fx.banner(api.state.weather === "snow"
      ? "Smug forecast: SNOW. The cloud thinks it is cool."
      : "Smug forecast: RAIN. The cloud is pleased with itself.");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 530, 65, "#b6e5ff", 90);
      api.fx.particles(x, 460, "#59caff", 12);
    }
    api.schedule("smug-clear", 150, null);
  });
  api.onSchedule("smug-clear", () => {
    api.fx.weather(api.state.weather, 0);
    for (const cloud of api.query({ kind: "smug-storm-cloud", limit: 3 })) {
      if (cloud.id === api.state.cloudId) cloud.damage(500);
    }
    api.fx.sky("sunset", 3);
    api.fx.banner("Forecast cleared. Even smug clouds must move on.");
    api.fx.particles(960, 490, "#ffd888", 20);
    api.state.active = false;
  });
  api.onSchedule("smug-next-front", begin);
  api.registerCommand("!forecast", begin, { cooldownSec: 8 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      begin();
    }
  });
}

export const forgeTest = {
  commands: ["!forecast"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["smug-storm-cloud"],
    fx: ["banner", "telegraph", "ring", "weather", "particles"],
    minEffects: 12,
  },
};

