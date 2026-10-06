import { register } from "node:module";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
register(new URL("../apps/desktop/test/helpers/engineering-settings-imports.mjs", import.meta.url));
const { catalogs } = await import("../packages/i18n/src/index.ts");
const { ENGINEERING_SHORTCUTS } = await import("../packages/shared/src/engineering-shortcuts.ts");
// 对实际发货的所有语言内容和 Skill 绑定建立基线，避免只凭版本号猜测变化。
const signatures = Object.fromEntries(ENGINEERING_SHORTCUTS.map(({ action, skill }) => [action,
  createHash("sha256").update(JSON.stringify([skill, Object.entries(catalogs).map(([locale, catalog]) => [locale, catalog.coding[action], catalog.coding.prompts[action], catalog.coding.skillGuides[action]])])).digest("hex")
]));
const output = `// 由 scripts/shortcut-preset-manifest.mjs 生成；预置内容变更后重新生成。\nexport const SHORTCUT_PRESET_SIGNATURES: Record<string, string> = ${JSON.stringify(signatures, null, 2)};\n`;
const target = new URL("../packages/shared/src/shortcut-preset-manifest.ts", import.meta.url);
if (process.argv.includes("--check")) {
  if (await readFile(target, "utf8") !== output) throw new Error("快捷按钮预置基线过期，请运行 node scripts/shortcut-preset-manifest.mjs");
} else await writeFile(target, output, "utf8");
