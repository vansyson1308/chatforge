export function register(api) {
  api.defineEnemy("hologram-blue-diamond", {
    sprite: {
      grid: [
        "................",
        "....bbbbbbbb....",
        "...bcwwccdddb...",
        "..bcwwwcccdddb..",
        ".bcwwwwccccdddb.",
        "bbbbbbbbbbbbbbbb",
        ".bcccwbbcccdddb.",
        "..bccwbbccdddb..",
        "...bcwbbcdddb...",
        "....bcbbdddb....",
        ".....bbbddb.....",
        "......bbdb......",
        ".......bb.......",
        "................",
      ],
      palette: {
        b: "#2456b5", c: "#63cfff", d: "#4386e3", w: "#e2faff",
      },
    },
    team: "enemy",
    hp: 75,
    speed: 0.5,
    damage: 3,
    range: 22,
    behavior: "chase",
    scale: 2.2,
  });

  function begin() {
    if (api.state.active) return;
    if (api.query({ kind: "hologram-blue-diamond", limit: 1 }).length > 0) return;
    api.state.introduced = true;
    api.state.active = true;
    api.state.diamondId = 0;
    api.fx.banner("GEM AND THE HOLOGRAMS | @FrogForge (SIM) + @AnvilAda (SIM) + @CloudCrafter (SIM)");
    api.fx.telegraph(850, 530, 110, 60);
    api.fx.ring(850, 530, 125, "#af69ec", 60);
    api.fx.text(850, 415, "VIOLET SIGNAL: SOMETHING FACETED APPROACHES! !gem");
    api.fx.particles(850, 470, "#af69ec", 18);
    api.sfx("magic");
    api.schedule("hologram-reveal", 60, null);
    api.schedule("hologram-fade", 150, null);
  }

  api.onSchedule("hologram-reveal", () => {
    if (api.query({ kind: "hologram-blue-diamond", limit: 1 }).length === 0) {
      const diamond = api.spawn("hologram-blue-diamond", 850, 530);
      if (diamond) {
        diamond.tag("hologram-gem");
        api.state.diamondId = diamond.id;
        api.fx.trail(diamond.id, "#63cfff", 90);
      }
    }
    api.fx.banner("Sparkle crew: @PixelBao (SIM) + @MossMoth (SIM)");
    api.fx.flash("#e2faff", 8);
    api.fx.beam(850, 80, 850, 530, "#63cfff", 45);
    api.fx.particles(850, 510, "#e2faff", 35);
    api.fx.text(850, 405, "SLOW STRUT. BRILLIANT CUT.");
    api.sfx("anvil");
    for (const x of [300, 450, 600, 750, 900]) {
      api.fx.ring(x, 545, 60, "#af69ec", 90);
      api.fx.particles(x, 465, "#63cfff", 12);
    }
  });

  api.onSchedule("hologram-fade", () => {
    let x = 850;
    let y = 530;
    for (const diamond of api.query({
      kind: "hologram-blue-diamond", tag: "hologram-gem", limit: 1,
    })) {
      if (diamond.id === api.state.diamondId) {
        x = diamond.x;
        y = diamond.y;
      }
    }
    api.fx.ring(x, y, 150, "#4386e3", 90);
    api.fx.particles(x, y - 35, "#e2faff", 24);
    api.fx.banner("The hologram fades. Any surviving gem keeps its sparkle.");
    api.state.active = false;
  });

  api.registerCommand("!gem", begin, { cooldownSec: 30 });
  api.every(30, () => {
    if (!api.state.introduced) begin();
  });
}

export const forgeTest = {
  commands: ["!gem"],
  events: ["twitch:raid"],
  expect: {
    spawnKinds: ["hologram-blue-diamond"],
    fx: ["banner", "telegraph", "ring", "particles", "flash", "beam"],
    minEffects: 15,
  },
};

