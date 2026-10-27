export function register(api) {
  api.defineEnemy("produce-revolt-pumpkin", {
    sprite: {
      grid: [
        ".....gg.....",
        ".....ggg....",
        "...oooooo...",
        "..oyoyoyoo..",
        ".oyyoyoyyoo.",
        ".oykoyokyoo.",
        ".oywoyowyoo.",
        ".oyyoyoyyoo.",
        ".oykyyykyoo.",
        "..oykkkyoo..",
        "...oooooo...",
        "............",
      ],
      palette: {
        g: "#629d48", o: "#d66a26", y: "#ffb54d",
        k: "#343246", w: "#fff0c4",
      },
    },
    hp: 55, speed: 0.8, damage: 2, range: 22,
    behavior: "chase", scale: 2,
  });
  api.defineEnemy("produce-revolt-carrot", {
    sprite: {
      grid: [
        "..g..g..g...",
        "...ggggg....",
        "....ggg.....",
        "...oooooo...",
        "...oyyyyo...",
        "...okyyko...",
        "...owyywo...",
        "....oyyo....",
        "....okko....",
        "....oyyo....",
        ".....oo.....",
        ".....o......",
      ],
      palette: {
        g: "#70bf57", o: "#e87829", y: "#ffc36b",
        k: "#343246", w: "#fff0c4",
      },
    },
    hp: 30, speed: 1.2, damage: 2, range: 18,
    behavior: "chase", scale: 1.7,
  });

  function begin() {
    if (api.state.active) return;
    api.state.introduced = true;
    api.state.active = true;
    api.fx.banner("PRODUCE AISLE REVOLT | @DuckKnight (SIM) + @CozySlime (SIM)");
    api.fx.telegraph(850, 530, 130, 60);
    api.fx.ring(850, 530, 140, "#ffb54d", 60);
    api.fx.text(850, 415, "HARVEST WARNING! THE VEGGIES HAVE PLANS. !produce");
    api.fx.particles(850, 450, "#70bf57", 16);
    api.sfx("magic");
    api.schedule("produce-arrival", 60, null);
    api.schedule("produce-aftermath", 150, null);
  }

  api.onSchedule("produce-arrival", () => {
    if (api.query({ kind: "produce-revolt-pumpkin", limit: 1 }).length === 0) {
      const pumpkin = api.spawn("produce-revolt-pumpkin", 810, 530);
      if (pumpkin) {
        pumpkin.tag("produce-harvest");
        api.fx.trail(pumpkin.id, "#ffb54d", 90);
      }
    }
    if (api.query({ kind: "produce-revolt-carrot", limit: 1 }).length === 0) {
      const carrot = api.spawn("produce-revolt-carrot", 900, 530);
      if (carrot) {
        carrot.tag("produce-harvest");
        api.fx.trail(carrot.id, "#70bf57", 90);
      }
    }
    api.fx.banner("CLEANUP IN PRODUCE! A pumpkin grin and one leafy rebel.");
    api.fx.flash("#fff0c4", 8);
    api.fx.particles(850, 510, "#ffb54d", 35);
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 65, "#ffb54d", 90);
      api.fx.particles(x, 470, "#70bf57", 12);
    }
  });

  api.onSchedule("produce-aftermath", () => {
    // The closing harvest stamp always lands, even after an early defeat.
    api.fx.impact(850, 530);
    api.fx.ring(850, 530, 150, "#ffb54d", 90);
    api.fx.particles(850, 500, "#ffc36b", 30);
    api.fx.text(850, 415, "Harvest complete. Mind the remaining vegetables!");
    api.sfx("cheer");
    api.state.active = false;
  });

  api.registerCommand("!produce", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!produce"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["produce-revolt-pumpkin", "produce-revolt-carrot"],
    fx: ["banner", "telegraph", "ring", "particles", "flash", "impact"],
    minEffects: 15,
  },
};
