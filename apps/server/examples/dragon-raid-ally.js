export function register(api) {
  const dragon = {
    grid: [
      ".g........g.",
      ".gg......gg.",
      ".ggg.gg.ggg.",
      "..gggggggg..",
      "...gwggwg...",
      "...gkggkg...",
      ".gggggggggg.",
      "gg..goog..gg",
      "....goog....",
      "...ggoog....",
      "..gg...gg...",
      ".kk.....kk..",
    ],
    palette: { g: "#76dcab", w: "#f5ffe8", k: "#203044", o: "#ffbd60" },
  };
  api.defineEnemy("raid-dragon", {
    sprite: dragon,
    team: "hero",
    hp: 200,
    speed: 1.8,
    damage: 12,
    range: 65,
    behavior: "guard",
    scale: 3,
  });
  api.defineHat("dragon-crown", dragon);
  function summon() {
    if (api.state.active) return;
    api.state.active = true;
    api.fx.sky("aurora", 12);
    api.fx.banner("DRAGON RAID ALLY — thanks, community!");
    api.fx.ring(760, 520, 100, "#76dcab", 90);
    api.fx.text(760, 435, "A FRIEND IS COMING");
    api.sfx("magic");
    api.schedule("arrival", 90, null);
  }
  api.onSchedule("arrival", () => {
    const ally = api.spawn("raid-dragon", 760, 520);
    if (ally) api.fx.trail(ally.id, "#76dcab", 150);
    api.fx.beam(760, 40, 760, 520, "#caffdb", 30);
    api.fx.flash("#caffdb", 8);
    api.fx.particles(760, 520, "#76dcab", 45);
    for (const hero of api.query({ team: "hero", limit: 20 }))
      api.equipHat(hero.id, "dragon-crown");
    api.fx.banner("YOUR RAID, YOUR DRAGON. Try !dragon");
    api.sfx("cheer");
    api.schedule("afterglow", 180, null);
  });
  api.onSchedule("afterglow", () => {
    api.fx.ring(760, 520, 180, "#ffbd60", 60);
    api.fx.text(600, 445, "The dragon stands with chat.");
    api.state.active = false;
  });
  api.registerCommand("!dragon", summon, { cooldownSec: 25 });
  api.on("twitch:raid", summon);
  api.every(30, () => {
    if (!api.state.introduced) {
      api.state.introduced = true;
      summon();
    }
  });
}
export const forgeTest = {
  commands: ["!dragon"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["raid-dragon"],
    fx: ["ring", "beam", "particles", "banner"],
    minEffects: 8,
  },
};
