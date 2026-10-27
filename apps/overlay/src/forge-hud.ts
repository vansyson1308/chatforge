import type { ForgeView } from "../../../packages/shared/src/forge.js";
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string {
  if (ctx.measureText(text).width <= width) return text;
  const points = Array.from(text);
  while (
    points.length &&
    ctx.measureText(points.join("") + "...").width > width
  )
    points.pop();
  return points.join("") + "...";
}
export function drawForgeHud(
  ctx: CanvasRenderingContext2D,
  view: ForgeView,
  elapsed: number,
): void {
  ctx.save();
  ctx.textAlign = "left";
  const x = 884,
    width = 292,
    round = view.round;
  ctx.fillStyle = "#101a25ee";
  ctx.fillRect(x, 22, width, round?.cards.length ? 210 : 110);
  ctx.fillStyle = "#ffc183";
  ctx.font = "bold 16px 'Segoe UI', sans-serif";
  ctx.fillText(
    `THE FORGE / ${round?.stage.replaceAll("_", " ") ?? "IDLE"}`,
    x + 12,
    46,
    width - 24,
  );
  ctx.fillStyle = "#e5e9ed";
  ctx.font = "12px 'Segoe UI', sans-serif";
  const seconds =
    round?.deadline !== null && round?.deadline !== undefined
      ? Math.max(0, Math.ceil((round.deadline - view.now - elapsed) / 1000))
      : null;
  ctx.fillText(
    `${view.ideaCount} ideas${seconds !== null ? ` / ${seconds}s` : ""} / ${view.running ? (round?.stage === "VOTING" ? "!vote 1 | 2 | 3" : "!idea to join in") : "Waiting for streamer"}`,
    x + 12,
    67,
    width - 24,
  );
  round?.cards.forEach((card, i) => {
    const y = 92 + i * 43;
    ctx.fillStyle = round.winner === i ? "#ffc183" : "#e5e9ed";
    ctx.font = "bold 13px 'Segoe UI', sans-serif";
    ctx.fillText(
      `${i + 1}. ${card.title} (${round.tallies[i]})`,
      x + 12,
      y,
      width - 24,
    );
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.fillStyle = "#b3c0cc";
    ctx.fillText(
      fit(
        ctx,
        card.suggestion ? `Forge suggestion / ${card.pitch}` : card.pitch,
        width - 24,
      ),
      x + 12,
      y + 16,
      width - 24,
    );
  });
  ctx.fillStyle = "#101a25ee";
  ctx.fillRect(24, 548, 460, 80);
  ctx.fillStyle = "#ffc183";
  ctx.font = "bold 14px 'Segoe UI', sans-serif";
  ctx.fillText(
    `CODEX / ${view.build?.stage ?? "READY"}${view.build?.attempts ? ` / attempt ${view.build.attempts}` : ""}`,
    38,
    570,
    432,
  );
  ctx.fillStyle = "#e5e9ed";
  ctx.font = "12px 'Segoe UI', sans-serif";
  ctx.fillText(
    view.activity.at(-1) ?? "Chat dreams. The forge builds.",
    38,
    591,
    432,
  );
  ctx.fillStyle =
    view.notice.includes("ROLLED") || view.notice.includes("failed")
      ? "#ed957e"
      : "#8fd3a4";
  ctx.fillText(view.notice, 38, 612, 432);
  ctx.restore();
}
