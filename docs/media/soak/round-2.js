export function register(api) {
  api.defineEnemy("crabaret-star", {
    sprite: {
      grid: [
        "......kkkk......",
        "......kkkk......",
        "......kkkk......",
        "......gggg......",
        "....kkkkkkkk....",
        "................",
        ".rr...w..w...rr.",
        "rrrr..k..k..rrrr",
        ".rrr.rrrrrr.rrr.",
        "...rrrrrrrrrr...",
        "..rrrrrrrrrrrr..",
        "...rrooooorr....",
        ".rr.rrrrrrrr.rr.",
        "rr..r......r..rr",
        "...rr......rr...",
        "..rr........rr..",
      ],
      palette: {
        r: "#ef654d", o: "#ffb67a", k: "#1c2030",
        g: "#ffd66b", w: "#fff7e5",
      },
    },
    team: "enemy",
    hp: 100,
    speed: 0.6,
    damage: 2,
    range: 20,
    behavior: "guard",
    scale: 2,
  });

  function begin(arrivalDelay, bowDelay) {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.crabId = 0;
    api.fx.banner("CRABARET | @AnvilAda (SIM) + @SparkSage (SIM) + @ChaosBean (SIM)");
    api.fx.text(850, 410, "MAKE ROOM FOR THE TOP HAT! !crabaret");
    api.fx.telegraph(850, 525, 110, arrivalDelay);
    api.fx.ring(850, 525, 125, "#ffd66b", arrivalDelay);
    api.sfx("magic");
    api.schedule("crabaret-entrance", arrivalDelay, null);
    api.schedule("crabaret-bow", bowDelay, null);
  }

  api.onSchedule("crabaret-entrance", () => {
    const crab = api.spawn("crabaret-star", 850, 525);
    if (crab) {
      crab.tag("crabaret-performer");
      api.state.crabId = crab.id;
      api.fx.trail(crab.id, "#ffd66b", 180);
    }
    api.fx.banner("THE CRABARET IS OPEN! Sideways steps, upright hat.");
    api.fx.beam(720, 70, 850, 525, "#fff7e5", 75);
    api.fx.ring(850, 525, 140, "#ef654d", 180);
    api.fx.particles(850, 500, "#ffd66b", 40);
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.particles(x, 460, "#ffd66b", 12);
      api.fx.ring(x, 550, 65, "#ffb67a", 90);
    }
  });

  api.onSchedule("crabaret-bow", () => {
    let x = 850;
    let y = 525;
    for (const crab of api.query({
      kind: "crabaret-star", tag: "crabaret-performer", limit: 10,
    })) {
      if (crab.id === api.state.crabId) {
        x = crab.x;
        y = crab.y;
        crab.damage(500);
      }
    }
    api.fx.impact(x, y);
    api.fx.ring(x, y, 150, "#ffd66b", 90);
    api.fx.particles(x, y, "#ef654d", 30);
    api.fx.banner("One final bow! The hat leaves with its crab. Encore: !crabaret");
    api.sfx("cheer");
    api.state.crabId = 0;
    api.state.active = false;
  });

  api.registerCommand("!crabaret", () => begin(60, 240), { cooldownSec: 20 });
  // First simulation tick gives an immediate cue; entrance/bow land at 60/240.
  api.on("tick", () => {
    if (!api.state.introduced) begin(59, 239);
  });
  api.every(30, () => {
    if (!api.state.introduced) begin(60, 240);
  });
}

export const forgeTest = {
  commands: ["!crabaret"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["crabaret-star"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "impact"],
    minEffects: 12,
  },
};
