export function register(api) {
  api.defineEnemy("goldrush-jeweled-beetle", {
    sprite: {
      grid: [
        "...k....k...",
        "....kkkk....",
        "....kwwk....",
        "..kkyyyykk..",
        ".k.yyykyyyk.",
        "..kywykyyyk.",
        "kkkyyykyyykk",
        "..kyycccyyk.",
        "..kyccwccyk.",
        "kkkyycccyykk",
        "..kyyykyyyk.",
        ".k.kyykyyk.k",
        "....kyyyk...",
        "...k.kk.k...",
      ],
      palette: {
        k: "#59402c", y: "#ffc943", w: "#fff5ca", c: "#41d8ca",
      },
    },
    team: "enemy",
    hp: 55,
    speed: 1.1,
    damage: 2,
    range: 18,
    behavior: "chase",
    scale: 1.7,
  });

  function begin() {
    if (api.state.active) return;
    if (api.query({ kind: "goldrush-jeweled-beetle", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.beetleId = 0;
    api.fx.banner("BEETLE GOLD RUSH | @CrownCat (SIM) + @PixelBao (SIM) + @MossMoth (SIM)");
    api.fx.telegraph(850, 525, 100, 60);
    api.fx.ring(850, 525, 120, "#ffc943", 60);
    api.fx.text(850, 415, "GOLD INCOMING! !goldbug");
    api.sfx("magic");
    api.schedule("goldrush-arrival", 60, null);
    api.schedule("goldrush-aftermath", 180, null);
  }

  api.onSchedule("goldrush-arrival", () => {
    if (api.query({ kind: "goldrush-jeweled-beetle", limit: 1 }).length === 0) {
      const beetle = api.spawn("goldrush-jeweled-beetle", 850, 525);
      if (beetle) {
        beetle.tag("goldrush-visitor");
        api.state.beetleId = beetle.id;
        api.fx.trail(beetle.id, "#ffc943", 120);
      }
    }
    api.fx.banner("RAID SPARKS! A tiny treasure with six busy legs.");
    api.fx.flash("#fff5ca", 8);
    api.fx.ring(850, 525, 135, "#41d8ca", 90);
    api.sfx("cheer");
    sparks();
    api.schedule("goldrush-sparks", 30, null);
  });

  function sparks() {
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 260, "#ffc943", 16);
      api.fx.beam(x, 290, x - 18, 370, "#fff5ca", 30);
      api.fx.particles(x, 490, "#ffc943", 10);
    }
  }
  api.onSchedule("goldrush-sparks", sparks);

  api.onSchedule("goldrush-aftermath", () => {
    let x = 850;
    let y = 525;
    for (const beetle of api.query({
      kind: "goldrush-jeweled-beetle", tag: "goldrush-visitor", limit: 1,
    })) {
      if (beetle.id === api.state.beetleId) {
        x = beetle.x;
        y = beetle.y;
      }
    }
    api.fx.impact(x, y);
    api.fx.ring(x, y, 150, "#ffc943", 90);
    api.fx.particles(x, y, "#fff5ca", 25);
    api.fx.banner("The gold dust settles. The beetle keeps its sparkle.");
    api.state.active = false;
  });

  api.registerCommand("!goldbug", begin, { cooldownSec: 15 });
  api.on("twitch:raid", begin);
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!goldbug"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["goldrush-jeweled-beetle"],
    fx: ["banner", "telegraph", "ring", "particles", "beam", "impact"],
    minEffects: 15,
  },
};

