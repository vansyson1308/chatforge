export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Label extends Rect {
  text: string;
  priority: number;
}
export function placeLabels(labels: Label[], blocked: Rect[]): Label[] {
  const placed: Label[] = [];
  const overlaps = (a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 + 4 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2 + 3;
  for (const label of labels.sort((a, b) => b.priority - a.priority)) {
    if (
      label.x - label.width / 2 < 0 ||
      label.x + label.width / 2 > 1200 ||
      label.y < 0
    )
      continue;
    if (
      !blocked.some((rect) => overlaps(label, rect)) &&
      !placed.some((rect) => overlaps(label, rect))
    )
      placed.push(label);
  }
  return placed;
}
export function appearance(viewer: string) {
  let hash = 2166136261;
  for (const char of viewer) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const variant = hash % 256;
  return {
    variant,
    hat: (variant >>> 4) % 4,
    coat: [
      "#3d91a2",
      "#9a67b9",
      "#bd654e",
      "#638b51",
      "#c49a44",
      "#597bb1",
      "#b86490",
      "#72a898",
    ][variant % 8]!,
    hair: ["#e6ba6d", "#684934", "#dad4c3", "#cc703f"][(variant >>> 3) % 4]!,
    skin: ["#f0cda5", "#bf8c65", "#88563e", "#e4ac8a"][(variant >>> 6) % 4]!,
    trim: ["#ffe29a", "#dce9ff", "#b9f1c0", "#ffa888"][(variant >>> 4) % 4]!,
  };
}
