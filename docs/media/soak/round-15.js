export function register(api) {
  const baton = {
    grid: [
      ".........ww.",
      "........wyw.",
      ".......wyw..",
      "......wyw...",
      ".....wyw....",
      "....wyw.....",
      "...wyw......",
      "..wyw.......",
      ".wkw........",
      ".kpk........",
      "..kk........",
      "............",
    ],
    palette: { w: "#fff5d9", y: "#ffd46f", k: "#34334e", p: "#b786ef" },
  };
  const note = {
    grid: [
      "............",
      ".....kkkkk..",
      ".....kyyyk..",
      ".....kyppk..",
      ".....kyykk..",
      ".....kyk....",
      ".....kyk....",
      "..kkkkyk....",
      ".kpppyyk....",
      ".kpwpyyk....",
      "..kkkkk.....",
      "............",
    ],
    palette: { k: "#34334e", y: "#ffd46f", p: "#b786ef", w: "#fff5d9" },
  };
  api.defineProjectile("treble-bright-note", {
    sprite: note, speed: 6, damage: 7, lifetime: 45,
  });
  api.defineHeroWeapon("treble-conductor-baton", {
    damage: 7, range: 210, cooldown: 42, projectile: "treble-bright-note",
  });
  api.defineHat("treble-baton-badge", baton);
  api.defineProp("treble-baton-display", { sprite: baton, scale: 3 });
  api.defineProp("treble-note-display", { sprite: note, scale: 2 });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("TREBLE TROUBLE | @EmberEli (SIM) + @MossMoth (SIM) | !treble");
    api.fx.telegraph(480, 530, 100, 30);
    api.fx.ring(480, 530, 120, "#b786ef", 30);
    api.fx.text(600, 380, "CONDUCTOR CUE: ONE BATON, MANY BRIGHT NOTES!");
    for (const y of [300, 315, 330, 345, 360]) {
      api.fx.beam(400, y, 800, y, "#ffd46f", 30);
    }
    if (api.query({ kind: "treble-baton-display", limit: 1 }).length === 0) {
      api.spawn("treble-baton-display", 480, 245);
    }
    if (api.query({ kind: "treble-note-display", limit: 1 }).length === 0) {
      api.spawn("treble-note-display", 600, 125);
    }
    api.sfx("magic");
    api.schedule("treble-equip", 30, null);
    api.schedule("treble-close", 150, null);
  }

  api.onSchedule("treble-equip", () => {
    let equipped = false;
    for (const hero of api.query({ team: "hero", limit: 1 })) {
      hero.equip("treble-conductor-baton");
      api.equipHat(hero.id, "treble-baton-badge");
      api.fx.beam(480, 245, hero.x, hero.y, "#ffd46f", 45);
      api.fx.particles(hero.x, hero.y, "#b786ef", 24);
      api.fx.text(hero.x, hero.y - 70, "BATON READY: FIRE THE NOTES!");
      equipped = true;
    }
    api.state.lastEquipped = equipped;
    api.fx.banner(equipped
      ? "A hero takes the baton! Musical notes now fly in combat."
      : "No conductor available. The cue still gets its closing chord!");
    api.fx.flash("#fff5d9", 8);
    api.sfx("cheer");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#b786ef", 90);
      api.fx.particles(x, 440, "#ffd46f", 12);
    }
  });
  api.onSchedule("treble-close", () => {
    api.fx.impact(480, 530);
    api.fx.ring(480, 530, 150, "#ffd46f", 90);
    api.fx.particles(480, 500, "#b786ef", 30);
    api.fx.banner("Closing chord! The baton stays with its conductor.");
    api.sfx("magic");
    api.state.active = false;
  });

  api.registerCommand("!treble", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!treble"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["treble-baton-display", "treble-note-display"],
    fx: ["banner", "telegraph", "ring", "beam", "particles", "impact"],
    minEffects: 15,
  },
};

