export const forgeTest = {
  expect: { fx: ["particles", "banner"], minEffects: 1 },
};

export function register(api) {
  // At most 60 heals and 60 particle effects per callback (128-write budget).
  api.onSchedule("breather-heal", (ids) => {
    for (const hero of api.query({ team: "hero", limit: 300 })) {
      if (ids.includes(hero.id) && hero.hp > 0 && hero.hp < hero.maxHp) {
        const missing = hero.maxHp - hero.hp;
        hero.heal(missing < 5 ? missing : 5);
        api.fx.particles(hero.x, hero.y, "#77eeaa", 8);
      }
    }
  });

  api.on("wave_end", () => {
    let batch = [];
    let delay = 1;
    for (const hero of api.query({ team: "hero", limit: 300 })) {
      if (hero.hp > 0 && hero.hp < hero.maxHp) {
        batch.push(hero.id);
        if (batch.length === 60) {
          api.schedule("breather-heal", delay, batch);
          batch = [];
          delay += 1;
        }
      }
    }
    if (batch.length > 0) api.schedule("breather-heal", delay, batch);
    api.fx.banner("Wave-End Breather: recover up to 5 health");
    api.fx.particles(600, 340, "#77eeaa", 12);
  });
}
