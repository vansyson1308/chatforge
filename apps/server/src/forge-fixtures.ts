import type { ForgeCard } from "../../../packages/shared/src/forge.js";
export const goodMod = `export function register(api) { api.registerCommand("!spark", () => { api.fx.banner("SPARK"); api.fx.particles(500,200,"#ffd66b",12); }, {cooldownSec:1}); } export const forgeTest={commands:["!spark"],expect:{fx:["banner","particles"],minEffects:2}};`;
export const testCards: ForgeCard[] = [1, 2, 3].map((i) => ({
  title: `Spark ${i}`,
  pitch: "A burst of sparks for the crowd",
  visualHook: "Golden particles flash",
  acceptance: ["Banner and particles after !spark"],
  commands: ["!spark"],
  credits: [],
  suggestion: true,
  feasibility: "fx.particles and registerCommand",
  risk: "low",
}));
