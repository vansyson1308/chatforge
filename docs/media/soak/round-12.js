export function register(api) {
  api.defineEnemy("disco-stache-slime", {
    sprite: {
      grid: [
        "................",
        ".....pppppp.....",
        "....pwwppppp....",
        "...pwwppppppp...",
        "..pppppppppppp..",
        "..ppwppppwpppp..",
        "..ppkppppkpppp..",
        "..pppppppppppp..",
        ".kpppkkkkppppk..",
        ".kkkkkkkkkkkkk..",
        "..kkkk..kkkkpp..",
        ".pppppppppppppp.",
        ".ppcppccppccppp.",
        "..pppppppppppp..",
        "...pppppppppp...",
        "................",
      ],
      palette: {
        p: "#ba71ed", w: "#fff3db", k: "#202030", c: "#69e4d8",
      },
    },
    team: "enemy",
    hp: 60,
    speed: 1,
    damage: 2,
    range: 20,
    behavior: "chase",
    scale: 2,
  });

  function begin() {
    if (api.state.active) return;
    if (api.query({ kind: "disco-stache-slime", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.slimeId = 0;
    api.fx.banner("DISCO 'STACHE BASH | @CozySlime (SIM) + @AnvilAda (SIM) + @ChaosBean (SIM) + @MossMoth (SIM)");
    api.fx.telegraph(850, 530, 100, 60);
    api.fx.ring(850, 530, 115, "#ef75bd", 60);
    api.fx.ring(850, 530, 130, "#69e4d8", 60);
    api.fx.ring(850, 530, 145, "#ffd574", 60);
    api.fx.text(850, 415, "MUSTACHE ON. DANCE FLOOR READY. !stache");
    api.sfx("magic");
    api.schedule("stache-entrance", 60, null);
    // First warning at tick 30, entrance at 90, final bow at 300.
    api.schedule("stache-final-bow", 270, null);
  }

  api.onSchedule("stache-entrance", () => {
    if (api.query({ kind: "disco-stache-slime", limit: 1 }).length === 0) {
      const slime = api.spawn("disco-stache-slime", 850, 530);
      if (slime) {
        slime.tag("stache-performer");
        api.state.slimeId = slime.id;
        api.fx.trail(slime.id, "#ef75bd", 180);
      }
    }
    api.fx.banner("THE 'STACHE HAS LANDED. One slime, outrageous facial hair!");
    api.fx.flash("#ef75bd", 8);
    api.fx.particles(850, 500, "#ffd574", 35);
    api.sfx("cheer");
    api.schedule("stache-disco-beat", 60, { remaining: 2 });
  });
  api.onSchedule("stache-disco-beat", (payload) => {
    if (!api.state.active) return;
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 65, "#69e4d8", 60);
      api.fx.particles(x, 450, "#ef75bd", 12);
      api.fx.beam(x, 200, x + 50, 520, "#ba71ed", 45);
    }
    if (payload.remaining > 1) {
      api.schedule("stache-disco-beat", 60, { remaining: payload.remaining - 1 });
    }
  });

  api.onSchedule("stache-final-bow", () => {
    let x = 850;
    let y = 530;
    for (const slime of api.query({
      kind: "disco-stache-slime", tag: "stache-performer", limit: 1,
    })) {
      if (slime.id === api.state.slimeId) {
        x = slime.x;
        y = slime.y;
        slime.damage(500);
      }
    }
    api.fx.flash("#ffd574", 10);
    api.fx.impact(x, y);
    api.fx.ring(x, y, 150, "#ef75bd", 90);
    api.fx.particles(x, y, "#69e4d8", 40);
    api.fx.banner("FINAL BOW! The disco fades; the mustache is legendary.");
    api.sfx("cheer");
    api.state.slimeId = 0;
    api.state.active = false;
  });

  api.registerCommand("!stache", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!stache"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["disco-stache-slime"],
    fx: ["banner", "telegraph", "ring", "particles", "flash", "impact", "beam"],
    minEffects: 20,
  },
};

