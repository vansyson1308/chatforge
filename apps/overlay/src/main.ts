import "./style.css";
import { cue, toggleAudio } from "./audio.js";
import { drawVisualFx } from "./visual-fx.js";
import { renderSnapshotSchema } from "../../../packages/shared/src/protocol.js";
import { appearance, placeLabels, type Label } from "./presentation.js";
import {
  forgeViewSchema,
  type ForgeView,
} from "../../../packages/shared/src/forge.js";
import { drawForgeHud } from "./forge-hud.js";
import { formatCredit } from "../../../packages/shared/src/forge.js";

type Entity = {
  id: number;
  kind: string;
  team: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  viewer?: string;
  level: number;
  joined: number;
  simulated?: boolean;
  scale?: number;
  hat?: string;
};
type Fx = { type: string; [key: string]: string | number | boolean };
type Sprite = { grid: string[]; palette: Record<string, string> };
type Message = {
  world: {
    tick: number;
    wave: number;
    cycle: number;
    keepHp: number;
    entities: Entity[];
  };
  fx: Fx[];
  sprites: Record<string, Sprite>;
};
type TimedFx = Fx & { start: number; duration: number };
const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (!canvas) throw new Error("Missing canvas");
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas2D unavailable");
const ctx = context;
const transparent =
  new URLSearchParams(location.search).get("mode") === "overlay";
const effects: TimedFx[] = [];
const atlas = new Map<string, HTMLCanvasElement>();
const labelWidths = new Map<string, number>();
const looks = new Map<string, ReturnType<typeof appearance>>();
const spriteKeys = new WeakMap<Sprite, string>();
const labelFont =
  'bold 12px "Segoe UI", "Microsoft YaHei", "Yu Gothic", "Noto Sans", sans-serif';
let current: Message | undefined;
let previous: Message | undefined;
let receivedAt = 0;
let connected = false;
let meteorEnabled = true;
let joinSequence = 0;
let oldEntities = new Map<number, Entity>();
let sortedEntities: Entity[] = [];
let forge: ForgeView | undefined;
let forgeReceived = 0;
const query = new URLSearchParams(location.search),
  dev = query.get("dev") === "1";
let hall = query.get("hall") === "1";
window.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() === "h") hall = !hall;
  if (e.key.toLowerCase() === "a") switchAudio();
});
const sound = document.createElement("button");
sound.textContent = "SOUND OFF";
sound.className = "sound-toggle";
function switchAudio(): void {
  sound.textContent = toggleAudio() ? "SOUND OFF" : "SOUND ON";
}
sound.onclick = switchAudio;
if (query.get("clean") !== "1") document.body.append(sound);

