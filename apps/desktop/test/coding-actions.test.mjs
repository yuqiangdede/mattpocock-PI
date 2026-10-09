import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createDefaultCodingActions, CodingActionRegistry, resolveCodingAction, moveCodingAction, validateCodingActions, migrateEngineeringActions, migrateShortcutActions } = await import("@pi-desktop/shared");
const { CodingActionStore } = await import("../electron/main/extensions/coding-action-store.ts");
const { executeCodingAction } = await import("../src/features/coding/execute-coding-action.ts");

async function fixture(t) {
  const root = fileURLToPath(new URL("../../../cache/coding-action-tests/", import.meta.url));
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, "case-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, store: new CodingActionStore(directory) };
}
const catalog = skillId => [{ name: skillId, kind: "skill", skillId, title: skillId }];

test("prefixed native Skill selection keeps the editable draft and saved action", async () => {
  const configuration = createDefaultCodingActions();
  const before = structuredClone(configuration);
  let draft = "Keep the existing request";
  await executeCodingAction("code-review", {
    sessionId: "session", projectPath: "project", configuration,
    catalog: async () => [{ name: "skill:code-review", kind: "skill", skillId: "code-review", title: "Code review" }],
    isCurrent: () => true, defaultPrompt: () => "Review the changes",
    readLiveDraft: () => draft, applyDraft: text => { draft = text; },
  });
  assert.equal(draft, "/skill:code-review Review the changes\n\nKeep the existing request");
  assert.deepEqual(configuration, before);
});

