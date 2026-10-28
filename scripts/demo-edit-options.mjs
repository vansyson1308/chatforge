export function parseEditArgs(args) {
  const clean = args.filter((value) => value !== "--");
  const index = clean.indexOf("--moderation-from");
  if (!clean[0] || clean[0].startsWith("--"))
    throw Error("Usage: pnpm demo:edit <take> [--moderation-from <take>]");
  if (index !== -1 && (!clean[index + 1] || clean[index + 1].startsWith("--")))
    throw Error("--moderation-from requires a take");
  if (clean.length !== (index === -1 ? 1 : 3) || (index !== -1 && index !== 1))
    throw Error("Invalid demo edit arguments");
  return {
    take: clean[0],
    moderationFrom: index === -1 ? undefined : clean[index + 1],
  };
}
export function titleBand(font, file) {
  return `,drawbox=x=0:y=785:w=1920:h=90:color=black@0.82:t=fill,drawtext=fontfile='${font}':textfile='${file}':fontcolor=0xffbb66:fontsize=37:x=(w-text_w)/2:y=810`;
}
export function moderationScene(highlights, duration, sourceTake) {
  if (
    !Number.isFinite(duration) ||
    duration < 9 ||
    !Number.isFinite(highlights.moderationAtSeconds) ||
    highlights.moderationAtSeconds < 0 ||
    highlights.moderationAtSeconds >= duration
  )
    throw Error(
      "Moderation highlights require a valid moderationAtSeconds within the source take",
    );
  return {
    stage: "moderation",
    kind: "chat",
    sourceTake,
    sourceDuration: duration,
    start: Math.min(highlights.moderationAtSeconds, duration - 9),
    length: 8,
    speed: 1,
    highlights,
    title: "Rejected at the next curation",
    narration:
      "The unsafe request was rejected at the next curation. It never entered the broadcast idea feed.",
  };
}
export function moderationChatFilter(highlights = {}) {
  const bounded = (value, fallback, min, max) =>
    Number.isFinite(value) && value >= min && value <= max
      ? Math.round(value)
      : fallback;
  const width = bounded(highlights.chatCropWidth, 1200, 480, 1920);
  const height = bounded(highlights.chatCropHeight, 650, 500, 1080);
  const rows = [
    bounded(highlights.maliciousRowY, 295, 0, height - 38),
    bounded(highlights.refusalRowY, 475, 0, height - 38),
  ];
  return (
    `crop=${width}:${height}:0:0,scale=1600:867,pad=1920:875:160:0:color=0x101e2d` +
    rows
      .map(
        (row) =>
          `,drawbox=x=175:y=${Math.max(0, Math.round((row * 867) / height) - 19)}:w=1400:h=38:color=orange@0.85:t=3`,
      )
      .join("")
  );
}
