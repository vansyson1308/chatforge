export function register(api) {
  api.onSchedule("impact", ({ x, y }) => {
    api.fx.impact(x, y);
    api.fx.particles(x, y, "#ff8c32", 60);
    api.fx.shake(9, 14);
    for (const enemy of api.query({ team: "enemy", limit: 50 })) {
      if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 < 55 ** 2) enemy.damage(60);
    }
  });
  function meteor() {
    const x = 260 + api.random() * 680;
    const y = 470 + api.random() * 100;
    api.fx.telegraph(x, y, 55, 30);
    api.schedule("impact", 30, { x, y });
  }
  api.registerCommand("!meteor", meteor, { cooldownSec: 15 });
  api.on("twitch:sub", meteor);
}
