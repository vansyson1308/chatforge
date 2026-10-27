export function register(api) {
  function meteor() {
    const x = 260 + api.random() * 680;
    const y = 120 + api.random() * 440;
    api.fx.telegraph(x, y, 55, 30);
    api.fx.weather("meteor", 60);
    api.after(30, () => {
      api.fx.particles(x, y, "#ff8c32", 60);
      api.fx.shake(9, 14);
      for (const enemy of api.query({ team: "enemy" }).slice(0, 50)) {
        if ((enemy.x - x) ** 2 + (enemy.y - y) ** 2 < 55 ** 2) enemy.damage(60);
      }
    });
  }
  api.registerCommand("!meteor", meteor, { cooldownSec: 15 });
  api.on("twitch:sub", meteor);
}
