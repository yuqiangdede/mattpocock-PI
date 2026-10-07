import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultCodingActions } = await import("@pi-desktop/shared");
const { codingShortcutMenu } = await import("../src/features/coding/coding-shortcut-menu.ts");
const labels = { ask: "咨询下一步", diagnose: "Bug 排查" };
const skill = skillId => ({ name: skillId, kind: "skill", skillId, title: skillId });

test("Existing six-action profiles regain common shortcuts without changing persisted data", () => {
  const configuration = createDefaultCodingActions();
  const snapshot = structuredClone(configuration);
  const { primary, more } = codingShortcutMenu(configuration, [skill("retro"), skill("retro"), skill("ask-matt"), skill("implement"), { name: "help", kind: "builtin", title: "Help" }], labels);
  assert.equal(primary.length, 8);
  assert.equal(primary[0].action.skillId, "ask-matt");
  assert.equal(primary.at(-1).action.skillId, "diagnosing-bugs");
  assert.deepEqual(more.map(row => row.action.skillId), ["retro"]);
  assert.deepEqual(configuration, snapshot);
});

test("Empty configurations retain common entries; custom overflow and prompt overrides survive", () => {
  assert.equal(codingShortcutMenu({ schemaVersion: 1, actions: [] }, [], labels).primary.length, 2);
  const configuration = createDefaultCodingActions();
  configuration.actions.push({ id: "my-ask", label: "My next step", skillId: "ask-matt", prompt: "My prompt" });
  configuration.actions.push({ id: "second-ask", label: "Second ask", skillId: "ask-matt", prompt: "" });
  const { primary, more } = codingShortcutMenu(configuration, [], labels);
  assert.equal(primary[0].action.prompt, "My prompt");
  assert.equal(primary[0].configured, true);
  assert.equal(more[0].action.id, "second-ask");
  assert.equal(more[0].action.prompt, "");
});

test("Disabled actions are not silently reintroduced through the Skill catalog", () => {
  const configuration = createDefaultCodingActions();
  configuration.actions[4].enabled = false;
  configuration.actions.push({ id: "my-diagnose", label: "Debug", skillId: "diagnosing-bugs", enabled: false });
  const { primary, more } = codingShortcutMenu(configuration, [skill("implement"), skill("diagnosing-bugs"), skill("custom-skill")], labels);
  assert.equal(primary.at(-1).action.enabled, false);
  assert.ok(!more.some(row => row.action.skillId === "implement"));
  assert.deepEqual(more.map(row => row.action.skillId), []);
});

const { codingShortcutTooltip } = await import("../src/features/coding/coding-shortcut-tooltip.ts");
const { createInstance } = await import("i18next");
const { catalogs } = await import("@pi-desktop/i18n");
test("Known skill tooltips use localized timing, purpose and example instead of raw English catalog descriptions", async () => {
  const i18n = createInstance();
  await i18n.init({ lng: "zh-CN", resources: { "zh-CN": { translation: catalogs["zh-CN"] }, en: { translation: catalogs.en } } });
  const row = { configured: false, action: { id: "catalog:diagnosing-bugs", skillId: "diagnosing-bugs", label: "Bug 排查", description: "Raw English description" } };
  const catalog = [{ ...skill("diagnosing-bugs"), description: "Raw English description" }];
  const tooltip = codingShortcutTooltip(row, catalog, i18n.t.bind(i18n));
  for (const part of Object.values(catalogs["zh-CN"].coding.skillGuides.diagnose)) assert.ok(tooltip.includes(part));
  assert.ok(!tooltip.includes("Raw English"));
  await i18n.changeLanguage("en");
  assert.ok(codingShortcutTooltip(row, catalog, i18n.t.bind(i18n)).includes(catalogs.en.coding.skillGuides.diagnose.when));
});

test("Explicit configured descriptions and unknown native skill descriptions remain verbatim", () => {
  const t = () => { throw new Error("No built-in guide expected"); };
  assert.equal(codingShortcutTooltip({ configured: true, action: { id: "custom", skillId: "diagnosing-bugs", label: "Debug", description: "用户说明" } }, [], t), "用户说明");
  assert.equal(codingShortcutTooltip({ configured: false, action: { id: "other", skillId: "other", label: "Other" } }, [{ ...skill("other"), description: "Original user skill description" }], t), "Original user skill description");
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
    assert.equal(menu.primary.length, 8);
    assert.equal(menu.more.length, 18);
    const allIds = [...menu.primary, ...menu.more].map(row => row.action.skillId);
    assert.equal(new Set(allIds).size, ENGINEERING_SHORTCUTS.length);
    assert.deepEqual(new Set(allIds), new Set(ENGINEERING_SHORTCUTS.map(entry => entry.skill)));
    for (const row of menu.more) {
      const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === row.action.skillId);
      assert.equal(row.action.label, copy.coding[entry.action]);
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
  for (const [skillId, group] of [["grill-me", "exploration"], ["prototype", "design"], ["tdd", "development"], ["triage", "maintenance"], ["handoff", "delivery"], ["retro", "delivery"]]) assert.equal(find(skillId), group);
  assert.deepEqual(groups.at(-1).shortcuts.map(row => row.action.id), ["custom-a", "custom-b"]);
  const ids = groups.flatMap(group => group.shortcuts.map(row => row.action.id));
  assert.equal(new Set(ids).size, menu.more.length);
  assert.deepEqual(new Set(ids), new Set(menu.more.map(row => row.action.id)));
  assert.deepEqual(menu.more, original);
  assert.deepEqual(groupCodingShortcuts([]), []);
  for (const locale of ["zh-CN", "en"]) for (const group of groups) assert.ok(catalogs[locale].codingActions.groups[group.id]);
});
