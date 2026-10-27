export function register(api) {
  api.defineProp("heart-duty-altar", {
    sprite: {
      grid: [
        "................",
        "..rrr....rrr....",
        ".rwwwr..rpppr...",
        ".rwwrrrrppppr...",
        ".rwwrrrrppppr...",
        "..rrrrrrrrrr....",
        "...rrrrrrrr.....",
        "....rrrrrr......",
        ".....rrrr.......",
        "......rr........",
        "....ssyyss......",
        "...sssyysss.....",
        "...ssssssss.....",
        "..ssssssssss....",
        "..kkkkkkkkkk....",
        "................",
      ],
      palette: {
        r: "#ed5268", p: "#ff9daf", w: "#fff3e1",
        s: "#8795b3", y: "#ffd66e", k: "#34435b",
      },
    },
    scale: 2.5,
  });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    if (api.query({ kind: "heart-duty-altar", limit: 1 }).length === 0) {
      api.spawn("heart-duty-altar", 480, 245);
    }
    api.fx.banner("HEART ON DUTY | @CrownCat (SIM) + @DuckKnight (SIM) | !heartcall");
    api.fx.telegraph(480, 245, 100, 60);
    api.fx.ring(480, 245, 115, "#ed5268", 60);
    api.fx.flash("#ff9daf", 8);
    api.fx.text(600, 365, "VICTORY CHECKUP: THREE SMALL PATCH-UPS INCOMING!");
    api.sfx("magic");
    api.schedule("heart-duty-pulse", 60, null);
  }

  api.onSchedule("heart-duty-pulse", () => {
    let healed = 0;
    for (const hero of api.query({ team: "hero", limit: 3 })) {
      hero.heal(12);
      api.fx.beam(480, 245, hero.x, hero.y, "#ff9daf", 45);
      api.fx.ring(hero.x, hero.y, 60, "#ed5268", 90);
      api.fx.particles(hero.x, hero.y - 20, "#fff3e1", 12);
      api.fx.text(hero.x, hero.y - 70, "HEART DUTY: +12 HP");
      healed += 1;
    }
    api.state.lastHealed = healed;
    api.fx.ring(480, 245, 150, "#ff9daf", 90);
    api.fx.particles(480, 245, "#ffd66e", 28);
    api.fx.banner(healed > 0
      ? "Party patched! A little heart goes a long way."
      : "No patients today. The heart still sends its love!");
    // A broad visual pulse keeps the whole party involved without extra heals.
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 65, "#ff9daf", 90);
      api.fx.particles(x, 470, "#ed5268", 10);
    }
    api.sfx("cheer");
    api.schedule("heart-duty-glow", 60, null);
  });
  api.onSchedule("heart-duty-glow", () => {
    api.fx.ring(480, 245, 55, "#ffd66e", 90);
    api.fx.particles(480, 220, "#ff9daf", 12);
    api.fx.text(480, 175, "Heart on standby. Ready after the next victory.");
    api.state.active = false;
  });

  api.registerCommand("!heartcall", begin, { cooldownSec: 30 });
  api.on("wave_end", begin);
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!heartcall"],
  events: ["wave_end"],
  expect: {
    spawnKinds: ["heart-duty-altar"],
    fx: ["banner", "telegraph", "ring", "particles", "flash"],
    minEffects: 12,
  },
};