function connect(): void {
  const socket = new WebSocket(
    `ws://${location.hostname}:${location.port === "5173" ? "3000" : location.port}/?client=overlay`,
  );
  socket.onopen = () => {
    connected = true;
  };
  socket.onclose = () => {
    connected = false;
    setTimeout(connect, 1500);
  };
  socket.onmessage = (event) => {
    try {
      const payload: unknown = JSON.parse(String(event.data));
      const forgeMessage = forgeViewSchema.safeParse(payload);
      if (forgeMessage.success) {
        if (
          forgeMessage.data.build?.stage === "LIVE" &&
          (forge?.build?.stage !== "LIVE" ||
            forge.build.id !== forgeMessage.data.build.id)
        ) {
          cue("anvil");
          effects.push({
            type: "particles",
            x: 600,
            y: 215,
            color: "#ffb65b",
            count: 80,
            start: performance.now(),
            duration: 2000,
          });
        }
        forge = forgeMessage.data;
        forgeReceived = performance.now();
        return;
      }
      const parsed = renderSnapshotSchema.safeParse(payload);
      if (!parsed.success) return;
      const wire = parsed.data;
      const data: Message = {
        world: {
          tick: wire.tick,
          wave: wire.wave,
          cycle: wire.cycle,
          keepHp: wire.keepHp,
          entities: wire.entities.map(
            ([
              id,
              kind,
              team,
              x,
              y,
              hp,
              maxHp,
              viewer,
              level,
              joined,
              simulated,
              scale,
              hat,
            ]) => ({
              id,
              kind,
              team,
              x,
              y,
              hp,
              maxHp,
              viewer,
              level,
              joined,
              simulated,
              scale,
              hat,
            }),
          ),
        },
        fx: wire.fx as Fx[],
        sprites: wire.sprites,
      };
      previous = current;
      current = data;
      oldEntities = new Map(
        previous?.world.entities.map((e) => [e.id, e]) ?? [],
      );
      sortedEntities = [...data.world.entities].sort((a, b) => a.y - b.y);
      canvas!.dataset.entities = String(sortedEntities.length);
      canvas!.dataset.tick = String(wire.tick);
      receivedAt = performance.now();
      for (const fx of data.fx ?? []) {
        if (fx.type === "sfx") {
          cue(String(fx.cue));
          continue;
        }
        const duration =
          typeof fx.ticks === "number"
            ? (fx.ticks * 1000) / 30
            : fx.type === "damage"
              ? 800
              : 1200;
        effects.push({ ...fx, start: receivedAt, duration });
      }
      if (effects.length > 300) effects.splice(0, effects.length - 300);
    } catch {
      /* Ignore malformed snapshots and wait for the next one. */
    }
  };
}
async function action(
  route: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`http://${location.hostname}:3000/dev/${route}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    connected = false;
  }
}
window.addEventListener("keydown", (event) => {
  if (event.repeat || !dev) return;
  if (event.key.toLowerCase() === "j")
    void action("join", { viewer: `Viewer${++joinSequence}` });
  if (event.key.toLowerCase() === "s")
    void action("event", { event: "twitch:sub", viewer: "EmberFan" });
  if (event.key.toLowerCase() === "r")
    void action("event", { event: "twitch:raid", viewer: "RaidCaptain" });
  if (event.key.toLowerCase() === "m") {
    meteorEnabled = !meteorEnabled;
    void action(meteorEnabled ? "load" : "unload", { modId: "meteor-shower" });
  }
});
function pixelSprite(
  kind: string,
  custom?: Sprite,
  viewer = "",
): HTMLCanvasElement {
  let look = looks.get(viewer);
  if (!look) {
    look = appearance(viewer);
    if (looks.size >= 1024) looks.clear();
    looks.set(viewer, look);
  }
  let customKey = custom ? spriteKeys.get(custom) : undefined;
  if (custom && !customKey) {
    customKey = JSON.stringify(custom);
    spriteKeys.set(custom, customKey);
  }
  const key = kind + (customKey ?? String(look.variant));
  const cached = atlas.get(key);
  if (cached) return cached;
  const sprite = document.createElement("canvas");
  const builtIn: Sprite =
    kind === "hero"
      ? {
          grid: [
            "...hhhh...",
            "..hssssh..",
            "..swwsws..",
            "...ssss...",
            "..bbbbbb..",
            ".bbbbbbbb.",
            ".bbbyybbb.",
            "..bbbbbb..",
            "..dd..dd..",
            ".ddd..ddd.",
          ],
          palette: {
            h: "#e6ba6d",
            s: "#f0cda5",
            w: "#2e3138",
            b: "#3d91a2",
            y: "#ffbd57",
            d: "#27333c",
          },
        }
      : {
          grid: [
            "...gggg...",
            "..gggggg..",
            ".gggggggg.",
            "ggwwggwwgg",
            "ggkkggkkgg",
            "gggggggggg",
            ".gggggggg.",
            "..gggggg..",
          ],
          palette: { g: "#9bce75", w: "#f5f2da", k: "#293a30" },
        };
  if (kind === "hero") {
    builtIn.palette.b = look.coat;
    builtIn.palette.h = look.hair;
    builtIn.palette.s = look.skin;
    builtIn.palette.y = look.trim;
    if (look.hat === 1) {
      builtIn.grid[0] = "..hhhhhh..";
      builtIn.grid[1] = ".hhhhhhhh.";
    }
    if (look.hat === 2) {
      builtIn.grid[0] = "....hh....";
      builtIn.grid[1] = "...hhhh...";
    }
    if (look.hat === 3) {
      builtIn.grid[0] = "..h....h..";
      builtIn.grid[1] = "..hhhhhh..";
    }
  }
  const spec = custom ?? builtIn;
  sprite.width = spec.grid[0]?.length ?? 1;
  sprite.height = spec.grid.length;
  const g = sprite.getContext("2d");
  if (g)
    for (let y = 0; y < spec.grid.length; y++)
      for (let x = 0; x < (spec.grid[y]?.length ?? 0); x++) {
        const color = spec.palette[spec.grid[y]?.[x] ?? ""];
        if (color) {
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      }
  if (atlas.size > 512) atlas.clear();
  atlas.set(key, sprite);
  return sprite;
}
const actorAtlases = new WeakMap<
  HTMLCanvasElement,
  Map<number, HTMLCanvasElement>
>();
function actorSprite(
  sprite: HTMLCanvasElement,
  size: number,
): HTMLCanvasElement {
  let sizes = actorAtlases.get(sprite);
  if (!sizes) {
    sizes = new Map();
    actorAtlases.set(sprite, sizes);
  }
  const found = sizes.get(size);
  if (found) return found;
  const layer = document.createElement("canvas");
  layer.width = Math.ceil(size);
  layer.height = Math.ceil(size + 16);
  const brush = layer.getContext("2d")!;
  brush.imageSmoothingEnabled = false;
  brush.fillStyle = "#14202588";
  brush.beginPath();
  brush.ellipse(size / 2, size + 8, size * 0.45, 7, 0, 0, Math.PI * 2);
  brush.fill();
  brush.drawImage(sprite, 0, 0, size, size);
  sizes.set(size, layer);
  return layer;
}
function background(time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, 675);
  sky.addColorStop(0, Math.sin(time / 90000) > 0 ? "#182a3c" : "#0b1224");
  sky.addColorStop(0.6, "#273142");
  sky.addColorStop(1, "#754333");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1200, 675);
  ctx.fillStyle = "#f7b653";
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(775, 245, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  for (let layer = 0; layer < 3; layer++) {
    ctx.fillStyle = ["#28364a", "#26313e", "#1a2931"][layer] ?? "#26313e";
    ctx.beginPath();
    ctx.moveTo(0, 470 + layer * 40);
    for (let x = 0; x <= 1200; x += 40)
      ctx.lineTo(
        x,
        330 +
          layer * 58 +
          Math.sin(x / (105 + layer * 25) + time / (18000 + layer * 5000)) *
            (45 - layer * 8),
      );
    ctx.lineTo(1200, 675);
    ctx.lineTo(0, 675);
    ctx.fill();
  }
  ctx.fillStyle = "#263635";
  ctx.fillRect(0, 455, 1200, 220);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#405044" : "#334740";
    const x = (i * 173) % 1200;
    const y = 510 + ((i * 73) % 160);
    ctx.fillRect(x, y, 12 + (i % 13), 3);
  }
}
function keep(time: number): void {
  ctx.fillStyle = "#172329";
  ctx.beginPath();
  ctx.ellipse(600, 438, 144, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  const patchCount = (forge?.patches ?? forge?.mods ?? []).length;
  for (let i = 0; i < Math.min(3, Math.floor(patchCount / 3)); i++) {
    const x = i === 0 ? 430 : i === 1 ? 724 : 465;
    ctx.fillStyle = "#33424c";
    ctx.fillRect(x, 245 - i * 18, 46, 179 + i * 18);
    ctx.fillStyle = "#70818b";
    ctx.fillRect(x - 5, 236 - i * 18, 56, 14);
    ctx.fillStyle = "#ffb44a";
    ctx.fillRect(x + 16, 280 - i * 18, 12, 18);
  }
  ctx.fillStyle = "#45515a";
  ctx.fillRect(500, 270, 200, 154);
  ctx.fillStyle = "#59636a";
  ctx.fillRect(515, 253, 170, 150);
  ctx.fillStyle = "#37444d";
  ctx.fillRect(476, 222, 62, 202);
  ctx.fillRect(662, 222, 62, 202);
  for (let x = 476; x <= 710; x += 22) {
    ctx.fillStyle = "#6c7272";
    ctx.fillRect(x, x > 540 && x < 660 ? 236 : 210, 14, 22);
  }
  ctx.fillStyle = "#202b32";
  ctx.fillRect(568, 330, 64, 94);
  ctx.fillStyle = "#b95c2d";
  ctx.fillRect(578, 340, 44, 84);
  ctx.fillStyle = "#eaa347";
  ctx.fillRect(586, 342, 3, 80);
  ctx.fillRect(608, 342, 3, 80);
  ctx.fillStyle = "#ffac49";
  ctx.fillRect(494, 290, 16, 28);
  ctx.fillRect(690, 290, 16, 28);
  ctx.fillStyle = "#df7131";
  ctx.fillRect(590, 188, 5, 70);
  ctx.fillRect(595, 190, 40, 22);
  ctx.fillStyle = "#ffd27d";
  ctx.fillRect(602, 197, 21, 5);
  for (const [i, mod] of (forge?.patches ?? forge?.mods ?? []).entries()) {
    // Stable generated emblems make every historical patch visible, including retired ones.
    const x = 510 + (i % 5) * 36,
      y = 278 + Math.floor(i / 5) * 38;
    if (y > 398) break;
    let hash = 2166136261;
    for (const c of mod.id) {
      hash ^= c.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    hash >>>= 0;
    ctx.fillStyle = ["#ffbd62", "#9fe6bc", "#b5b8fa", "#ef9d93", "#e5d987"][
      hash % 5
    ]!;
    ctx.fillRect(x, y, 30, 30);
    ctx.fillStyle = "#263342";
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 3; col++)
        if ((hash >>> ((row * 3 + col) % 30)) & 1) {
          ctx.fillRect(x + 3 + col * 4, y + 5 + row * 4, 4, 4);
          ctx.fillRect(x + 23 - col * 4, y + 5 + row * 4, 4, 4);
        }
  }
  for (const x of [502, 698]) {
    const radius = 48 + Math.sin(time / 140 + x) * 4;
    const glow = ctx.createRadialGradient(x, 303, 2, x, 303, radius);
    glow.addColorStop(0, "#ffb34a88");
    glow.addColorStop(1, "#ff7c2000");
    ctx.fillStyle = glow;
    ctx.fillRect(x - radius, 303 - radius, radius * 2, radius * 2);
    ctx.fillStyle = "#ffedb2";
    ctx.fillRect(x - 3, 295 + Math.sin(time / 80) * 2, 6, 13);
  }
}
function render(time: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1920, 1080);
  if (transparent) {
    ctx.translate(420, 500);
    ctx.scale(0.9, 0.9);
  } else ctx.scale(1.6, 1.6);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  const shake = effects.find(
    (fx) => fx.type === "shake" && time - fx.start < fx.duration,
  );
  if (shake) {
    const strength =
      Number(shake.intensity ?? 0) *
      (1 - (time - shake.start) / shake.duration);
    ctx.translate(
      Math.sin(time * 0.11) * strength,
      Math.cos(time * 0.14) * strength,
    );
  }
  if (!transparent) background(time);
  keep(time);
  const alpha = Math.min(1, Math.max(0, (time - receivedAt) / 50));
  const labels: Label[] = [];
  const credit = effects
    .filter((fx) => fx.type === "banner" && time - fx.start < fx.duration)
    .map((fx) => String(fx.text))
    .join(" ");
  for (const entity of sortedEntities) {
    const prev = oldEntities.get(entity.id) ?? entity;
    const x = prev.x + (entity.x - prev.x) * alpha,
      y = prev.y + (entity.y - prev.y) * alpha;
    if (entity.team === "projectile") {
      const custom = current?.sprites[entity.kind];
      if (custom)
        ctx.drawImage(pixelSprite(entity.kind, custom), x - 7, y - 7, 14, 14);
      else {
        ctx.fillStyle = "#ffe396";
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      continue;
    }
    const sprite = pixelSprite(
      entity.kind,
      current?.sprites[entity.kind],
      entity.viewer,
    );
    const size = (entity.team === "hero" ? 42 : 38) * (entity.scale ?? 1);
    ctx.drawImage(actorSprite(sprite, size), x - size / 2, y - size);
    if (entity.hat && current?.sprites[entity.hat])
      ctx.drawImage(
        pixelSprite(entity.hat, current.sprites[entity.hat]),
        x - 17,
        y - size - 20,
        34,
        27,
      );
    // Honest provenance stays visible even when collision avoidance hides a name.
    if (entity.simulated) {
      ctx.fillStyle = "#18202f";
      ctx.fillRect(x - 11, y + 3, 22, 12);
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#aad4ff";
      ctx.fillText("SIM", x, y + 12);
    }
    if (entity.viewer) {
      const viewerLabel = formatCredit({
        name: entity.viewer,
        source: entity.simulated ? "simulator" : "twitch",
      });
      let width = labelWidths.get(viewerLabel);
      if (width === undefined) {
        ctx.font = labelFont;
        width = ctx.measureText(viewerLabel).width + 10;
        if (labelWidths.size >= 1024) labelWidths.clear();
        labelWidths.set(viewerLabel, width);
      }
      labels.push({
        text: viewerLabel,
        x,
        y: y - size - 10,
        width,
        height: 18,
        priority:
          (credit.includes(entity.viewer) ? 1e9 : 0) +
          (current!.world.tick - entity.joined < 150 ? 1e6 + entity.id : 0) +
          entity.level * 1000 +
          entity.id,
      });
    }
    if (entity.hp < entity.maxHp) {
      ctx.fillStyle = "#1c2428";
      ctx.fillRect(x - 16, y - size - 3, 32, 3);
      ctx.fillStyle = "#d57d45";
      ctx.fillRect(
        x - 16,
        y - size - 3,
        32 * Math.max(0, entity.hp / entity.maxHp),
        3,
      );
    }
  }
  const damageRects = effects
    .filter((fx) => fx.type === "damage" && time - fx.start < fx.duration)
    .map((fx) => ({
      x: Number(fx.x),
      y: Number(fx.y) - 30 - ((time - fx.start) / fx.duration) * 35,
      width: 65,
      height: 28,
    }));
  for (const label of placeLabels(labels, damageRects)) {
    ctx.fillStyle = "#101b23dc";
    ctx.fillRect(
      label.x - label.width / 2,
      label.y - label.height / 2,
      label.width,
      label.height,
    );
    ctx.textAlign = "center";
    ctx.font =
      'bold 12px "Segoe UI", "Microsoft YaHei", "Yu Gothic", "Noto Sans", sans-serif';
    ctx.fillStyle = "#f9e8c6";
    ctx.fillText(label.text, label.x, label.y + 4);
  }
  let renderedBanner = false;
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    if (!fx) continue;
    const progress = (time - fx.start) / fx.duration;
    if (progress > 1) {
      effects.splice(i, 1);
      continue;
    }
    drawVisualFx(ctx, fx, progress, time, sortedEntities);
    const x = Number(fx.x ?? 600),
      y = Number(fx.y ?? 337);
    if (fx.type === "telegraph") {
      const radius = Number(fx.radius ?? 50);
      ctx.fillStyle = `rgba(255,103,35,${0.08 + progress * 0.16})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(
        x,
        y,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress,
      );
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(255,143,69,${0.5 + Math.sin(time / 100) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, Number(fx.radius ?? 50), 0, Math.PI * 2);
      ctx.stroke();
      const mx = x + (1 - progress) * 180,
        my = y - (1 - progress) * 340;
      const trail = ctx.createLinearGradient(mx, my, mx + 90, my - 170);
      trail.addColorStop(0, "#ffefb9");
      trail.addColorStop(0.25, "#ff9e36dd");
      trail.addColorStop(1, "#ff5b1500");
      ctx.fillStyle = trail;
      ctx.beginPath();
      ctx.moveTo(mx - 12, my + 3);
      ctx.lineTo(mx + 90, my - 170);
      ctx.lineTo(mx + 12, my - 3);
      ctx.closePath();
      ctx.fill();
      const glow = ctx.createRadialGradient(mx, my, 1, mx, my, 28);
      glow.addColorStop(0, "#fff8d6");
      glow.addColorStop(0.25, "#ffb54d");
      glow.addColorStop(1, "#ff5a1400");
      ctx.fillStyle = glow;
      ctx.fillRect(mx - 28, my - 28, 56, 56);
      ctx.fillStyle = "#fff3c9";
      ctx.beginPath();
      ctx.arc(mx, my, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffb34b";
      for (let n = 0; n < 14; n++) {
        const t = (time / 180 + n * 0.13) % 1;
        ctx.fillRect(
          mx + t * 70 + Math.sin(n * 8) * 8,
          my - t * 140,
          3 * (1 - t),
          3 * (1 - t),
        );
      }
    }
    if (fx.type === "impact") {
      ctx.fillStyle = `rgba(19,18,22,${0.6 * (1 - progress)})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 42, 16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,126,38,${1 - progress})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      if (progress < 0.18) {
        ctx.fillStyle = `rgba(255,239,189,${(1 - progress / 0.18) * 0.7})`;
        ctx.beginPath();
        ctx.arc(x, y, 20 + progress * 300, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (fx.type === "damage" || fx.type === "loot") {
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd58b";
      ctx.fillText(
        (fx.type === "loot" ? "+" : "") + String(Math.round(Number(fx.amount))),
        x,
        y - 20 - progress * 35,
      );
    }
    if (fx.type === "particles") {
      ctx.fillStyle = String(fx.color ?? "#ff9b46");
      for (let n = 0; n < Math.min(40, Number(fx.count)); n++) {
        const a = n * 2.4;
        const d = progress * (15 + n * 2);
        ctx.fillRect(
          x + Math.cos(a) * d,
          y + Math.sin(a) * d - progress * 18,
          4,
          4,
        );
      }
    }
    if (fx.type === "weather" && fx.weather === "aurora") {
      ctx.fillStyle = `rgba(92, 235, 174, ${0.11 * (1 - progress)})`;
      ctx.fillRect(0, 60 + Math.sin(time / 600) * 12, 1200, 100);
    }
    if (fx.type === "weather" && fx.weather === "meteor") {
      ctx.strokeStyle = "#ffc26d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(1000 - progress * 700, 20 + progress * 300);
      ctx.lineTo(1060 - progress * 700, -20 + progress * 300);
      ctx.stroke();
    }
    if (
      fx.type === "weather" &&
      ["rain", "snow", "ash"].includes(String(fx.weather))
    ) {
      ctx.fillStyle =
        fx.weather === "rain"
          ? "#a8d6e7aa"
          : fx.weather === "snow"
            ? "#f6fbf8cc"
            : "#e49b68aa";
      for (let n = 0; n < 100; n++) {
        const x = (n * 173 + time * 0.02) % 1200;
        const y = (n * 97 + time * (fx.weather === "rain" ? 0.4 : 0.08)) % 675;
        ctx.fillRect(
          x,
          y,
          fx.weather === "rain" ? 2 : 4,
          fx.weather === "rain" ? 14 : 4,
        );
      }
    }
    if (fx.type === "tint") {
      ctx.globalAlpha = 0.14 * (1 - progress);
      ctx.fillStyle = String(fx.color);
      ctx.fillRect(0, 0, 1200, 675);
      ctx.globalAlpha = 1;
    }
    if (
      fx.type === "banner" &&
      !renderedBanner &&
      !["BUILDING", "LIVE"].includes(forge?.build?.stage ?? "") &&
      forge?.round?.stage !== "STREAMER_APPROVAL"
    ) {
      renderedBanner = true;
      ctx.textAlign = "center";
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "#19242df5";
      ctx.fillRect(398, 125, 402, 60);
      ctx.fillStyle = "#ffca7c";
      const words = String(fx.text ?? "").split(" ");
      let row = "",
        n = 0;
      for (const word of words) {
        if (ctx.measureText(row + " " + word).width > 376 && row) {
          ctx.fillText(row, 600, 148 + n * 22);
          row = word;
          if (++n === 2) break;
        } else row += (row ? " " : "") + word;
      }
      if (n < 2) ctx.fillText(row, 600, 148 + n * 22, 376);
    }
  }
  ctx.fillStyle = "#ffb667";
  for (let n = 0; n < 32; n++) {
    const x = (n * 197 + Math.sin(time / 1500 + n) * 25) % 1200,
      y = 675 - ((time * 0.025 + n * 37) % 380);
    ctx.globalAlpha = 0.2 + 0.4 * Math.sin(n + time / 700) ** 2;
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
  if (!transparent) {
    const vignette = ctx.createRadialGradient(600, 360, 220, 600, 360, 730);
    vignette.addColorStop(0, "#050e1800");
    vignette.addColorStop(1, "#050e1888");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, 1200, 675);
  }
  ctx.restore();
  ctx.setTransform(1.6, 0, 0, 1.6, 0, 0);
  ctx.textAlign = "left";
  ctx.fillStyle = "#101a25db";
  ctx.fillRect(24, 22, 245, 95);
  ctx.fillStyle = "#f2a750";
  ctx.font = "bold 28px monospace";
  ctx.fillText("FORGE KEEP", 38, 50);
  ctx.font = "bold 18px monospace";
  ctx.fillStyle = "#eadbc2";
  ctx.fillText(
    `WAVE ${current?.world.wave ?? 0}  •  KEEP ${Math.max(0, Math.round(current?.world.keepHp ?? 100))}%`,
    38,
    74,
  );
  ctx.fillStyle = connected ? "#8fd3a4" : "#e88a75";
  ctx.fillText(
    connected
      ? `● LIVE · SEASON ${forge?.season ?? 1} · ROUND ${forge?.round?.number ?? forge?.build?.number ?? forge?.round?.id ?? forge?.build?.id ?? 0}`
      : "● CONNECTING",
    38,
    98,
    217,
  );
  ctx.textAlign = "right";
  ctx.font = "12px monospace";
  ctx.fillStyle = "#e8d7b1";
  if (dev) ctx.fillText("J JOIN  ·  S SUB  ·  R RAID  ·  M MOD", 1175, 650);
  requestAnimationFrame(render);
  if (forge) drawForgeHud(ctx, forge, time - forgeReceived, hall);
}
connect();
requestAnimationFrame(render);
