import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("Coding Actions 呈现独立入口，渲染不会执行或调用 Host", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: fileURLToPath(new URL("../../../cache/coding-action-ssr", import.meta.url)),
    configFile: false, logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  let requests = 0, executions = 0;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    location: { origin: "http://localhost" }, addEventListener() {}, removeEventListener() {},
    piDesktop: { on: () => () => {}, invoke: () => { requests++; throw new Error("渲染不应调用 Host"); } },
  } });
  t.after(() => { if (original) Object.defineProperty(globalThis, "window", original); else delete globalThis.window; });
  const { CodingWorkbench } = await server.ssrLoadModule("/src/features/coding/CodingWorkbench.tsx");
  const { en } = await server.ssrLoadModule(fileURLToPath(new URL("../../../packages/i18n/src/locales/en/index.ts", import.meta.url)));
  const i18n = createInstance(); await i18n.init({ lng: "en", resources: { en: { translation: en } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(CodingWorkbench, { disabled: false, error: null, onExecute: () => { executions++; }, onSelectSkill: () => { executions++; }, onSelectPrompt: () => { executions++; } })));
  for (const key of ["implement", "code-review"]) assert.ok(html.includes(en.codingActions.defaults[key]));
  assert.ok(!html.includes(`>${en.codingActions.configure}</button>`), "configuration is available through Settings only");
  assert.ok(html.includes(en.codingActions.visualRequirements), "direct visual requirements entry");
  assert.ok(!html.includes("coding-requirements-split"));
  assert.ok(html.includes(en.codingActions.moreTooltipWhen), "More has concise help");
  assert.ok(html.includes(en.codingActions.commitTooltipWhen), "Commit code has concise help");
  assert.ok(html.includes(en.codingActions.visualTooltipWhen), "Visual requirements entry has concise help");
  assert.ok(html.includes(en.codingActions.tooltipWhen), "Skill shortcuts include usage");
  assert.ok(html.includes(en.codingActions.tooltipExample), "Skill shortcuts include examples");
  assert.ok(html.includes(en.codingActions.commitCode));
  assert.ok(!html.includes(`>${en.codingActions.interactionImage}</button>`), "image prompt lives in the closed More menu");
  assert.ok(html.includes("coding-shortcuts-secondary"), "second row contains document workflow actions");
  assert.ok(html.indexOf(en.codingActions.diagnose) < html.indexOf(en.codingActions.more), "More follows Diagnose in the primary row");
  assert.ok(html.indexOf(`>${en.codingActions.commitCode}</button>`) < html.indexOf(`>${en.codingActions.more}</button>`), "Commit precedes More in the primary row");
  assert.ok(html.includes(en.codingActions.askNext));
  assert.ok(html.includes(en.coding.initialize));
  assert.ok(html.indexOf(`aria-label="${en.coding.initialize}"`) < html.indexOf(`aria-label="${en.codingActions.askNext}"`));
  assert.ok(html.includes(en.codingActions.diagnose));
  assert.ok(html.includes(en.codingActions.more));
  const orderedLabels = [en.coding.initialize, en.codingActions.askNext, en.codingActions.visualRequirements,
    en.codingActions.defaults.implement, en.codingActions.defaults["code-review"],
    en.codingActions.diagnose, en.codingActions.commitCode, en.codingActions.more];
  const positions = orderedLabels.map(label => html.indexOf(`>${label}</button>`));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])), "Primary actions follow the engineering order");
  const secondaryLabels = [
    en.codingActions.requirementsSpec,
    en.codingActions.architectureDesign,
    en.codingActions.detailedDesign,
    en.codingActions.apiSpec,
    en.codingActions.databaseDesign,
    en.codingActions.mergeConvert,
  ];
  for (const label of secondaryLabels) {
    assert.ok(html.includes(`>${label}</button>`), `Second row contains ${label}`);
  }
  const secondaryPositions = secondaryLabels.map(label => html.indexOf(`>${label}</button>`));
  assert.ok(secondaryPositions.every((position, index) => position >= 0 && (index === 0 || position > secondaryPositions[index - 1])), "Secondary actions follow documentation sequence");
  assert.ok(!html.includes(en.coding.requirements.action), "Composer must not expose requirements confirmation");
  assert.ok(!html.includes(en.coding.formal), "不再显示工程流程面板入口");
  assert.doesNotMatch(html, /当前阶段|下一阶段|完成百分比/);
  assert.equal(requests, 0); assert.equal(executions, 0);
  const { api } = await server.ssrLoadModule("/src/lib/api.ts");
  const originalLoad = api.getCodingActions;
  const configuration = { schemaVersion: 1, actions: [], promptActions: [
    { id: "commit-code", label: "My commit", prompt: "Custom build checks" },
    { id: "summary", label: "My summary", prompt: "Summarize changes" },
    { id: "hidden", label: "Hidden prompt", prompt: "Do not show", enabled: false },
  ] };
  api.getCodingActions = async () => ({ configuration });
  t.after(() => { api.getCodingActions = originalLoad; });
  const { loadCodingActions } = await server.ssrLoadModule("/src/features/extensions/coding-action-state.ts");
  await loadCodingActions(true);
  const customized = renderToStaticMarkup(createElement(I18nextProvider, { i18n }, createElement(CodingWorkbench,
    { disabled: false, error: null, onExecute() {}, onSelectSkill() {}, onSelectPrompt() {} })));
  const secondary = customized.slice(customized.indexOf('class="coding-shortcuts coding-shortcuts-primary"'));
  assert.ok(secondary.includes("My commit"));
  assert.ok(!secondary.includes(`>${en.codingActions.interactionImage}</button>`), "saved configuration keeps image prompt in More");
  assert.ok(secondary.includes("My summary"));
  assert.ok(secondary.indexOf(">My commit</button>") < secondary.indexOf(">My summary</button>"), "custom actions follow commit");
  assert.ok(!secondary.includes("Hidden prompt"));
  assert.ok(secondary.includes("aria-haspopup"), "More shares the unified row");
  assert.match(secondary, /<button[^>]*>My commit<\/button>/);
  assert.ok(!secondary.match(/<button[^>]*disabled[^>]*>My commit<\/button>/), "plain prompts remain available with an empty Skill catalog");
});

