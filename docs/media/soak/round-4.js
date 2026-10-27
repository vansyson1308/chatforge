export function register(api) {
  api.defineEnemy("shell-special-turtle", {
    sprite: {
      grid: [
        "................",
        ".....bbbbbb.....",
        "....byyyyyyb....",
        "...bybbbbbbyb...",
        "..bybyyyyybyyb..",
        "..bybybbbybyyb..",
        "..bybybybybyyb..",
        "..bybyyybbyyyb..",
        "..bybbbbbyyyyb..",
        "ggbbyyyyyyyybb..",
        "gwgbbbbbbbbbbgg.",
        "gkggggggggggggg.",
        ".ggggggggggggg..",
        "...ggg....ggg...",
        "...gg.....gg....",
        "................",
      ],
      palette: {
        b: "#815232", y: "#ffd569", g: "#74ae68",
        w: "#fff4ce", k: "#202c34",
      },
    },
    team: "enemy",
    hp: 160,
    speed: 0.45,
    damage: 3,
    range: 22,
    behavior: "chase",
    scale: 2.5,
  });

  function begin(delay) {
    if (api.state.active) return;
    if (api.query({ kind: "shell-special-turtle", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("SHELL SHOCK SPECIAL | @CloudCrafter (SIM) + @FrogForge (SIM)");
    api.fx.telegraph(880, 535, 110, delay);
    api.fx.ring(880, 535, 120, "#ffd569", delay);
    api.fx.text(880, 410, "RUMBLE... A GOLDEN SPIRAL APPROACHES! !shell");
    // A short spiral of light previews the shell inside the warning ring.
    api.fx.beam(850, 515, 905, 515, "#ffd569", delay);
    api.fx.beam(905, 515, 905, 550, "#ffd569", delay);
    api.fx.beam(905, 550, 870, 550, "#ffd569", delay);
    api.fx.beam(870, 550, 870, 530, "#ffd569", delay);
    api.fx.beam(870, 530, 890, 530, "#ffd569", delay);
    api.fx.shake(2, 20);
    api.sfx("thunder");
    api.schedule("shell-arrival", delay, null);
  }

  api.onSchedule("shell-arrival", () => {
    if (api.query({ kind: "shell-special-turtle", limit: 1 }).length === 0) {
      const turtle = api.spawn("shell-special-turtle", 880, 535);
      if (turtle) {
        turtle.tag("shell-special-performer");
        api.state.turtleId = turtle.id;
        api.fx.trail(turtle.id, "#ffd569", 90);
      }
    }
    api.fx.banner("SLOW MARCH, SOLID SHELL! The spiral has arrived.");
    api.fx.flash("#fff4ce", 8);
    api.fx.particles(880, 535, "#ffd569", 35);
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 555, 60, "#ffd569", 90);
      api.fx.particles(x, 535, "#815232", 10);
    }
    api.schedule("shell-aftermath", 90, null);
  });

  api.onSchedule("shell-aftermath", () => {
    let x = 880;
    let y = 535;
    for (const turtle of api.query({
      kind: "shell-special-turtle", tag: "shell-special-performer", limit: 1,
    })) {
      if (turtle.id === api.state.turtleId) {
        x = turtle.x;
        y = turtle.y;
      }
    }
    api.fx.impact(x, y);
    api.fx.ring(x, y, 150, "#ffd569", 75);
    api.fx.text(x, y - 85, "The dust settles. The turtle marches on.");
    api.state.active = false;
  });

  api.registerCommand("!shell", () => begin(60), { cooldownSec: 15 });
  api.on("tick", () => {
    if (!api.state.introduced) begin(59);
  });
  api.every(30, () => {
    if (!api.state.introduced) begin(30);
  });
}

export const forgeTest = {
  commands: ["!shell"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["shell-special-turtle"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "impact"],
    minEffects: 15,
  },
};
