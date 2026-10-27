export function register(api) {
  api.defineEnemy("zoomies-blue-jelly", {
    sprite: {
      grid: [
        ".....bbbbbb.....",
        "....bccccccb....",
        "...bcwwcccccb...",
        "..bcwwcccccccb..",
        "..bccccccccccb..",
        "..bcckcccckccb..",
        "..bccwccccwccb..",
        "..bccccccccccb..",
        "...bbbbbbbbbb...",
        "....c..c..c.....",
        "...cc..c..cc....",
        "...c...cc..c....",
        "..cc....c..cc...",
        "...c...cc...c...",
        "...ww..w...ww...",
        "................",
      ],
      palette: {
        b: "#347be5", c: "#75d9f4", w: "#e9fcff", k: "#243755",
      },
    },
    team: "enemy",
    hp: 25,
    speed: 3,
    damage: 2,
    range: 18,
    behavior: "chase",
    scale: 1.7,
  });

  function begin() {
    if (api.state.active) return;
    api.state.active = true;
    api.state.introduced = true;
    api.state.jellyId = 0;
    api.state.popX = 860;
    api.state.popY = 525;
    api.fx.banner("JELLY ZOOMIES | @ChaosBean (SIM) | !jellyzoom");
    api.fx.telegraph(860, 525, 110, 60);
    api.fx.ring(860, 525, 125, "#347be5", 60);
    api.fx.text(860, 415, "CHARGING ONE EXTREMELY SILLY SPRINT...");
    api.fx.lightning(790, 500, 930, 540);
    api.sfx("magic");
    api.schedule("zoomies-arrival", 60, null);
  }

  api.onSchedule("zoomies-arrival", () => {
    const jelly = api.spawn("zoomies-blue-jelly", 860, 525);
    if (jelly) {
      jelly.tag("zoomies-sprinter");
      api.state.jellyId = jelly.id;
      api.fx.trail(jelly.id, "#75d9f4", 180);
    }
    api.fx.banner("JELLY HAS THE ZOOMIES! Ten seconds until POP!");
    api.fx.flash("#e9fcff", 8);
    api.fx.particles(860, 510, "#75d9f4", 35);
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 550, 60, "#347be5", 90);
      api.fx.particles(x, 470, "#75d9f4", 12);
    }
    api.schedule("zoomies-pop", 300, null);
  });

  api.on("enemy_killed", (event) => {
    if (event.kind !== "zoomies-blue-jelly") return;
    if (event.entityId !== api.state.jellyId) return;
    // Remember the defeat position, but keep the event locked until its pop.
    api.state.popX = event.x;
    api.state.popY = event.y;
  });
  api.onSchedule("zoomies-pop", () => {
    for (const jelly of api.query({
      kind: "zoomies-blue-jelly", tag: "zoomies-sprinter", limit: 1,
    })) {
      if (jelly.id === api.state.jellyId) {
        api.state.popX = jelly.x;
        api.state.popY = jelly.y;
        jelly.damage(500);
      }
    }
    api.fx.impact(api.state.popX, api.state.popY);
    api.fx.ring(api.state.popX, api.state.popY, 150, "#347be5", 90);
    api.fx.particles(api.state.popX, api.state.popY, "#75d9f4", 45);
    api.fx.flash("#d9f7ff", 8);
    api.fx.banner("POP! The bubble bursts. The zoomies are over.");
    api.sfx("magic");
    api.state.jellyId = 0;
    api.state.active = false;
  });

  api.registerCommand("!jellyzoom", begin, { cooldownSec: 20 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!jellyzoom"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["zoomies-blue-jelly"],
    fx: ["banner", "telegraph", "ring", "lightning", "particles", "impact"],
    minEffects: 15,
  },
};