test("默认仅配置六个独立编码 Actions，不展开整个 Skill Catalog", () => {
  const config = createDefaultCodingActions();
  assert.deepEqual(config.actions.map(action => action.label), ["Discuss requirements", "Create specification", "Technical design", "Create tickets", "Implement", "Code review"]);
  assert.equal(new CodingActionRegistry(config).list(true).length, 6);
  assert.doesNotMatch(JSON.stringify(config), /position|layout|stage|workflow|body|artifact/i);
  config.actions[0].label = "本地修改";
  assert.equal(createDefaultCodingActions().actions[0].label, "Discuss requirements");
});
test("Registry 排序、enabled、重复 Skill 引用与无前置阶段约束", () => {
  const config = createDefaultCodingActions();
  config.actions[5].order = 0; config.actions[0].order = 10; config.actions[1].enabled = false;
  const registry = new CodingActionRegistry(config);
  assert.equal(registry.list(true)[0].id, "code-review");
  assert.ok(!registry.list(true).some(action => action.id === "create-spec"));
  assert.equal(resolveCodingAction("code-review", registry, catalog("code-review")).content, "/code-review");
  assert.throws(() => resolveCodingAction("create-spec", registry, catalog("to-spec")), /停用/);
});
test("Resolver 消费原生目录的有效 Skill，不重建来源优先级", () => {
  const registry = new CodingActionRegistry(createDefaultCodingActions());
  const selected = { name: "code-review", skillId: "code-review", title: "当前项目覆盖", kind: "skill" };
  const resolved = resolveCodingAction("code-review", registry, [selected]);
  assert.deepEqual(resolved.command, selected);
  assert.throws(() => resolveCodingAction("code-review", registry, []), /Skill missing/);
  assert.throws(() => resolveCodingAction("missing", registry, []), /不存在/);
});
test("配置拒绝 Skill 正文、页面布局、Workflow DSL、重复 id 与无效值", () => {
  for (const extra of [{ body: "SKILL.md" }, { position: "primary" }, { stage: "review" }, { order: -1 }, { enabled: "yes" }]) {
    const config = createDefaultCodingActions(); Object.assign(config.actions[0], extra);
    assert.throws(() => validateCodingActions(config), /无效/);
  }
  const duplicate = createDefaultCodingActions(); duplicate.actions.push({ ...duplicate.actions[0] });
  assert.throws(() => validateCodingActions(duplicate), /无效/);
  assert.throws(() => validateCodingActions({ schemaVersion: 2, actions: [] }), /无效/);
});
test("旧提示词迁移保留自定义、null、空值与必要辅助动作", () => {
  const config = migrateEngineeringActions({ engineeringShortcutPrompts: { discovery: "讨论登录", review: "", spec: null, diagnose: "检查故障" } });
  assert.equal(config.actions.find(action => action.id === "discuss-requirements").prompt, "讨论登录");
  assert.equal(config.actions.find(action => action.id === "code-review").prompt, "");
  assert.equal(config.actions.find(action => action.id === "create-spec").prompt, null);
  assert.equal(config.actions.find(action => action.id === "legacy:diagnose").skillId, "diagnosing-bugs");
});
test("未发布旧快捷配置转 Action，仅保留内容和顺序", () => {
  const config = migrateShortcutActions({ schemaVersion: 1, buttons: [
    { id: "matt:review", presetId: "review", name: "先审查", binding: { skillId: "code-review", source: "user", sourceId: "project" }, prompt: "", enabled: false, position: "more", group: "review" },
    { id: "custom:1", name: "我的实现", binding: { skillId: "implement" }, note: "说明", prompt: "执行请求", enabled: true },
  ] });
  assert.equal(config.actions[0].id, "matt:review"); assert.equal(config.actions[0].enabled, false);
  assert.equal(config.actions[1].description, "说明");
  assert.doesNotMatch(JSON.stringify(config), /position|group|source/);
});
test("旧配置保留重复 Skill 的独立 Action id，未知版本不静默迁移", () => {
  const rows = [{ id: "matt:review", presetId: "review", binding: { skillId: "code-review" } }, { id: "custom:review", name: "二次审查", presetId: "review", binding: { skillId: "code-review" } }];
  const config = migrateShortcutActions({ schemaVersion: 1, buttons: rows });
  assert.deepEqual(config.actions.map(action => action.id), ["matt:review", "custom:review"]);
  assert.equal(resolveCodingAction("custom:review", new CodingActionRegistry(config), catalog("code-review")).content, "/code-review");
  assert.throws(() => migrateShortcutActions({ schemaVersion: 2, buttons: rows }));
});
test("持久化、重启、顺序调整和禁用状态可验证", async t => {
  const { directory, store } = await fixture(t);
  const initial = await store.load();
  const moved = moveCodingAction(initial.configuration, "code-review", -1);
  moved.actions.find(action => action.id === "implement").enabled = false;
  await store.save(moved);
  const restarted = await new CodingActionStore(directory).load();
  assert.deepEqual(restarted.configuration, moved);
  assert.ok((await readdir(join(store.directory, "coding-action-backups"))).length > 0);
});
test("迁移幂等，原文件和来源备份保留", async t => {
  const { store } = await fixture(t);
  let reads = 0;
  const first = await store.load(async () => { reads++; return { engineeringShortcutPrompts: { implement: "旧请求" } }; });
  assert.equal(first.configuration.actions.find(action => action.id === "implement").prompt, "旧请求");
  await store.load(() => { throw new Error("不应再次读取旧配置"); });
  assert.equal(reads, 1);
  const backups = await readdir(join(store.directory, "coding-action-backups"));
  assert.match(await readFile(join(store.directory, "coding-action-backups", backups[0]), "utf8"), /旧请求/);
});
test("损坏配置回退内存默认且不覆盖，明确恢复先保全原始字节", async t => {
  const { store } = await fixture(t);
  await mkdir(store.directory, { recursive: true });
  const corrupt = Buffer.from([0xff, 0x7b, 0x7d]); await writeFile(store.file, corrupt);
  const snapshot = await store.load();
  assert.equal(snapshot.recoveryRequired, true); assert.equal(snapshot.configuration.actions.length, 6);
  assert.deepEqual(await readFile(store.file), corrupt);
  await assert.rejects(() => store.save(createDefaultCodingActions()));
  await store.reset();
  const backups = await readdir(join(store.directory, "coding-action-backups"));
  assert.deepEqual(await readFile(join(store.directory, "coding-action-backups", backups[0])), corrupt);
});
test("备份失败不覆盖有效配置，读取故障不阻塞启动", async t => {
  const { store } = await fixture(t);
  const first = await store.load(); const original = await readFile(store.file, "utf8");
  await writeFile(join(store.directory, "coding-action-backups"), "阻塞备份目录");
  await assert.rejects(() => store.save(first.configuration));
  assert.equal(await readFile(store.file, "utf8"), original);
  const failedRead = await new CodingActionStore(join(store.file, "invalid-child")).load();
  assert.equal(failedRead.configuration.actions.length, 6); assert.ok(failedRead.diagnostic);
});
test("过大配置安全回退，明确恢复不将原文件全部读入内存", async t => {
  const { store } = await fixture(t);
  await store.load(); await truncate(store.file, 33 * 1024 * 1024);
  const failed = await store.load(); assert.match(failed.diagnostic, /过大/);
  await store.reset();
  const backups = await readdir(join(store.directory, "coding-action-backups"));
  assert.equal((await stat(join(store.directory, "coding-action-backups", backups[0]))).size, 33 * 1024 * 1024);
  assert.equal((await store.load()).configuration.actions.length, 6);
});
test("Actions JSON 跨数据目录保留顺序、停用、空值和 Skill 引用", async t => {
  const first = await fixture(t), second = await fixture(t);
  const config = createDefaultCodingActions();
  config.actions[0].prompt = null; config.actions[1].prompt = ""; config.actions[2].enabled = false;
  config.actions[5].order = 0;
  await first.store.save(config); await second.store.save(JSON.parse(JSON.stringify((await first.store.load()).configuration)));
  assert.deepEqual((await new CodingActionStore(second.directory).load()).configuration, config);
});
test("Action selection fills a localized editable draft without sending", async () => {
  let text = "检查当前改动", sends = 0;
  const context = {
    sessionId: "session-a", projectPath: "project-a", configuration: createDefaultCodingActions(),
    catalog: async () => catalog("code-review"), isCurrent: () => true,
    defaultPrompt: () => "审查当前代码", readLiveDraft: () => text,
    applyDraft: value => { text = value; }, send: async () => { sends++; return true; },
  };
  await executeCodingAction("code-review", context);
  assert.equal(text, "/code-review 审查当前代码\n\n检查当前改动");
  assert.equal(sends, 0);
});

