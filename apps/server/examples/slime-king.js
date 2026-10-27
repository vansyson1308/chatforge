export function register(api) {
  api.defineEnemy("slime-king", {
    sprite: {
      grid: [
        "....yyyy....",
        "...yyyyyy...",
        "..gggggggg..",
        ".gggggggggg.",
        "ggwwggwwgggg",
        "ggkkggkkgggg",
        "gggggggggggg",
        ".gggggggggg.",
        "..gggggggg..",
      ],
      palette: { y: "#ffce57", g: "#70c97f", w: "#f4f2dd", k: "#21352e" },
    },
    hp: 500,
    speed: 0.55,
    damage: 18,
    behavior: "chase",
    range: 28,
  });
  api.defineEnemy("king-slimelet", {
    sprite: {
      grid: [".gg.", "gggg", "gwwg", ".gg."],
      palette: { g: "#70c97f", w: "#f4f2dd" },
    },
    hp: 22,
    speed: 1.2,
    damage: 5,
    behavior: "chase",
    range: 18,
  });
  api.on("wave_start", (event) => {
    if (event.wave % 3 === 0) {
      api.spawn("slime-king", 80, 340);
      api.fx.banner("THE SLIME KING APPROACHES");
    }
  });
  api.on("enemy_killed", (event) => {
    if (event.kind === "slime-king") {
      for (let i = 0; i < 4; i++)
        api.spawn("king-slimelet", event.x + (i - 2) * 20, event.y);
      api.fx.particles(event.x, event.y, "#70c97f", 50);
    }
  });
}