test("Coding Actions zh-CN 两排按钮呈现与顺序正确", async t => {
  const server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    cacheDir: fileURLToPath(new URL("../../../cache/coding-action-ssr", import.meta.url)),
    configFile: false, logLevel: "silent", server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    esbuild: { jsx: "automatic" }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)) } },
  });
  t.after(() => server.close());
  const { CodingWorkbench } = await server.ssrLoadModule("/src/features/coding/CodingWorkbench.tsx");
  const { zhCN } = await server.ssrLoadModule(fileURLToPath(new URL("../../../packages/i18n/src/locales/zh-CN/index.ts", import.meta.url)));
  const { createDefaultCodingActions } = await server.ssrLoadModule("@pi-desktop/shared");
  const { api } = await server.ssrLoadModule("/src/lib/api.ts");
  const { loadCodingActions } = await server.ssrLoadModule("/src/features/extensions/coding-action-state.ts");
  api.getCodingActions = async () => ({ configuration: createDefaultCodingActions(zhCN.codingActions.defaults) });
  await loadCodingActions(true);
  const i18n = createInstance(); await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } } });
  const html = renderToStaticMarkup(createElement(I18nextProvider, { i18n },
    createElement(CodingWorkbench, { disabled: false, error: null, onExecute: () => {}, onSelectSkill: () => {}, onSelectPrompt: () => {} })));

  // 第一排：初始化、咨询、需求讨论、实现、代码审查、Bug排查、提交代码、更多
  const row1Expected = ["初始化", "咨询", "需求讨论", "实现", "代码审查", "Bug排查", "提交代码", "更多"];
  for (const label of row1Expected) {
    assert.ok(html.includes(`>${label}</button>`), `Row 1 should include ${label}`);
  }
  const row1Positions = row1Expected.map(label => html.indexOf(`>${label}</button>`));
  assert.ok(row1Positions.every((pos, idx) => pos >= 0 && (idx === 0 || pos > row1Positions[idx - 1])), "Row 1 buttons follow exact sequence");

  // 更多里面的需求讨论配置文案为“需求讨论-文本”
  assert.equal(zhCN.codingActions.discussRequirementsText, "需求讨论-文本");
  assert.equal(zhCN.codingActions.visualRequirements, "需求讨论");

  // 第二排：需求文档、总体设计文档、概要设计文档、接口文档、数据库设计、测试方案、测试报告
  const row2Expected = ["需求文档", "总设文档", "概设文档", "接口文档", "数据库设计", "合并并转换格式"];
  for (const label of row2Expected) {
    assert.ok(html.includes(`>${label}</button>`), `Row 2 should include ${label}`);
  }
  for (const label of ["测试方案", "测试报告"]) assert.ok(!html.includes(`>${label}</button>`), `${label} must be removed`);
  const row2Positions = row2Expected.map(label => html.indexOf(`>${label}</button>`));
  assert.ok(row2Positions.every((pos, idx) => pos >= 0 && (idx === 0 || pos > row2Positions[idx - 1])), "Row 2 buttons follow exact sequence");
});