test("Missing skills and stale selection preserve the draft", async () => {
  let applies = 0;
  const context = { sessionId: "a", projectPath: "p", configuration: createDefaultCodingActions(), catalog: async () => [], isCurrent: () => true,
    defaultPrompt: () => "默认提示", readLiveDraft: () => "draft", applyDraft: () => { applies++; } };
  await assert.rejects(() => executeCodingAction("invalid", context), /不存在/);
  await assert.rejects(() => executeCodingAction("implement", context), /Skill missing/);
  await assert.rejects(() => executeCodingAction("implement", { ...context, catalog: async () => catalog("implement"), isCurrent: () => false }), /已切换/);
  assert.equal(applies, 0);
});
const { CodingActionOperationController } = await import("../src/features/extensions/coding-action-operation-controller.ts");
test("诊断重试取消保留草稿，确认后才替换，保存期间重试互斥", async () => {
  const controller = new CodingActionOperationController();
  let draft = "unsaved", reads = 0, confirms = 0;
  const busy = [];
  const reload = async () => { reads++; draft = "loaded"; };
  const onBusy = value => busy.push(value);
  const onStart = () => {};
  const onError = cause => { throw cause; };
  await controller.retry(true, () => { confirms++; return false; }, reload, onBusy, onStart, onError);
  assert.equal(draft, "unsaved"); assert.equal(reads, 0); assert.equal(confirms, 1);
  let finish;
  const save = controller.run(() => new Promise(resolve => { finish = resolve; }), onBusy, onStart, onError);
  assert.equal(controller.busy, true);
  await controller.retry(true, () => { confirms++; return true; }, reload, onBusy, onStart, onError);
  assert.equal(confirms, 1); assert.equal(reads, 0); assert.equal(draft, "unsaved");
  finish(); await save;
  await controller.retry(true, () => true, reload, onBusy, onStart, onError);
  assert.equal(draft, "loaded"); assert.equal(reads, 1); assert.equal(controller.busy, false);
  assert.deepEqual(busy, [true, false, true, false, true, false]);
});
test("Registry 共享稳定排序允许编辑中的空名称，不修改输入", () => {
  const actions = [{ id: "a", label: "", skillId: "implement", order: 2 }, { id: "b", label: "B", skillId: "implement", order: 0 }, { id: "c", label: "C", skillId: "implement", order: 0 }];
  assert.deepEqual(CodingActionRegistry.sort(actions).map(action => action.id), ["b", "c", "a"]);
  assert.equal(actions[0].id, "a");
  assert.throws(() => new CodingActionRegistry({ schemaVersion: 1, actions }));
});
test("默认标签可按语言注入，已保存自定义标签不跟随语言变化", () => {
  const config = createDefaultCodingActions({ "discuss-requirements": "需求讨论" });
  assert.equal(config.actions[0].label, "需求讨论");
  config.actions[0].label = "我的讨论";
  createDefaultCodingActions();
  assert.equal(config.actions[0].label, "我的讨论");
});

