import "./style.css";

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
let current: Message | undefined;
let previous: Message | undefined;
let receivedAt = 0;
let connected = false;
let meteorEnabled = true;
let joinSequence = 0;
let lastFrame = performance.now();

function connect(): void {
  const socket = new WebSocket(`ws://${location.hostname}:3000`);
  socket.onopen = () => {
    connected = true;
  };
  socket.onclose = () => {
    connected = false;
    setTimeout(connect, 1500);
  };
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(String(event.data)) as Message;
      if (!data.world || !Array.isArray(data.world.entities)) return;
      previous = current;
      current = data;
      receivedAt = performance.now();
      for (const fx of data.fx ?? []) {
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
  if (event.repeat) return;
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
function pixelSprite(kind: string, custom?: Sprite): HTMLCanvasElement {
  const key = kind + JSON.stringify(custom ?? null);
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
  atlas.set(key, sprite);
  return sprite;
}
function background(time: number): void {
  const sky = ctx.createLinearGradient(0, 0, 0, 675);
  sky.addColorStop(0, "#101b2b");
  sky.addColorStop(0.6, "#273142");
  sky.addColorStop(1, "#754333");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1200, 675);
  ctx.fillStyle = "#f7b653";
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(970, 145, 45, 0, Math.PI * 2);
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
  ctx.fillRect(0, 492, 1200, 183);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = i % 3 === 0 ? "#405044" : "#334740";
    const x = (i * 173) % 1200;
    const y = 510 + ((i * 73) % 160);
    ctx.fillRect(x, y, 12 + (i % 13), 3);
  }
}
function keep(): void {
  ctx.fillStyle = "#172329";
  ctx.beginPath();
  ctx.ellipse(600, 438, 144, 28, 0, 0, Math.PI * 2);
  ctx.fill();
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
}
function render(time: number): void {
  const dt = Math.min(50, time - lastFrame);
  lastFrame = time;
  void dt;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1920, 1080);
  if (transparent) {
    ctx.translate(0, 550);
    ctx.scale(1.6, 0.75);
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
  keep();
  const alpha = Math.min(1, Math.max(0, (time - receivedAt) / (1000 / 30)));
  const old = new Map(previous?.world.entities.map((e) => [e.id, e]) ?? []);
  const entities = [...(current?.world.entities ?? [])].sort(
    (a, b) => a.y - b.y,
  );
  for (const entity of entities) {
    const prev = old.get(entity.id) ?? entity;
    const x = prev.x + (entity.x - prev.x) * alpha,
      y = prev.y + (entity.y - prev.y) * alpha;
    if (entity.team === "projectile") {
      ctx.fillStyle = "#ffe396";
      ctx.fillRect(x - 4, y - 4, 8, 8);
      continue;
    }
    const sprite = pixelSprite(entity.kind, current?.sprites[entity.kind]);
    const size =
      entity.kind === "slime-king" ? 62 : entity.team === "hero" ? 30 : 28;
    ctx.fillStyle = "#14202588";
    ctx.beginPath();
    ctx.ellipse(x, y + 8, size * 0.45, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(sprite, x - size / 2, y - size, size, size);
    if (entity.viewer) {
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#101b23";
      ctx.fillText(entity.viewer, x + 1, y - size - 5);
      ctx.fillStyle = "#f9e8c6";
      ctx.fillText(entity.viewer, x, y - size - 6);
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
  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    if (!fx) continue;
    const progress = (time - fx.start) / fx.duration;
    if (progress > 1) {
      effects.splice(i, 1);
      continue;
    }
    const x = Number(fx.x ?? 600),
      y = Number(fx.y ?? 337);
    if (fx.type === "telegraph") {
      ctx.strokeStyle = `rgba(255,143,69,${0.5 + Math.sin(time / 100) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, Number(fx.radius ?? 50), 0, Math.PI * 2);
      ctx.stroke();
    }
    if (fx.type === "damage") {
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffd58b";
      ctx.fillText(
        String(Math.round(Number(fx.amount))),
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
    if (fx.type === "banner") {
      ctx.textAlign = "center";
      ctx.font = "bold 25px monospace";
      ctx.fillStyle = "#19242ddd";
      ctx.fillRect(330, 105, 540, 42);
      ctx.fillStyle = "#ffca7c";
      ctx.fillText(String(fx.text ?? ""), 600, 134, 510);
    }
  }
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillStyle = "#101a25db";
  ctx.fillRect(24, 22, 245, 95);
  ctx.fillStyle = "#f2a750";
  ctx.font = "bold 23px monospace";
  ctx.fillText("FORGE KEEP", 38, 50);
  ctx.font = "bold 13px monospace";
  ctx.fillStyle = "#eadbc2";
  ctx.fillText(
    `WAVE ${current?.world.wave ?? 0}  •  KEEP ${Math.max(0, Math.round(current?.world.keepHp ?? 100))}%`,
    38,
    74,
  );
  ctx.fillStyle = connected ? "#8fd3a4" : "#e88a75";
  ctx.fillText(connected ? "● LIVE SIMULATION" : "● CONNECTING", 38, 98);
  ctx.textAlign = "right";
  ctx.font = "12px monospace";
  ctx.fillStyle = "#e8d7b1";
  ctx.fillText("J JOIN  ·  S SUB  ·  R RAID  ·  M MOD", 1175, 650);
  requestAnimationFrame(render);
}
connect();
requestAnimationFrame(render);
