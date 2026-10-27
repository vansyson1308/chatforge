import type { ForgeCard } from "../../../packages/shared/src/forge.js";
export const goodMod =
  "export function register(api) {\n  const duck = {\n    grid: [\n      '............',\n      '.....yyyy...',\n      '....ywwyyy..',\n      '....ywkyyy..',\n      '....yyyyoooo',\n      '..y..yyyy...',\n      '.yyy.yyyyy..',\n      '.yyyyyyyyyy.',\n      '..yyyyyyyyy.',\n      '...yyyyyyy..',\n      '....oooo....',\n      '............',\n    ],\n    palette: { y: '#ffd347', w: '#fff4d1', k: '#1c2634', o: '#ff843d' },\n  };\n  api.defineEnemy('armageddon-duck', {\n    sprite: duck, team: 'hero', hp: 90, speed: 1.5, damage: 8,\n    behavior: 'guard', scale: 2,\n  });\n  function begin() {\n    if (api.state.active) return;\n    api.state.active = true;\n    api.fx.sky('storm', 9);\n    api.fx.banner('RUBBER DUCK ARMAGEDDON  -  forged by the community');\n    api.fx.text(600, 445, 'QUACK WARNING');\n    api.fx.ring(600, 510, 140, '#ffd347', 90);\n    api.sfx('thunder');\n    api.schedule('duck-impact', 90, null);\n  }\n  api.onSchedule('duck-impact', () => {\n    for (let n = 0; n < 4; n++) {\n      const x = 400 + n * 130;\n      api.spawn('armageddon-duck', x, 520);\n      api.fx.lightning(x, 50, x, 520);\n      api.fx.particles(x, 520, '#ffd347', 32);\n    }\n    api.fx.flash('#fff4d1', 8);\n    api.fx.shake(5, 20);\n    api.fx.banner('THE QUACKEN HAS LANDED! Try !spark');\n    api.sfx('anvil');\n    api.schedule('duck-aftermath', 150, null);\n  });\n  api.onSchedule('duck-aftermath', () => {\n    api.fx.sky('sunset', 5);\n    api.fx.text(600, 445, 'The keep has new defenders.');\n    api.state.active = false;\n  });\n  api.registerCommand('!spark', begin, { cooldownSec: 20 });\n  api.on('twitch:raid', begin);\n  api.every(30, () => {\n    if (!api.state.introduced) {\n      api.state.introduced = true;\n      begin();\n    }\n  });\n}\nexport const forgeTest = {\n  commands: ['!spark'], events: ['twitch:raid'],\n  expect: { spawnKinds: ['armageddon-duck'], fx: ['ring', 'lightning', 'particles', 'banner'], minEffects: 8 },\n};\n";
export const testCards: ForgeCard[] = [1, 2, 3].map((i) => ({
  title: `Spark ${i}`,
  spectacle: {
    visibleWithinSeconds: 3,
    chatInvolvement: true,
    customSprite: true,
    timedEvent: true,
    score: 10,
  },
  pitch: "A burst of sparks for the crowd",
  visualHook: "Golden particles flash",
  acceptance: ["Banner and particles after !spark"],
  commands: ["!spark"],
  credits: [],
  suggestion: true,
  feasibility: "fx.particles and registerCommand",
  risk: "low",
}));
