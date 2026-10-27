import type {
  ForgeView,
  ForgeCard,
} from "../../../packages/shared/src/forge.js";
let identity = "",
  changedAt = 0,
  newestIdea = "",
  ideaChangedAt = 0;
const bars = [0, 0, 0];
const metrics = new Map<string, number>();
function measure(ctx: CanvasRenderingContext2D, text: string): number {
  const key = ctx.font + "/" + text;
  const known = metrics.get(key);
  if (known !== undefined) return known;
  const width = ctx.measureText(text).width;
  if (metrics.size >= 2048) metrics.clear();
  metrics.set(key, width);
  return width;
}
function line(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 18,
  color = "#f6ead7",
  bold = false,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${bold ? "monospace" : "Segoe UI, sans-serif"}`;
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  let result = text;
  while (result.length && measure(ctx, result) > width)
    result = result.slice(0, -1);
  ctx.fillText(
    result.length < text.length ? result.slice(0, -1) + "…" : result,
    x,
    y,
  );
}
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  lines = 2,
  size = 18,
  color = "#e6ded1",
  bold = false,
) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${bold ? "monospace" : "Segoe UI, sans-serif"}`;
  const words = text.split(" ");
  let row = "",
    n = 0;
  for (const word of words) {
    if (measure(ctx, row + " " + word) > width && row) {
      line(ctx, row, x, y + n * (size + 3), width, size, color, bold);
      if (++n >= lines) return;
      row = word;
    } else row += (row ? " " : "") + word;
  }
  if (n < lines)
    line(ctx, row, x, y + n * (size + 3), width, size, color, bold);
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent = "#ffad54",
) {
  ctx.fillStyle = "#111c29f5";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 4, h);
}
function credits(card: ForgeCard) {
  return (
    card.credits
      .map((c) => `${c.source === "simulator" ? "SIM " : ""}@${c.name}`)
      .join(" · ") || "Forge suggestion"
  );
}
export function drawForgeHud(
  ctx: CanvasRenderingContext2D,
  view: ForgeView,
  elapsed: number,
  hall = false,
): void {
  ctx.save();
  ctx.setTransform(1.6, 0, 0, 1.6, 0, 0);
  const build = view.build,
    round = view.round;
  const active =
    build &&
    [
      "BUILDING",
      "TESTING",
      "DEPLOYING",
      "LIVE",
      "FAILED",
      "ROLLED_BACK",
    ].includes(build.stage)
      ? build
      : round;
  const phase = active?.stage ?? "IDLE",
    now = performance.now(),
    key = `${active?.id}/${phase}/${active?.attempts}`;
  if (key !== identity) {
    identity = key;
    changedAt = now;
  }
  const age = now - changedAt,
    winner = build?.cards[build.winner ?? 0];
  const seconds = active?.deadline
    ? Math.max(0, Math.ceil((active.deadline - view.now - elapsed) / 1000))
    : 0;
  const caption =
    phase === "CURATING"
      ? "SHAPING CHAT IDEAS"
      : phase === "IDLE"
        ? "THE FORGE IS READY"
        : phase === "COLLECTING"
          ? "TYPE !idea — WHAT SHOULD WE FORGE?"
          : phase === "VOTING"
            ? "YOUR VOTE CHANGES THIS WORLD"
            : phase === "STREAMER_APPROVAL"
              ? "CHAT HAS SPOKEN"
              : phase === "LIVE"
                ? "CHAT SHIPPED THE GAME"
                : phase === "FAILED"
                  ? "BUILD REJECTED — THE GAME STAYS SAFE"
                  : phase === "ROLLED_BACK"
                    ? "ROLLBACK — THE KEEP IS SAFE"
                    : "CODEX IS FORGING";
  panel(ctx, 310, 24, 866, 88, phase === "FAILED" ? "#ff7964" : "#ffad54");
  line(ctx, caption, 332, 58, 755, 28, "#ffbd78", true);
  line(
    ctx,
    phase === "COLLECTING"
      ? `${view.ideaCount} ideas · Creatures. Gear. Bosses. Your call.`
      : phase === "VOTING"
        ? "TYPE !vote 1   /   !vote 2   /   !vote 3"
        : view.notice,
    332,
    88,
    755,
  );
  ctx.strokeStyle = "#455260";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(1132, 67, 27, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ffad54";
  ctx.beginPath();
  ctx.arc(
    1132,
    67,
    27,
    -Math.PI / 2,
    -Math.PI / 2 + (Math.PI * 2 * (seconds % 60)) / 60,
  );
  ctx.stroke();
  line(ctx, seconds ? String(seconds) : "✦", 1116, 75, 50, 22, "#fff1d7", true);
  if (round?.stage === "VOTING") {
    const total = round.tallies.reduce((a, b) => a + b, 0) || 1;
    round.cards.forEach((card, i) => {
      const y = 132 + i * 162,
        pct = (round.tallies[i] ?? 0) / total;
      bars[i]! += (pct - bars[i]!) * 0.08;
      panel(ctx, 24, y, 420, 160, round.winner === i ? "#a8edbb" : "#ffad54");
      line(ctx, `!vote ${i + 1}`, 40, y + 27, 115, 20, "#ffbd78", true);
      line(
        ctx,
        `${Math.round(pct * 100)}% · ${round.tallies[i] ?? 0}`,
        237,
        y + 27,
        126,
      );
      wrap(ctx, card.title, 40, y + 54, 388, 2, 28, "#fff1d7", true);
      line(ctx, card.visualHook, 40, y + 108, 388, 18);
      wrap(ctx, credits(card), 40, y + 130, 388, 2, 18, "#a8edbb");
      ctx.fillStyle = "#263544";
      ctx.fillRect(40, y + 157, 388, 4);
      ctx.fillStyle = "#ffad54";
      ctx.fillRect(40, y + 157, 388 * bars[i]!, 4);
    });
  } else if (phase === "COLLECTING" || phase === "CURATING") {
    line(ctx, "FROM THE CHAT", 40, 154, 330, 22, "#ffbd78", true);
    const incoming = JSON.stringify(view.ideas?.[0]);
    if (incoming !== newestIdea) {
      newestIdea = incoming;
      ideaChangedAt = now;
    }
    (view.ideas ?? []).forEach((idea, i) => {
      const y = 173 + i * 92,
        slide = Math.max(0, 1 - (now - ideaChangedAt) / 500) * 35;
      panel(ctx, 24 - slide, y, 354, 82);
      line(
        ctx,
        `${idea.source === "simulator" ? "SIM " : ""}@${idea.author}`,
        40 - slide,
        y + 25,
        320,
        18,
        "#a8edbb",
        true,
      );
      wrap(ctx, idea.text, 40 - slide, y + 50, 320, 1);
    });
  }
  if (build && winner && build.stage !== "IDLE") {
    const fail = phase === "FAILED" || phase === "ROLLED_BACK";
    panel(ctx, 820, 137, 356, 300, fail ? "#ff7964" : "#ffad54");
    line(
      ctx,
      phase === "LIVE"
        ? "SHIPPED!"
        : fail
          ? "GAME STAYS SAFE"
          : "CODEX / LIVE BUILD",
      838,
      171,
      318,
      28,
      fail ? "#ff7964" : "#ffbd78",
      true,
    );
    wrap(ctx, winner.title, 838, 208, 318, 2, 24, "#fff1d7");
    line(
      ctx,
      `${(build.durationMs / 1000).toFixed(0)}s · attempt ${build.attempts}/3`,
      838,
      257,
      318,
    );
    const step = phase === "BUILDING" ? 1 : phase === "TESTING" ? 2 : 3;
    ["SPEC", "CODE", "TEST", "DEPLOY"].forEach((s, i) => {
      line(
        ctx,
        s,
        838 + i * 80,
        291,
        78,
        18,
        i <= step ? "#ffbd78" : "#87929e",
        true,
      );
      ctx.fillStyle = i <= step ? "#ffad54" : "#394857";
      ctx.fillRect(838 + i * 80, 300, 69, 4);
    });
    wrap(
      ctx,
      (view.activity.at(-1) ?? "Reading the community specification").slice(
        0,
        Math.max(20, Math.floor(age / 15)),
      ),
      838,
      330,
      318,
    );
    const failed = build.report?.checks.find((c) => !c.ok);
    wrap(
      ctx,
      failed
        ? `CAUGHT A BUG: ${failed.detail}`
        : build.report?.ok
          ? `GATEKEEPER PASS · spectacle ${build.report.spectacle?.score ?? "—"}/10`
          : "Testing before deploy. Your world stays live.",
      838,
      389,
      318,
      2,
      18,
      failed ? "#ffab97" : "#a8edbb",
    );
    if (build.attempts > 1 && phase === "BUILDING")
      line(
        ctx,
        `Codex is repairing (${build.attempts}/3)`,
        838,
        460,
        320,
        18,
        "#ffad54",
        true,
      );
    if ((phase === "LIVE" || phase === "BUILDING" || fail) && age < 4500) {
      const slam = Math.max(0, 1 - age / 350) * 45;
      panel(ctx, 398, 125 - slam, 402, 60, fail ? "#ff7964" : "#ffad54");
      line(
        ctx,
        phase === "LIVE"
          ? "SHIPPED!"
          : fail
            ? "BUILD REJECTED"
            : "THE WINNER → THE ANVIL",
        414,
        154 - slam,
        372,
        24,
        "#ffbd78",
        true,
      );
      line(
        ctx,
        phase === "LIVE" ? credits(winner) : winner.title,
        414,
        184 - slam,
        372,
      );
      ctx.fillStyle = "#ffbd78";
      ctx.fillRect(724, 180, 60, 6);
      ctx.fillRect(737, 186, 34, 6);
    }
    if (phase === "LIVE") {
      line(
        ctx,
        `TRY ${winner.commands.join("  ")}`,
        820,
        475,
        356,
        24,
        "#ffbd78",
        true,
      );
      wrap(ctx, credits(winner), 820, 508, 356, 3, 18, "#a8edbb");
    }
  }
  if (round?.stage === "STREAMER_APPROVAL" && round.winner !== null) {
    const card = round.cards[round.winner]!;
    const drop = Math.max(0, 1 - age / 500) * 45;
    panel(ctx, 398, 125 - drop, 402, 60);
    line(ctx, "CHAT HAS CHOSEN", 414, 154 - drop, 372, 28, "#ffbd78", true);
    line(ctx, card.title, 414, 184 - drop, 372, 22);
    ctx.fillStyle = "#ffbd78";
    ctx.fillRect(724, 180, 60, 6);
    ctx.fillRect(737, 186, 34, 6);
  }
  if ((phase === "FAILED" || phase === "ROLLED_BACK") && age < 900) {
    ctx.fillStyle = `rgba(255,74,45,${0.18 * (1 - age / 900)})`;
    ctx.fillRect(0, 0, 1200, 675);
  }
  if (phase === "TESTING" && build) {
    const checks = build.report?.checks ?? [];
    [
      "baseline (host responsibility)",
      "static contract",
      "simulation 1",
      "simulation 2",
      "determinism",
    ].forEach((name, i) => {
      const check = checks.find((c) => c.name === name);
      line(
        ctx,
        `${check ? (check.ok ? "✓" : "×") : "○"} ${["Live baseline", "Static contract", "Simulation 1", "Simulation 2", "Deterministic hash"][i]}`,
        838,
        465 + i * 25,
        318,
        18,
        check?.ok ? "#a8edbb" : check ? "#ff7964" : "#9aa5b1",
      );
    });
  }
  if (hall) {
    panel(ctx, 820, 137, 356, 460);
    line(ctx, "HALL OF PATCHES", 838, 172, 320, 28, "#ffbd78", true);
    (view.patches ?? view.mods).slice(-5).forEach((mod, i) => {
      line(
        ctx,
        `${i + 1}. ${mod.title}`,
        838,
        215 + i * 74,
        320,
        21,
        "#fff1d7",
        true,
      );
      line(
        ctx,
        mod.credits
          .map((c) => `${c.source === "simulator" ? "SIM " : ""}@${c.name}`)
          .join(" · ") || "Forge suggestion",
        838,
        241 + i * 74,
        320,
        18,
        "#a8edbb",
      );
    });
  }
  panel(ctx, 24, 630, 1152, 30);
  const ticker =
    (view.patches ?? view.mods)
      .map(
        (m) =>
          `${m.title} — ${m.credits.map((c) => `${c.source === "simulator" ? "SIM " : ""}@${c.name}`).join(", ") || "Forge suggestion"}`,
      )
      .join("     ✦     ") ||
    "CHATFORGE   /   Chat imagines it. Codex builds it. The world changes live.";
  ctx.save();
  ctx.beginPath();
  ctx.rect(40, 631, 1116, 28);
  ctx.clip();
  line(
    ctx,
    ticker,
    40 - ((now / 50) % Math.max(1, measure(ctx, ticker))),
    651,
    5000,
  );
  ctx.restore();
  ctx.restore();
}
