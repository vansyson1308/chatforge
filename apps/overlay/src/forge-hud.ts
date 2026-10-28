import {
  formatCredit,
  type ForgeCard,
  type ForgeView,
} from "../../../packages/shared/src/forge.js";
let phaseKey = "",
  phaseAt = 0,
  newest = "",
  ideaAt = 0,
  lastCode = "",
  codeChangedAt = 0;
const bars = [0, 0, 0];
const widths = new Map<string, number>();
const slots = {
  top: { x: 310, y: 24, w: 866, h: 88 },
  left: { x: 24, y: 132, w: 340, h: 480 },
  right: { x: 900, y: 132, w: 276, h: 420 },
  center: { x: 400, y: 127, w: 400, h: 53 },
  ticker: { x: 24, y: 630, w: 1152, h: 30 },
} as const;
function font(ctx: CanvasRenderingContext2D, size: number, bold = false) {
  ctx.font = `${bold ? "bold " : ""}${size}px ${bold ? "monospace" : "Segoe UI, sans-serif"}`;
}
function measure(ctx: CanvasRenderingContext2D, s: string) {
  const key = ctx.font + "\n" + s;
  let n = widths.get(key);
  if (n === undefined) {
    n = ctx.measureText(s).width;
    if (widths.size > 2048) widths.clear();
    widths.set(key, n);
  }
  return n;
}
function rows(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
): string[] {
  const words = text.trim().split(/\s+/u);
  const out: string[] = [];
  let row = "";
  for (const word of words) {
    let rest = word;
    while (rest) {
      const candidate = row ? row + " " + rest : rest;
      if (measure(ctx, candidate) <= width) {
        row = candidate;
        break;
      }
      if (row) {
        out.push(row);
        row = "";
        continue;
      }
      let end = rest.length;
      while (end > 1 && measure(ctx, rest.slice(0, end)) > width) end--;
      out.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
  }
  if (row) out.push(row);
  return out;
}
function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  maxLines: number,
  size: number,
  floor: number,
  color: string,
  bold = false,
): void {
  let lines: string[] = [];
  for (; size >= floor; size--) {
    font(ctx, size, bold);
    lines = rows(ctx, text, width);
    if (lines.length <= maxLines) break;
  }
  size = Math.max(size, floor);
  font(ctx, size, bold);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1] ?? "";
    while (last && measure(ctx, last + "…") > width) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + "…";
  }
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  lines.forEach((s, i) => ctx.fillText(s, x, y + i * (size + 3)));
}
function creditSummary(
  ctx: CanvasRenderingContext2D,
  credits: ForgeCard["credits"],
  width: number,
): string {
  const list = credits.map(formatCredit);
  if (!list.length) return "Forge suggestion";
  font(ctx, 17);
  for (let count = list.length; count >= 0; count--) {
    const omitted = list.length - count;
    const value =
      list.slice(0, count).join(", ") +
      (omitted ? `${count ? ", " : ""}+${omitted} more` : "");
    if (measure(ctx, value) <= width) return value;
  }
  return `+${list.length} more`;
}
function visibleCredit(
  ctx: CanvasRenderingContext2D,
  credit: { name: string; source: string },
  width: number,
): string {
  font(ctx, 15, true);
  const chars = Array.from(credit.name);
  let value = formatCredit(credit);
  while (chars.length && measure(ctx, value) > width) {
    chars.pop();
    value = formatCredit({ ...credit, name: chars.join("") });
  }
  return value;
}
function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent = "#ffad54",
) {
  ctx.fillStyle = "#111c29";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = accent;
  ctx.fillRect(x, y, 4, h);
}
function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  size = 18,
  color = "#f6ead7",
  bold = false,
) {
  fit(ctx, text, x, y, width, 1, size, size, color, bold);
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
      "SHOWCASE",
      "LIVE",
      "FAILED",
      "ROLLED_BACK",
    ].includes(build.stage)
      ? build
      : round;
  const phase = active?.stage ?? "IDLE",
    now = performance.now(),
    key = `${active?.id}/${phase}/${active?.attempts}`;
  if (key !== phaseKey) {
    phaseKey = key;
    phaseAt = now;
  }
  const age = now - phaseAt,
    winner = build?.cards[build.winner ?? 0];
  const seconds = active?.deadline
    ? Math.max(0, Math.ceil((active.deadline - view.now - elapsed) / 1000))
    : 0;
  const headings: Record<string, string> = {
    IDLE: "THE FORGE IS READY",
    COLLECTING: "TYPE !idea — YOUR WORLD, YOUR CALL",
    CURATING: "SHAPING CHAT IDEAS",
    VOTING: "YOUR VOTE CHANGES THE WORLD",
    STREAMER_APPROVAL: "CHAT HAS CHOSEN",
    BUILDING: "CODEX IS FORGING",
    TESTING: "GATEKEEPER IS TESTING",
    DEPLOYING: "PATCH ENTERING THE WORLD",
    SHOWCASE: age < 4000 ? "SHIPPED!" : "SHOWCASE",
    LIVE: "SHIPPED!",
    FAILED: "BUILD REJECTED — GAME STAYS SAFE",
    ROLLED_BACK: "ROLLBACK — THE KEEP IS SAFE",
  };
  const subtitle =
    view.connection?.twitchEnabled && view.connection.eventsub !== "connected"
      ? "TWITCH CHAT DISCONNECTED — RECONNECTING"
      : phase === "COLLECTING"
        ? `${view.ideaCount} ideas collected`
        : phase === "VOTING"
          ? "TYPE !vote 1   /   !vote 2   /   !vote 3"
          : phase === "SHOWCASE" && winner
            ? age < 4000
              ? `${winner.title} — ${creditSummary(ctx, winner.credits, 650)}`
              : view.notice
            : phase === "LIVE" && winner
              ? `${winner.title}  ·  TRY ${winner.commands.join(" ")}`
              : phase === "BUILDING"
                ? "Turning the winning idea into a mod"
                : phase === "TESTING"
                  ? "Checking the world and candidate deterministically"
                  : phase === "DEPLOYING"
                    ? "Applying the tested patch"
                    : phase === "STREAMER_APPROVAL"
                      ? "The winning idea is ready for approval"
                      : phase === "CURATING"
                        ? "Turning viewer ideas into three cards"
                        : phase === "FAILED" || phase === "ROLLED_BACK"
                          ? "The last safe version remains active"
                          : "Chat imagines it. Codex builds it.";
  panel(
    ctx,
    slots.top.x,
    slots.top.y,
    slots.top.w,
    slots.top.h,
    phase === "FAILED" ? "#ff7964" : "#ffad54",
  );
  fit(
    ctx,
    headings[phase] ?? headings.IDLE!,
    332,
    58,
    755,
    1,
    28,
    22,
    "#ffbd78",
    true,
  );
  fit(ctx, subtitle, 332, 88, 755, 1, 18, 16, "#f6ead7");
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
  drawText(
    ctx,
    seconds ? String(seconds) : "✦",
    1116,
    75,
    50,
    22,
    "#fff1d7",
    true,
  );
  if (round?.stage === "VOTING" && phase === "VOTING") {
    const total = round.tallies.reduce((a, b) => a + b, 0) || 1;
    round.cards.forEach((card, i) => {
      const y = slots.left.y + i * 162,
        pct = (round.tallies[i] ?? 0) / total;
      bars[i]! += (pct - bars[i]!) * 0.08;
      panel(ctx, 24, y, 340, 158);
      drawText(ctx, `!vote ${i + 1}`, 40, y + 23, 110, 19, "#ffbd78", true);
      drawText(
        ctx,
        `${Math.round(pct * 100)}% · ${round.tallies[i] ?? 0}`,
        246,
        y + 23,
        100,
        18,
      );
      fit(ctx, card.title, 40, y + 52, 308, 2, 24, 18, "#fff1d7", true);
      font(ctx, 24, true);
      const pitchY = y + (rows(ctx, card.title, 308).length > 1 ? 105 : 83);
      fit(ctx, card.pitch, 40, pitchY, 308, 2, 16, 14, "#e6ded1");
      drawText(
        ctx,
        creditSummary(ctx, card.credits, 308),
        40,
        y + 145,
        308,
        17,
        "#a8edbb",
      );
      ctx.fillStyle = "#263544";
      ctx.fillRect(40, y + 154, 308, 3);
      ctx.fillStyle = "#ffad54";
      ctx.fillRect(40, y + 154, 308 * bars[i]!, 3);
    });
  } else if (phase === "COLLECTING" || phase === "CURATING") {
    drawText(ctx, "FROM THE CHAT", 40, 154, 330, 22, "#ffbd78", true);
    const incoming = JSON.stringify(view.ideas?.[0]);
    if (incoming !== newest) {
      newest = incoming;
      ideaAt = now;
    }
    (view.ideas ?? []).forEach((idea, i) => {
      const y = 173 + i * 70,
        slide = Math.max(0, 1 - (now - ideaAt) / 500) * 30;
      panel(ctx, 24 - slide, y, 300, 62);
      fit(
        ctx,
        visibleCredit(ctx, { name: idea.author, source: idea.source }, 270),
        40 - slide,
        y + 24,
        270,
        1,
        18,
        15,
        "#a8edbb",
        true,
      );
      fit(ctx, idea.text, 40 - slide, y + 47, 270, 1, 15, 13, "#e6ded1");
    });
  }
  if (
    !hall &&
    build &&
    winner &&
    ["BUILDING", "TESTING", "DEPLOYING", "FAILED", "ROLLED_BACK"].includes(
      phase,
    )
  ) {
    const x = slots.right.x,
      y = slots.right.y,
      w = slots.right.w,
      failed = build.report?.checks.find((c) => !c.ok);
    panel(ctx, x, y, w, slots.right.h, failed ? "#ff7964" : "#ffad54");
    fit(ctx, winner.title, x + 16, y + 30, w - 32, 2, 23, 18, "#fff1d7", true);
    drawText(
      ctx,
      `${(build.durationMs / 1000).toFixed(0)}s · attempt ${build.attempts}/3`,
      x + 16,
      y + 82,
      w - 32,
      17,
    );
    const step = phase === "BUILDING" ? 1 : phase === "TESTING" ? 2 : 3;
    ["SPEC", "CODE", "TEST", "DEPLOY"].forEach((s, i) => {
      drawText(
        ctx,
        s,
        x + 16 + i * 60,
        y + 112,
        58,
        14,
        i <= step ? "#ffbd78" : "#87929e",
        true,
      );
      ctx.fillStyle = i <= step ? "#ffad54" : "#394857";
      ctx.fillRect(x + 16 + i * 60, y + 121, 52, 3);
    });
    drawText(
      ctx,
      view.activity.at(-1) ?? "Preparing the community specification",
      x + 16,
      y + 148,
      w - 32,
      13,
      "#e6ded1",
    );
    if (phase === "BUILDING") {
      ctx.fillStyle = "#0b141e";
      ctx.fillRect(x + 12, y + 164, w - 24, 220);
      const codeKey = (view.code?.lines ?? []).join("\n");
      if (codeKey !== lastCode) {
        lastCode = codeKey;
        codeChangedAt = now;
      }
      const codeOffset = 12 * Math.max(0, 1 - (now - codeChangedAt) / 300);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 12, y + 164, w - 24, 220);
      ctx.clip();
      ctx.font = "10px monospace";
      (view.code?.lines ?? []).slice(-14).forEach((line, index) => {
        ctx.fillStyle = /\b(function|const|return|export)\b/u.test(line)
          ? "#f7bd7e"
          : "#b5d8c1";
        const width = view.code?.sprite ? 170 : w - 36;
        let visible = line;
        while (visible.length && ctx.measureText(visible).width > width)
          visible = visible.slice(0, -1);
        ctx.fillText(visible, x + 18, y + 181 + index * 13 + codeOffset);
      });
      ctx.restore();
      if (view.code?.sprite) {
        const sprite = view.code.sprite,
          size = Math.min(
            3,
            60 /
              Math.max(
                sprite.rows.length,
                ...sprite.rows.map((row) => row.length),
              ),
          );
        sprite.rows.forEach((row, sy) =>
          row.forEach((pixel, sx) => {
            if (pixel > 0) {
              ctx.fillStyle =
                sprite.colors[(pixel - 1) % sprite.colors.length] ?? "#ffad54";
              ctx.fillRect(
                x + 197 + sx * size,
                y + 180 + sy * size,
                size,
                size,
              );
            }
          }),
        );
      }
    } else if (phase === "TESTING" && build.report) {
      build.report.checks.forEach((check, index) => {
        drawText(
          ctx,
          `${check.ok ? "✓" : "×"} ${check.name}`,
          x + 16,
          y + 178 + index * 25,
          w - 32,
          15,
          check.ok ? "#a8edbb" : "#ffab97",
        );
      });
    } else {
      fit(
        ctx,
        failed
          ? `CAUGHT A BUG: ${failed.detail}`
          : "The world stays live during checks",
        x + 16,
        y + 180,
        w - 32,
        3,
        16,
        14,
        failed ? "#ffab97" : "#a8edbb",
      );
    }
  }
  const selected =
    phase === "STREAMER_APPROVAL" && round?.winner !== null
      ? round?.cards[round.winner ?? 0]
      : undefined;
  if (selected && age < 3500) {
    const y = slots.center.y + Math.min(0, (age - 300) / 10);
    panel(ctx, slots.center.x, y, slots.center.w, slots.center.h);
    drawText(ctx, "WINNING IDEA", 416, y + 21, 370, 17, "#ffbd78", true);
    fit(ctx, selected.title, 416, y + 45, 370, 1, 21, 17, "#fff1d7");
  }
  if ((phase === "FAILED" || phase === "ROLLED_BACK") && age < 700) {
    ctx.fillStyle = `rgba(255,74,45,${0.14 * (1 - age / 700)})`;
    ctx.fillRect(0, 0, 1200, 675);
  }
  if (hall) {
    const x = slots.right.x,
      y = slots.right.y,
      w = slots.right.w;
    panel(ctx, x, y, w, 460);
    fit(
      ctx,
      "HALL OF PATCHES",
      x + 16,
      y + 34,
      w - 32,
      1,
      23,
      19,
      "#ffbd78",
      true,
    );
    (view.patches ?? view.mods).slice(-5).forEach((mod, i) => {
      fit(
        ctx,
        `${i + 1}. ${mod.title}`,
        x + 16,
        y + 76 + i * 74,
        w - 32,
        2,
        19,
        16,
        "#fff1d7",
        true,
      );
      fit(
        ctx,
        creditSummary(ctx, mod.credits, w - 32),
        x + 16,
        y + 120 + i * 74,
        w - 32,
        1,
        16,
        14,
        "#a8edbb",
      );
    });
  }
  panel(ctx, slots.ticker.x, slots.ticker.y, slots.ticker.w, slots.ticker.h);
  const entries = view.patches ?? view.mods;
  const entry = entries.length
    ? entries[Math.floor(now / 6500) % entries.length]!
    : undefined;
  font(ctx, 17);
  const prefix = entry ? `✦  ${entry.title} — ` : "✦  CHATFORGE  ·  ";
  const suffix = entry
    ? creditSummary(ctx, entry.credits, 1116 - measure(ctx, prefix))
    : "Chat imagines it. Codex builds it.";
  fit(ctx, prefix + suffix, 40, 651, 1116, 1, 17, 17, "#f6ead7");
  ctx.restore();
}
