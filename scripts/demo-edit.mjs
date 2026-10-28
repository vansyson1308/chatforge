import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const name = process.argv[2];
if (!name) throw Error("Usage: pnpm demo:edit <take directory>");
const root = resolve("runtime/recordings"),
  take = resolve(
    name.includes("/") || name.includes("\\") ? name : join(root, name),
  );
if (!relative(root, take) || relative(root, take).startsWith(".."))
  throw Error("Take must be inside runtime/recordings");
const timeline = JSON.parse(
  await readFile(join(take, "timeline.json"), "utf8"),
);
const local = parseEnv(await readFile(".env", "utf8"));
if (!local.OPENAI_API_KEY)
  throw Error("OPENAI_API_KEY is required in .env for narration");
const auth = { Authorization: `Bearer ${local.OPENAI_API_KEY}` };
const models = await fetch("https://api.openai.com/v1/models", {
  headers: auth,
});
if (!models.ok) throw Error(`OpenAI model list HTTP ${models.status}`);
const available = (await models.json()).data.map((model) => model.id);
const model = ["gpt-4o-mini-tts", "tts-1"].find((candidate) =>
  available.includes(candidate),
);
if (!model) throw Error("No supported TTS model found in account model list");
const stages = timeline.stages,
  first = (stage) => stages.find((item) => item.stage === stage)?.atMs / 1000;
const has = (stage) => Number.isFinite(first(stage));
const sim = timeline.source === "SIM ONLY DRY TAKE";
if (
  !sim &&
  ["COLLECTING", "VOTING", "BUILDING", "TESTING", "SHOWCASE"].some(
    (stage) => !has(stage),
  )
)
  throw Error(
    "A real take must contain collecting, voting, building, testing and showcase",
  );
const at = (stage, fallback = 0) =>
  has(stage)
    ? first(stage) + (timeline.recordingOffsetMs ?? 0) / 1000
    : fallback;
const duration = timeline.durationMs / 1000;
const safe = (start, length, speed) =>
  Math.max(0, Math.min(start, duration - length * speed - 1));
const scenes = [
  {
    stage: "SHOWCASE",
    start: at("SHOWCASE") + 4,
    length: 12,
    speed: 1,
    title: "ChatForge - Twitch chat ships the game. Live.",
    narration:
      "What if Twitch chat could ship the game while you stream? Meet ChatForge.",
  },
  {
    stage: "COLLECTING",
    start: at("COLLECTING"),
    length: 12,
    speed: 4,
    narration:
      "Viewers pitch ideas in chat. Local rules and moderation keep unapproved ideas off the broadcast.",
  },
  {
    stage: "VOTING",
    start: at("VOTING"),
    length: 10,
    speed: 4,
    narration:
      "The Producer turns community ideas into cards. Chat votes on what happens next.",
  },
  {
    stage: "BUILDING",
    start: at("BUILDING"),
    length: 16,
    speed: 4,
    narration:
      "Codex writes a real game mod in a restricted workspace. The stream sees the code and sprite come together.",
  },
  {
    stage: "TESTING",
    start: at("TESTING"),
    length: 8,
    speed: 1,
    narration:
      "Gatekeeper validates the mod and runs deterministic simulations before it can go live.",
  },
  {
    stage: "SHOWCASE",
    start: at("SHOWCASE"),
    length: 14,
    speed: 1,
    narration:
      "The winning idea ships into the running game, credits its contributors and gets a live showcase.",
  },
  {
    stage: "architecture",
    start: 0,
    length: 18,
    speed: 1,
    narration:
      "The server owns the game. Generated mods run inside QuickJS, and the overlay receives read-only snapshots.",
  },
  {
    stage: "BUILDING",
    start: at("BUILDING"),
    length: 20,
    speed: 1,
    title: "CODEX BUILT CHATFORGE + THE LIVE BUILDER",
    narration:
      "Codex built ChatForge from an empty folder in one main thread. The Codex SDK is also the Builder inside the product.",
  },
  {
    stage: "SHOWCASE",
    start: at("SHOWCASE") + 5,
    length: 12,
    speed: 1,
    title: "github.com/vansyson1308/chatforge",
    narration:
      "Every round leaves a mark. Twitch chat doesn't just play the game. Chat ships the game.",
  },
];
const relativeFile = (path) =>
  relative(process.cwd(), path).replaceAll("\\", "/").replaceAll(":", "\\:");
