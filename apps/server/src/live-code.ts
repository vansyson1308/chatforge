import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";

export interface CodePreview {
  lines: string[];
  sprite?: { rows: number[][]; colors: string[] };
}
const allowed = new Set(
  "export function const let return if else for of true false null api state defineEnemy defineProjectile defineHeroWeapon defineProp defineHat register registerCommand on every onSchedule schedule spawn query rules get set fx banner text ring beam lightning flash particles telegraph impact weather sky shake sfx random grid palette sprite team hp speed damage behavior scale cooldownSec expect commands events minEffects".split(
    " ",
  ),
);

/** Drop arbitrary strings/comments and identifiers so viewer text and secrets cannot become code captions. */
export function previewSource(source: string): CodePreview {
  const grid =
    /\bgrid\s*:\s*\[([\s\S]{0,4096})/u.exec(source)?.[1]?.split("]")[0] ?? "";
  const rows = [...grid.matchAll(/["']([.a-zA-Z0-9]{2,32})["']/gu)]
    .slice(0, 32)
    .map((m) => m[1]!);
  const symbols = [...new Set(rows.join("").replaceAll(".", ""))].slice(0, 8);
  const colors = [...source.matchAll(/#[0-9a-fA-F]{6}\b/gu)]
    .slice(0, 8)
    .map((m) => m[0]);
  const result: CodePreview = {
    lines: source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .split(/\r?\n/u)
      .slice(-14)
      .map((line) =>
        line
          .replace(/\/\/.*$/u, "")
          .replace(/(["'`])(?:\\.|(?!\1).)*\1/gu, '"…"')
          .replace(/[\p{L}_$][\p{L}\p{N}_$]*/gu, (word) =>
            allowed.has(word) ? word : "symbol",
          )
          .replace(/\d{5,}/gu, "0")
          .replace(/[^\x20-\x7e…]/gu, "")
          .slice(0, 120),
      ),
  };
  if (rows.length && symbols.length && colors.length)
    result.sprite = {
      rows: rows.map((row) =>
        Array.from(row, (c) => (c === "." ? 0 : symbols.indexOf(c) + 1)),
      ),
      colors,
    };
  return result;
}

export async function readCandidatePreview(
  directory: string,
  id: string,
): Promise<CodePreview | undefined> {
  if (!/^[a-z][a-z0-9_-]{0,39}$/u.test(id)) return;
  const mods = resolve(directory, "mods"),
    file = join(mods, `${id}.js`);
  try {
    if (
      (await lstat(mods)).isSymbolicLink() ||
      (await lstat(file)).isSymbolicLink()
    )
      return;
    const actual = await realpath(file);
    if (actual.toLowerCase() !== file.toLowerCase()) return;
    const info = await lstat(actual);
    if (!info.isFile() || info.size > 24576) return;
    return previewSource(await readFile(actual, "utf8"));
  } catch {
    return;
  }
}