test("Main 初始标签取当前语言，重启与语言切换保留保存的用户原文", async t => {
  const { directory } = await fixture(t);
  const { catalogs } = await import("@pi-desktop/i18n");
  let locale = "en";
  const store = new CodingActionStore(directory, settings => catalogs[settings?.language ?? locale].codingActions.defaults);
  const initial = await store.load(async () => ({ language: "zh-CN" }));
  assert.equal(initial.configuration.actions[0].label, "需求讨论");
  initial.configuration.actions[0].label = "我的讨论";
  initial.configuration.actions[0].prompt = "保持我的原文";
  await store.save(initial.configuration);
  locale = "en";
  const restarted = await store.load();
  assert.equal(restarted.configuration.actions[0].label, "我的讨论");
  assert.equal(restarted.configuration.actions[0].prompt, "保持我的原文");
  assert.equal((await store.reset()).actions[0].label, "Discuss requirements");
});


test("Every default action prepares a localized instruction without a session", async () => {
  const { ENGINEERING_SHORTCUTS } = await import("@pi-desktop/shared");
  const { catalogs } = await import("@pi-desktop/i18n");
  for (const locale of ["en", "zh-CN"]) for (const action of createDefaultCodingActions().actions) {
    const entry = ENGINEERING_SHORTCUTS.find(entry => entry.skill === action.skillId);
    const prompt = catalogs[locale].coding.prompts[entry.action];
    assert.ok(prompt.trim());
    let text = "";
    await executeCodingAction(action.id, { sessionId: "", projectPath: "p", configuration: createDefaultCodingActions(),
      catalog: async () => [{ ...catalog(action.skillId)[0], name: "resolved-alias" }], isCurrent: () => true,
      defaultPrompt: () => prompt, readLiveDraft: () => "", applyDraft: value => { text = value; } });
    assert.equal(text, `/resolved-alias ${prompt}`);
  }
});

test("Custom, empty and restored instructions preserve live edits and file tokens", async () => {
  for (const prompt of [undefined, null, "", "自定义指令"]) {
    const configuration = createDefaultCodingActions();
    configuration.actions[5].prompt = prompt;
    let text = "old", resolveCatalog;
    const selection = executeCodingAction("code-review", { sessionId: "a", projectPath: "p", configuration,
      catalog: () => new Promise(resolve => { resolveCatalog = resolve; }), isCurrent: () => true,
      defaultPrompt: () => "默认指令", readLiveDraft: () => text, applyDraft: value => { text = value; } });
    text = "  newer \uFFFC\n ";
    resolveCatalog(catalog("code-review"));
    await selection;
    const instruction = prompt ?? "默认指令";
    assert.equal(text, `/code-review ${instruction}${instruction ? "\n\n" : ""}  newer \uFFFC\n `);
  }
});
