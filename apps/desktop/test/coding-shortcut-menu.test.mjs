import { readMattSkillBundle } from "../../../scripts/lib/matt-skills.mjs";
import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { readFileSync } from "node:fs";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultCodingActions } = await import("@pi-desktop/shared");
const { codingShortcutMenu } = await import("../src/features/coding/coding-shortcut-menu.ts");
const labels = { ask: "咨询下一步", diagnose: "Bug 排查" };
const skill = skillId => ({ name: skillId, kind: "skill", skillId, title: skillId });

test("Visual grilling default prompt carries interview, recovery and non-invasive rules", async () => {
  const { visualGrillingDefaultPrompt } = await import("../src/features/coding/visual-grilling-prompt.ts");
  const zh = visualGrillingDefaultPrompt("zh-CN");
  assert.match(zh, /grill-with-ui/);
  assert.match(zh, /事件监听与断点恢复/);
  assert.match(zh, /不要直接修改业务代码/);
  const en = visualGrillingDefaultPrompt("en");
  assert.match(en, /grill-with-ui/);
  assert.match(en, /listener/);
  assert.notEqual(zh, en);
});

test("Bundled visual discussion Skill is available as a complete package", () => {
  const bundle = readMattSkillBundle(new URL("../resources/skills/matt", import.meta.url));
  const skillPackage = bundle.packages.find(entry => entry.id === "grill-with-ui");
  assert.ok(skillPackage);
  assert.deepEqual(new Set(skillPackage.files.map(file => file.path)), new Set(["SKILL.md", "server.mjs", "page.html", "LICENSE"]));
  assert.match(skillPackage.files.find(file => file.path === "SKILL.md").content, /name: grill-with-ui/);
  assert.match(skillPackage.files.find(file => file.path === "server.mjs").content, /events.jsonl/);
});

test("Initialize leads Ask next step and stays out of More without rewriting saved actions", () => {
  const configuration = createDefaultCodingActions();
  const original = structuredClone(configuration);
  const menu = codingShortcutMenu(configuration, [skill("setup-matt-pocock-skills")],
    { ...labels, skillLabels: { initialize: "初始化" } });
  assert.equal(menu.primary[0].action.skillId, "setup-matt-pocock-skills");
  assert.equal(menu.primary[0].action.label, "初始化");
  assert.equal(menu.primary[1].action.skillId, "ask-matt");
  assert.ok(!menu.more.some(row => row.action.skillId === "setup-matt-pocock-skills"));
  assert.deepEqual(configuration, original);
});

test("Existing six-action profiles regain common shortcuts without changing persisted data", () => {
  const configuration = createDefaultCodingActions();
  const snapshot = structuredClone(configuration);
  const { primary, more } = codingShortcutMenu(configuration, [skill("retro"), skill("retro"), skill("ask-matt"), skill("implement"), { name: "help", kind: "builtin", title: "Help" }], labels);
  assert.equal(primary.length, 6);
  assert.equal(primary[0].action.skillId, "setup-matt-pocock-skills");
  assert.equal(primary[1].action.skillId, "ask-matt");
  assert.equal(primary.at(-1).action.skillId, "diagnosing-bugs");
  assert.ok(!primary.some(row => row.action.skillId === "codebase-design"));
  assert.deepEqual(more.map(row => row.action.skillId), ["to-spec", "codebase-design", "to-tickets", "retro", "implement-spec"]);
  assert.deepEqual(configuration, snapshot);
});

test("Empty configurations retain common entries; custom overflow and prompt overrides survive", () => {
  assert.equal(codingShortcutMenu({ schemaVersion: 1, actions: [] }, [], labels).primary.length, 3);
  const configuration = createDefaultCodingActions();
  configuration.actions.push({ id: "my-ask", label: "My next step", skillId: "ask-matt", prompt: "My prompt" });
  configuration.actions.push({ id: "second-ask", label: "Second ask", skillId: "ask-matt", prompt: "" });
  const { primary, more } = codingShortcutMenu(configuration, [], labels);
  assert.equal(primary[1].action.prompt, "My prompt");
  assert.equal(primary[1].configured, true);
  const secondAsk = more.find(row => row.action.id === "second-ask");
  assert.ok(secondAsk);
  assert.equal(secondAsk.action.prompt, "");
  assert.ok(more.some(row => row.action.id === "design"));
});

