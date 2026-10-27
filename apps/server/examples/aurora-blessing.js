export function register(api) {
  api.defineProjectile("aurora-bolt", {
    sprite: {
      grid: [".a.", "aba", ".a."],
      palette: { a: "#73ebbb", b: "#ffffff" },
    },
    speed: 7,
    damage: 12,
    lifetime: 90,
  });
  api.defineHeroWeapon("aurora-staff", {
    damage: 12,
    range: 180,
    cooldown: 25,
    projectile: "aurora-bolt",
  });
  api.onSchedule("expire", ({ generation }) => {
    if (api.state.generation === generation) {
      api.rules.set("heroDamageMultiplier", api.state.originalDamage);
      api.state.active = false;
    }
  });
  api.on("twitch:raid", (event) => {
    if (!api.state.active)
      api.state.originalDamage = api.rules.get("heroDamageMultiplier");
    api.state.generation = (api.state.generation || 0) + 1;
    api.state.active = true;
    api.rules.set("heroDamageMultiplier", 2);
    for (const hero of api.query({ team: "hero", limit: 16 }))
      hero.equip("aurora-staff");
    api.fx.weather("aurora", 600);
    api.fx.banner(`AURORA BLESSING - ${event.viewer || "a raider"}`);
    api.schedule("expire", 600, { generation: api.state.generation });
  });
}
