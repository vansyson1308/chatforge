export function register(api) {
  api.defineEnemy("meltdown-ice-boss", {
    sprite: {
      grid: [
        "...wwwwwwwww....",
        "..wcccccccccb...",
        ".wccwwccccccbb..",
        ".wcwccccccccbb..",
        ".wccccccccccbb..",
        ".wcckkcckkccbb..",
        ".wcckwcckwccbb..",
        ".wccccbcccccbb..",
        ".wcccbcbccccbb..",
        ".wccccbbccccbb..",
        ".wcckkkkkkccbb..",
        ".wccccccccccbb..",
        "..bbbbbbbbbbb...",
        "...bb.....bb....",
        "..bbb.....bbb...",
        "................",
      ],
      palette: {
        w: "#efffff", c: "#78d9f5", b: "#3186d1", k: "#18334f",
      },
    },
    hp: 90, speed: 0.75, damage: 4, range: 24,
    behavior: "chase", scale: 2.5,
  });
  api.defineEnemy("meltdown-bite-cube", {
    sprite: {
      grid: [
        "............",
        "..wwwwwww...",
        ".wcccccccb..",
        ".wcwccccbb..",
        ".wccccccbb..",
        ".wckcckcbb..",
        ".wccccccbb..",
        ".wcckkccbb..",
        "..bbbbbbb...",
        "...b...b....",
        "..bb...bb...",
        "............",
      ],
      palette: {
        w: "#efffff", c: "#78d9f5", b: "#3186d1", k: "#18334f",
      },
    },
    hp: 18, speed: 1, damage: 1, range: 16,
    behavior: "chase", scale: 1,
  });

  function begin(delay) {
    if (api.state.active) return;
    if (api.query({ kind: "meltdown-ice-boss", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("ICE CUBE MELTDOWN | @GearGnome (SIM) | !icecube");
    api.fx.telegraph(820, 530, 115, delay);
    api.fx.ring(820, 530, 130, "#3186d1", delay);
    api.fx.text(820, 410, "WARNING: EXTREMELY CHUNKY ICE");
    api.sfx("magic");
    api.schedule("meltdown-arrival", delay, null);
  }

  api.onSchedule("meltdown-arrival", () => {
    if (api.query({ kind: "meltdown-ice-boss", limit: 1 }).length === 0) {
      const boss = api.spawn("meltdown-ice-boss", 820, 530);
      if (boss) {
        boss.tag("meltdown-boss");
        api.state.bossId = boss.id;
      }
    }
    api.fx.impact(820, 530);
    api.fx.flash("#c9f6ff", 10);
    api.fx.ring(820, 530, 145, "#78d9f5", 120);
    api.fx.banner("THE BIG CHILL! Defeat the boss to crack its cubes.");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 490, "#c9f6ff", 16);
    }
    api.sfx("anvil");
    api.schedule("meltdown-thaw", 120, null);
  });
  api.onSchedule("meltdown-thaw", () => {
    api.fx.text(600, 420, "The frost lifts. Watch for bite-size trouble!");
    api.state.active = false;
  });

  api.on("enemy_killed", (event) => {
    if (event.kind !== "meltdown-ice-boss") return;
    if (event.entityId !== api.state.bossId) return;
    api.state.bossId = 0;
    const cubes = api.query({ kind: "meltdown-bite-cube", limit: 6 });
    let room = 6 - cubes.length;
    for (const offset of [-22, 0, 22]) {
      if (room > 0) {
        const cube = api.spawn("meltdown-bite-cube", event.x + offset, event.y);
        if (cube) {
          cube.tag("meltdown-cube");
          room -= 1;
        }
      }
    }
    api.fx.particles(event.x, event.y, "#78d9f5", 40);
    api.fx.ring(event.x, event.y, 100, "#efffff", 60);
    api.fx.banner("CRACK! Bite-size cubes, full-size attitude.");
    api.sfx("magic");
  });

  api.registerCommand("!icecube", () => begin(90), { cooldownSec: 15 });
  api.on("tick", () => {
    if (!api.state.introduced) begin(89);
  });
  api.every(30, () => {
    if (!api.state.introduced) begin(90);
  });
}

export const forgeTest = {
  commands: ["!icecube"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["meltdown-ice-boss"],
    fx: ["banner", "telegraph", "ring", "impact", "flash", "particles"],
    minEffects: 10,
  },
};