test("Disabled actions are not silently reintroduced through the Skill catalog", () => {
  const configuration = createDefaultCodingActions();
  configuration.actions[2].enabled = false;
  configuration.actions[4].enabled = false;
  configuration.actions.push({ id: "my-diagnose", label: "Debug", skillId: "diagnosing-bugs", enabled: false });
  configuration.actions.push({ id: "disabled-spec", skillId: "implement-spec", label: "Disabled", enabled: false });
  const { primary, more } = codingShortcutMenu(configuration, [skill("implement"), skill("diagnosing-bugs"), skill("custom-skill")], labels);
  assert.equal(primary.at(-1).action.enabled, false);
  assert.ok(!more.some(row => row.action.skillId === "implement"));
  assert.deepEqual(more.map(row => row.action.skillId), ["to-spec", "to-tickets"]);
});

const { codingShortcutTooltip } = await import("../src/features/coding/coding-shortcut-tooltip.ts");
const { createInstance } = await import("i18next");
const { catalogs } = await import("@pi-desktop/i18n");
test("Known Skill tooltips have exactly two localized usage and example lines", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: catalogs["zh-CN"] }, en: { translation: catalogs.en } } });
  const { ENGINEERING_SHORTCUTS } = await import("@pi-desktop/shared");
  const catalog = ENGINEERING_SHORTCUTS.map(entry => ({ ...skill(entry.skill), description: "Raw English description" }));
  for (const locale of ["zh-CN", "en"]) {
    await i18n.changeLanguage(locale);
    const copy = catalogs[locale];
    for (const entry of ENGINEERING_SHORTCUTS) {
      const shortcut = { configured: false, action: { id: `catalog:${entry.skill}`, skillId: entry.skill, label: entry.skill } };
      const lines = codingShortcutTooltip(shortcut, catalog, i18n.t.bind(i18n)).split("\n");
      assert.equal(lines.length, 2, `${locale}: ${entry.skill}`);
      assert.ok(!lines[0].startsWith(`${copy.codingActions.tooltipWhen}：`));
      assert.ok(!lines[1].startsWith(`${copy.codingActions.tooltipExample}：`));
      assert.ok(lines[0].includes(copy.coding.skillGuides[entry.action].when));
      assert.ok(lines[1].includes(copy.coding.skillGuides[entry.action].example));
      assert.ok(!lines.join(" ").includes("Raw English description"));
      assert.ok(!lines.join(" ").includes(copy.coding.skillGuides[entry.action].purpose));
    }
  }
});

test("Custom descriptions and unknown Skills use the same two-line format", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: catalogs["zh-CN"] }, en: { translation: catalogs.en } } });
  const t = i18n.t.bind(i18n);
  const configured = codingShortcutTooltip({ configured: true, action: { id: "custom", skillId: "diagnosing-bugs", label: "Debug", description: "用户说明" } }, [], t);
  assert.deepEqual(configured.split("\n"), ["用户说明", `${catalogs["zh-CN"].coding.skillGuides.diagnose.example}`]);
  const unknown = codingShortcutTooltip({ configured: false, action: { id: "other", skillId: "other", label: "Other" } }, [{ ...skill("other"), description: "Original user skill description" }], t);
  assert.deepEqual(unknown.split("\n"), ["Original user skill description", "使用「Other」处理当前需求。"]);
  await i18n.changeLanguage("en");
  assert.deepEqual(codingShortcutTooltip({ configured: false, action: { id: "other", skillId: "other", label: "Other" } }, [], t).split("\n"), [
    "Other",
    "Use Other for the current task.",
  ]);
});

const { ENGINEERING_SHORTCUTS, CodingActionRegistry } = await import("@pi-desktop/shared");
const { executeCodingAction } = await import("../src/features/coding/execute-coding-action.ts");
test("All installed Matt shortcuts have localized labels and prepare editable drafts", async () => {
  const configuration = createDefaultCodingActions();
  const original = structuredClone(configuration);
  const catalog = [...ENGINEERING_SHORTCUTS.map(entry => skill(entry.skill)), skill("pi-desktop/imagegen"), skill("unrelated-skill"), skill("retro")];
  for (const locale of ["zh-CN", "en"]) {
    const copy = catalogs[locale];
    const skillLabels = Object.fromEntries(ENGINEERING_SHORTCUTS.map(entry => [entry.action, copy.coding[entry.action]]));
    const menu = codingShortcutMenu(configuration, catalog, { ...labels, skillLabels });
    assert.equal(menu.primary.length, 6);
    assert.equal(menu.more.length, ENGINEERING_SHORTCUTS.length - menu.primary.length);
    assert.ok(!menu.primary.some(row => row.action.skillId === "codebase-design"));
    assert.ok(menu.more.some(row => row.action.skillId === "codebase-design"));
    const allIds = [...menu.primary, ...menu.more].map(row => row.action.skillId);
    assert.equal(new Set(allIds).size, ENGINEERING_SHORTCUTS.length);
    assert.deepEqual(new Set(allIds), new Set(ENGINEERING_SHORTCUTS.map(entry => entry.skill)));
    for (const row of [menu.primary[0], ...menu.more]) {
      const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === row.action.skillId);
      assert.equal(row.action.label, row.configured ? configuration.actions.find(a => a.id === row.action.id)?.label : copy.coding[entry.action]);
      assert.doesNotThrow(() => new CodingActionRegistry({ schemaVersion: 1, actions: [row.action] }));
      let draft = "现有请求";
      await executeCodingAction(row.action.id, {
        sessionId: "", projectPath: "", configuration: { schemaVersion: 1, actions: [row.action] },
        catalog: async () => catalog, isCurrent: () => true,
        defaultPrompt: () => copy.coding.prompts[entry.action], readLiveDraft: () => draft,
        applyDraft: text => { draft = text; },
      });
      assert.ok(draft.includes(row.action.skillId));
      assert.ok(draft.includes(copy.coding.prompts[entry.action]));
      assert.ok(draft.includes("现有请求"));
    }
  }
  assert.deepEqual(configuration, original);
});

