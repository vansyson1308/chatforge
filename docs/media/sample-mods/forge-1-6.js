export const forgeTest = {
  events: ["twitch:cheer"],
  expect: { fx: ["particles", "shake"], minEffects: 2 },
};

export function register(api) {
  api.onSchedule("cheer-ready", () => {
    api.state.cheerCooling = false;
  });

  api.on("twitch:cheer", () => {
    if (api.state.cheerCooling) return;
    api.state.cheerCooling = true;
    api.schedule("cheer-ready", 30, null);
    api.fx.particles(600, 340, "#ff8833", 28);
    api.fx.shake(2, 8);
  });
}