const text = async (file, value) => {
  await writeFile(join(take, file), value, "utf8");
  return relativeFile(join(take, file));
};
const run = (file, args) =>
  new Promise((ok, bad) => {
    const child = spawn(file, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let err = "";
    child.stderr.on("data", (x) => {
      err = (err + String(x)).slice(-3000);
    });
    child.on("error", bad);
    child.on("exit", (code) =>
      code === 0 ? ok() : bad(Error(`${file} exit ${code}: ${err}`)),
    );
  });
const ffmpeg = "C:/ProgramData/chocolatey/bin/ffmpeg.exe";
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  const caption = s.narration.replace(/(.{1,70})(?:\s|$)/g, "$1\n").trim();
  let cached = false;
  try {
    cached =
      (await readFile(join(take, `caption-${i}.txt`), "utf8")) === caption &&
      (await stat(join(take, `narration-${i}.mp3`))).size > 0;
  } catch {
    /* Generate missing audio. */
  }
  if (!cached) {
    const audio = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        voice: "alloy",
        input: s.narration,
        response_format: "mp3",
      }),
    });
    if (!audio.ok)
      throw Error(`OpenAI TTS HTTP ${audio.status} (scene ${i + 1})`);
    await writeFile(
      join(take, `narration-${i}.mp3`),
      Buffer.from(await audio.arrayBuffer()),
    );
  }
  await text(
    `caption-${i}.txt`,
    s.narration.replace(/(.{1,70})(?:\s|$)/g, "$1\n").trim(),
  );
  if (s.title) await text(`title-${i}.txt`, s.title);
}
await text(
  "provenance.txt",
  sim
    ? "SIM-ONLY DRY TAKE - no Twitch chat recorded"
    : "Viewers tagged SIM are a labelled simulated crowd; @vansyson1308 is a real Twitch account.",
);
await text("speed.txt", "x4 - time compressed");
const font = "C\\:/Windows/Fonts/arial.ttf";
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i],
    start = safe(s.start, s.length, s.speed),
    clip = s.length * s.speed;
  const graph = [],
    inputs = ["-y", "-filter_complex_threads", "2"];
  if (s.stage === "architecture") {
    inputs.push(
      "-loop",
      "1",
      "-i",
      "docs/media/architecture.png",
      "-i",
      join(take, `narration-${i}.mp3`),
    );
    graph.push(
      `[0:v]scale=1920:1080,trim=duration=${s.length},setpts=PTS-STARTPTS[base]`,
    );
  } else {
    inputs.push(
      "-ss",
      String(start),
      "-i",
      join(take, "overlay.webm"),
      "-ss",
      String(start),
      "-i",
      join(take, "chat.webm"),
      "-i",
      join(take, `narration-${i}.mp3`),
    );
    graph.push(
      `[0:v]trim=duration=${clip},setpts=(PTS-STARTPTS)/${s.speed},scale=1344:756,pad=1920:1080:0:110:color=0x101e2d[ov]`,
    );
    graph.push(
      `[1:v]trim=duration=${clip},setpts=(PTS-STARTPTS)/${s.speed},crop=iw/2:ih:iw/4:0,scale=576:756[chat]`,
    );
    graph.push(`[ov][chat]overlay=1344:110:shortest=1[base]`);
  }
  const caption = relativeFile(join(take, `caption-${i}.txt`)),
    provenance = relativeFile(join(take, "provenance.txt"));
  let f = `[base]drawtext=fontfile='${font}':textfile='${caption}':fontcolor=white:fontsize=31:line_spacing=5:x=(w-text_w)/2:y=885:box=1:boxcolor=black@0.78:boxborderw=12,drawtext=fontfile='${font}':textfile='${provenance}':fontcolor=white:fontsize=20:x=(w-text_w)/2:y=1035`;
  if (s.speed > 1)
    f += `,drawtext=fontfile='${font}':textfile='${relativeFile(join(take, "speed.txt"))}':fontcolor=white:fontsize=27:x=35:y=35:box=1:boxcolor=black@0.8:boxborderw=8`;
  if (s.title)
    f += `,drawtext=fontfile='${font}':textfile='${relativeFile(join(take, `title-${i}.txt`))}':fontcolor=0xffbb66:fontsize=37:x=(w-text_w)/2:y=35:box=1:boxcolor=black@0.8:boxborderw=8`;
  if (sim && s.stage !== "architecture" && !has(s.stage))
    f += `,drawtext=fontfile='${font}':text='STAGE NOT RECORDED':fontcolor=white:fontsize=30:x=50:y=80`;
  graph.push(`${f},setsar=1,fps=30,format=yuv420p[v]`);
  const ai = s.stage === "architecture" ? 1 : 2;
  graph.push(
    `[${ai}:a]apad,atrim=duration=${s.length},asetpts=PTS-STARTPTS[a]`,
  );
  console.log(`Rendering scene ${i + 1}/${scenes.length}: ${s.stage}`);
  await run(ffmpeg, [
    ...inputs,
    "-filter_complex",
    graph.join(";"),
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-threads",
    "2",
    "-crf",
    "23",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-t",
    String(s.length),
    join(take, `segment-${i}.mp4`),
  ]);
}
await writeFile(
  join(take, "concat.txt"),
  scenes.map((_, i) => `file 'segment-${i}.mp4'`).join("\n"),
);
await run(ffmpeg, [
  "-y",
  "-f",
  "concat",
  "-safe",
  "1",
  "-i",
  join(take, "concat.txt"),
  "-c",
  "copy",
  "-movflags",
  "+faststart",
  join(take, "chatforge-demo.mp4"),
]);
await run(ffmpeg, [
  "-y",
  "-ss",
  "2",
  "-i",
  join(take, "chatforge-demo.mp4"),
  "-frames:v",
  "1",
  "-vf",
  "scale=1280:720",
  join(take, "chatforge-thumbnail.png"),
]);
await run(ffmpeg, [
  "-y",
  "-i",
  join(take, "chatforge-demo.mp4"),
  "-vf",
  "fps=1/10,scale=480:270,tile=4x4",
  "-frames:v",
  "1",
  join(take, "contact-sheet.png"),
]);
console.log(
  `DONE ${join(take, "chatforge-demo.mp4")} ${(await stat(join(take, "chatforge-demo.mp4"))).size} bytes`,
);