const { groupCodingShortcuts } = await import("../src/features/coding/coding-shortcut-menu.ts");
test("Curated Matt skills have localized launcher entries while pruned skills remain catalog-only", () => {
  const bundle = readMattSkillBundle(new URL("../resources/skills/matt", import.meta.url));
  const catalog = bundle.packages.map(entry => skill(entry.id));
  const menu = codingShortcutMenu(createDefaultCodingActions(), catalog, labels);
  const ids = [...menu.primary, ...menu.more].map(row => row.action.skillId);
  assert.equal(new Set(ids).size, ids.length);
  const expected = new Set(ENGINEERING_SHORTCUTS.map(entry => entry.skill).filter(id => bundle.packages.some(p => p.id === id)));
  assert.deepEqual(new Set(ids), expected);
  assert.ok(!menu.more.some(row => row.action.skillId === "scaffold-exercises"));
  assert.ok(!menu.more.some(row => row.action.skillId === "writing-beats"));
  assert.ok(!menu.more.some(row => row.action.skillId === "migrate-to-shoehorn"));
  const configuration = createDefaultCodingActions();
  configuration.actions.push({ id: "disabled-spec", skillId: "implement-spec", label: "Disabled", enabled: false });
  const filtered = codingShortcutMenu(configuration, catalog, labels);
  assert.ok(!filtered.more.some(row => row.action.skillId === "implement-spec"));
  for (const entry of ENGINEERING_SHORTCUTS) {
    for (const locale of ["en", "zh-CN"]) {
      const copy = catalogs[locale].coding;
      assert.ok(copy[entry.action], `${locale} label: ${entry.skill}`);
      assert.ok(copy.prompts[entry.action], `${locale} prompt: ${entry.skill}`);
      for (const field of ["when", "purpose", "example"]) assert.ok(copy.skillGuides[entry.action]?.[field], `${locale} ${field}: ${entry.skill}`);
    }
  }
});

test("Lifecycle groups cover Matt skills once, omit empty groups and preserve custom order", () => {
  const configuration = createDefaultCodingActions();
  configuration.actions.push({ id: "custom-a", label: "自定义 A", skillId: "local-a", prompt: "保留 A" });
  configuration.actions.push({ id: "custom-b", label: "自定义 B", skillId: "local-b", prompt: "保留 B" });
  const catalog = ENGINEERING_SHORTCUTS.map(entry => skill(entry.skill));
  const menu = codingShortcutMenu(configuration, catalog, labels);
  const original = structuredClone(menu.more);
  const groups = groupCodingShortcuts(menu.more);
  assert.deepEqual(groups.map(group => group.id), ["exploration", "design", "development", "maintenance", "delivery", "custom"]);
  const find = skillId => groups.find(group => group.shortcuts.some(row => row.action.skillId === skillId))?.id;
  for (const [skillId, group] of [["grilling", "exploration"], ["prototype", "design"], ["tdd", "development"], ["improve-codebase-architecture", "maintenance"], ["handoff", "delivery"], ["retro", "delivery"]]) assert.equal(find(skillId), group);
  assert.deepEqual(groups.at(-1).shortcuts.map(row => row.action.id), ["custom-a", "custom-b"]);
  const ids = groups.flatMap(group => group.shortcuts.map(row => row.action.id));
  assert.equal(new Set(ids).size, menu.more.length);
  assert.deepEqual(new Set(ids), new Set(menu.more.map(row => row.action.id)));
  assert.deepEqual(menu.more, original);
  assert.deepEqual(groupCodingShortcuts([]), []);
  for (const locale of ["zh-CN", "en"]) for (const group of groups) assert.ok(catalogs[locale].codingActions.groups[group.id]);
});
