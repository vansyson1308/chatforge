type Fx = { type: string; [key: string]: string | number | boolean };
export function drawVisualFx(
  ctx: CanvasRenderingContext2D,
  fx: Fx,
  p: number,
  time: number,
  entities: readonly { id: number; x: number; y: number }[],
): void {
  const x = Number(fx.x ?? 600),
    y = Number(fx.y ?? 475);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - p);
  ctx.strokeStyle = String(fx.color ?? "#ffd28b");
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 3;
  if (fx.type === "text") {
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(fx.text), x, y - p * 45);
  }
  if (fx.type === "ring") {
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      Number(fx.radius) * (0.4 + p * 0.6),
      Number(fx.radius) * (0.2 + p * 0.3),
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }
  if (fx.type === "beam" || fx.type === "lightning") {
    ctx.lineWidth = fx.type === "beam" ? 8 : 4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let n = 1; n <= 8; n++) {
      const t = n / 8;
      ctx.lineTo(
        x +
          (Number(fx.x2) - x) * t +
          (n < 8 ? Math.sin(n * 17 + time / 80) * 13 : 0),
        y + (Number(fx.y2) - y) * t,
      );
    }
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
  if (fx.type === "flash") {
    ctx.globalAlpha = (1 - p) * 0.18;
    ctx.fillRect(0, 0, 1200, 675);
  }
  if (fx.type === "trail") {
    const e = entities.find((e) => e.id === Number(fx.entityId));
    if (e)
      for (let n = 0; n < 8; n++) {
        ctx.globalAlpha = (1 - p) * (1 - n / 8);
        ctx.fillRect(e.x - n * 6, e.y - 20 + Math.sin(n + time / 90) * 8, 6, 6);
      }
  }
  if (fx.type === "sky") {
    const colors: Record<string, string> = {
      "blood-moon": "#9e2647",
      sunset: "#f28a52",
      aurora: "#65dfa8",
      storm: "#787ce2",
    };
    const grad = ctx.createLinearGradient(0, 0, 0, 360);
    grad.addColorStop(0, colors[String(fx.theme)] ?? "#607080");
    grad.addColorStop(1, "#17223100");
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.4 * Math.min(1, p * 12, (1 - p) * 12);
    ctx.fillRect(0, 0, 1200, 360);
    ctx.strokeStyle = colors[String(fx.theme)] ?? "#607080";
    ctx.lineWidth = 12;
    for (let l = 0; l < 3; l++) {
      ctx.beginPath();
      for (let n = 0; n <= 1200; n += 25)
        ctx.lineTo(n, 135 + l * 30 + Math.sin(n / 160 + time / 1300 + l) * 35);
      ctx.stroke();
    }
  }
  ctx.restore();
}
