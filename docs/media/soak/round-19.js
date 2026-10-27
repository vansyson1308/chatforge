export function register(api) {
  api.defineEnemy("glazed-grumpy-donut", {
    sprite: {
      grid: [
        "................",
        ".....bbbbbb.....",
        "...bbppppppbb...",
        "..bppypcpppppb..",
        ".bppppppppypppb.",
        ".bppkkppppkkppb.",
        ".bppwpbbbbpwppb.",
        ".bpppb....bpppb.",
        ".bppcb....bpppb.",
        ".bppppbbbbppypb.",
        ".bppppkkkkppppb.",
        "..bppcppppyppb..",
        "...bbppppppbb...",
        ".....bbbbbb.....",
        "....bb....bb....",
        "................",
      ],
      palette: {
        b: "#b47a45", p: "#ef91c4", y: "#ffe281",
        c: "#77dfdb", k: "#343044", w: "#fff7e5",
      },
    },
    team: "enemy",
    hp: 55,
    speed: 0.8,
    damage: 2,
    range: 20,
    behavior: "chase",
    scale: 2,
  });

  function begin() {
    if (api.state.active) return;
    if (api.query({ kind: "glazed-grumpy-donut", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.donutId = 0;
    api.state.lastX = 850;
    api.state.lastY = 530;
    api.fx.banner("GLAZED AND CONFUSED | @CrownCat (SIM) + @TinyTroll (SIM) + @DuckKnight (SIM) + @B\\u00e1nhM\\u00ec (SIM)");
    api.fx.telegraph(850, 530, 115, 60);
    api.fx.ring(850, 530, 130, "#ef91c4", 60);
    api.fx.particles(850, 485, "#ffe281", 20);
    api.fx.particles(850, 485, "#77dfdb", 20);
    api.fx.text(850, 410, "SPRINKLE WARNING! ONE GRUMPY DONUT INBOUND. !donut");
    api.sfx("magic");
    api.schedule("glazed-arrival", 60, null);
  }

  api.onSchedule("glazed-arrival", () => {
    if (api.query({ kind: "glazed-grumpy-donut", limit: 1 }).length === 0) {
      const donut = api.spawn("glazed-grumpy-donut", 850, 530);
      if (donut) {
        donut.tag("glazed-visitor");
        api.state.donutId = donut.id;
        api.fx.trail(donut.id, "#ef91c4", 180);
      }
    }
    api.fx.banner("Freshly frosted. Deeply unimpressed.");
    api.fx.flash("#fff7e5", 8);
    api.fx.particles(850, 510, "#ef91c4", 35);
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#ef91c4", 90);
      api.fx.particles(x, 450, "#ffe281", 10);
      api.fx.particles(x, 450, "#77dfdb", 10);
    }
    api.schedule("glazed-closing-ring", 180, null);
    api.schedule("glazed-cleanup", 300, null);
  });

  api.on("enemy_killed", (event) => {
    if (event.kind === "glazed-grumpy-donut" && event.entityId === api.state.donutId) {
      api.state.lastX = event.x;
      api.state.lastY = event.y;
    }
  });
  api.onSchedule("glazed-closing-ring", () => {
    for (const donut of api.query({ kind: "glazed-grumpy-donut", limit: 1 })) {
      if (donut.id === api.state.donutId) {
        api.state.lastX = donut.x;
        api.state.lastY = donut.y;
      }
    }
    api.fx.ring(api.state.lastX, api.state.lastY, 150, "#ef91c4", 90);
    api.fx.particles(api.state.lastX, api.state.lastY, "#ffe281", 30);
    api.fx.particles(api.state.lastX, api.state.lastY, "#77dfdb", 30);
    api.fx.banner("Closing sprinkles! Every donut deserves a sweet send-off.");
    api.sfx("cheer");
  });
  api.onSchedule("glazed-cleanup", () => {
    for (const donut of api.query({
      kind: "glazed-grumpy-donut", tag: "glazed-visitor", limit: 1,
    })) {
      if (donut.id === api.state.donutId) donut.damage(500);
    }
    api.fx.text(api.state.lastX, api.state.lastY - 80, "Bakery closed. Crumbs cleared!");
    api.state.donutId = 0;
    api.state.active = false;
  });

  api.registerCommand("!donut", begin, { cooldownSec: 20 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!donut"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["glazed-grumpy-donut"],
    fx: ["banner", "telegraph", "ring", "particles", "flash"],
    minEffects: 20,
  },
};
