export function register(api) {
  api.defineEnemy("waddle-warning-penguin", {
    sprite: {
      grid: [
        "....kkkk....",
        "...kbbbbk...",
        "..kbwwwwbk..",
        "..kwkwwkwk..",
        "..kwwowwwk..",
        "..kbwoowbk..",
        ".kkbwwwwbkk.",
        "kkkbwwwwbkkk",
        ".kkbwwwwbkk.",
        "..kbwwwwbk..",
        "...kwwwwk...",
        "...kkkkkk...",
        "..ooo..ooo..",
        "............",
      ],
      palette: {
        k: "#202d43", b: "#426688", w: "#effbff", o: "#ffbb5c",
      },
    },
    team: "enemy",
    hp: 28,
    speed: 0.8,
    damage: 1,
    range: 18,
    behavior: "chase",
    scale: 1.6,
  });

  function begin() {
    if (api.state.active || api.state.cooling) return;
    if ((api.state.spawned || 0) >= 2) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.cooling = true;
    api.fx.banner("WADDLE WARNING | @B\\u00e1nhM\\u00ec (SIM) + @ChaosBean (SIM) + @MossMoth (SIM)");
    api.fx.telegraph(850, 530, 110, 60);
    api.fx.ring(850, 530, 125, "#65baff", 60);
    api.fx.text(850, 415, "TINY PENGUIN. BIG ATTITUDE. !waddle");
    // Three crossed ice beams make the snowflake inside the warning ring.
    api.fx.beam(790, 530, 910, 530, "#d7f4ff", 60);
    api.fx.beam(815, 480, 885, 580, "#d7f4ff", 60);
    api.fx.beam(815, 580, 885, 480, "#d7f4ff", 60);
    api.sfx("magic");
    api.schedule("waddle-arrival", 60, null);
    api.schedule("waddle-farewell", 150, null);
    api.schedule("waddle-ready", 600, null);
  }

  api.onSchedule("waddle-arrival", () => {
    if ((api.state.spawned || 0) < 2) {
      const penguin = api.spawn("waddle-warning-penguin", 850, 530);
      if (penguin) {
        penguin.tag("waddle-visitor");
        api.state.spawned = (api.state.spawned || 0) + 1;
        api.fx.trail(penguin.id, "#65baff", 90);
      }
    }
    api.fx.banner("Frost credits: @CrownCat (SIM) + @DuckKnight (SIM) + @\\u661f\\u306e\\u935b\\u51b6\\u5c4b (SIM)");
    api.fx.flash("#d7f4ff", 8);
    api.fx.particles(850, 510, "#65baff", 30);
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#65baff", 90);
      api.fx.particles(x, 460, "#effbff", 12);
    }
  });
  api.onSchedule("waddle-farewell", () => {
    api.fx.impact(850, 530);
    api.fx.ring(850, 530, 150, "#65baff", 90);
    api.fx.particles(850, 510, "#effbff", 35);
    api.fx.banner("Frosty farewell! The warning fades; the waddle continues.");
    api.state.active = false;
  });
  api.onSchedule("waddle-ready", () => {
    api.state.cooling = false;
  });

  api.registerCommand("!waddle", begin, { cooldownSec: 20 });
  api.on("twitch:sub", begin);
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!waddle"],
  events: ["twitch:sub"],
  expect: {
    spawnKinds: ["waddle-warning-penguin"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "impact"],
    minEffects: 15,
  },
};

