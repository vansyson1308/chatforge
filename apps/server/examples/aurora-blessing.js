export function register(api) {
  api.state.generation = 0;
  api.state.originalDamage = 1;
  api.on("twitch:raid", (event) => {
    if (api.state.generation === 0)
      api.state.originalDamage = api.rules.get("heroDamageMultiplier");
    api.state.generation++;
    const generation = api.state.generation;
    api.rules.set("heroDamageMultiplier", 2);
    api.fx.weather("aurora", 600);
    api.fx.banner(`AURORA BLESSING — ${event.viewer || "a raider"}`);
    api.after(600, () => {
      if (api.state.generation === generation) {
        api.rules.set("heroDamageMultiplier", api.state.originalDamage);
        api.state.generation = 0;
      }
    });
  });
}
