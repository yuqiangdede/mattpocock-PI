import { createRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { CodingActionSettingsPage } from "../../apps/desktop/src/features/extensions/CodingActionSettingsPage";
import { loadCodingActions } from "../../apps/desktop/src/features/extensions/coding-action-state";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";
import { until, check, click, fill, select } from "./skill-shortcuts-helpers";

declare global {
  var codingActionsProbe: () => Promise<{ nativeSettings: unknown }>;
  var codingActionsRestored: (checkpoint: { nativeSettings: unknown }) => Promise<unknown>;
  interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } }
}
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
const input = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
const type = (value: string) => fixture("typeText", value);

async function initialize() {
  await i18n.use(initReactI18next).init({ lng: "zh-CN", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  const params = new URLSearchParams(location.search), sessionId = params.get("sessionId")!, projectPath = params.get("projectA")!;
  const nativeSettings = await api.getSettings();
  await api.setProject(projectPath);
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ settings: nativeSettings, activeSessionId: sessionId,
    sessions: sessions.map(session => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  await loadCodingActions();
  const root = createRoot(document.getElementById("root")!);
  return { root, nativeSettings, sessionId, projectPath,
    settings: () => root.render(<I18nextProvider i18n={i18n}><CodingActionSettingsPage /></I18nextProvider>),
    composer: () => root.render(<I18nextProvider i18n={i18n}><Composer variant="home" /></I18nextProvider>),
  };
}
async function finishProvider() {
  await fixture("releaseProvider");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
}

globalThis.codingActionsProbe = async () => {
  const view = await initialize();
  const initial = (await api.getCodingActions()).configuration;
  check(initial.actions.find(action => action.id === "code-review")?.prompt === "", "旧显式空提示词迁移丢失");
  check(initial.actions.find(action => action.id === "create-spec")?.prompt === null, "旧 null 提示词迁移丢失");
  check(initial.actions.some(action => action.prompt === "旧版自定义提示词"), "旧自定义提示词迁移丢失");
  const originalConfirm = window.confirm; window.confirm = () => true;
  view.settings(); await until(() => input("Action 名称") && !input("Action 名称").disabled);
  await select("选择 Action", "code-review", "代码审查");
  await fill("Action 名称", "快速审查", type);
  await fill("可选提示词", "检查当前项目改动。", type);
  await fill("Action 说明", "这段说明不应发送给模型", type);
  await click("上移"); await click("保存");
  await until(async () => (await api.getCodingActions()).configuration.actions.some(action => action.label === "快速审查"));
  check(!document.body.textContent?.includes("显示位置") && !document.body.textContent?.includes("更多分组"), "出现页面布局配置");
  input("启用 Action").click(); await click("保存");
  view.composer(); await until(() => editor());
  check(![...document.querySelectorAll("button")].some(button => button.textContent?.trim() === "快速审查"), "停用 Action 仍然显示");
  view.settings(); await until(() => input("Action 名称"));
  await select("选择 Action", "code-review", "快速审查（已停用）");
  input("启用 Action").click(); await click("保存");
  await click("新建 Action"); await fill("Action 名称", "临时审查", type); await fill("Skill id", "code-review", type); await click("保存");
  await until(async () => (await api.getCodingActions()).configuration.actions.some(action => action.label === "临时审查"));
  view.composer(); await until(() => editor());
  await click("更多 Actions"); await until(() => document.querySelector('[role="menuitem"]'));
  check(document.body.textContent?.includes("临时审查"), "More Actions 没有消费 Registry");
  await fixture("pressKey", "Escape"); await until(() => !document.querySelector('[role="menuitem"]'));
  const before = await fixture("snapshot") as { prompts: number };
  check(before.prompts === 0, "设置或菜单渲染触发了执行");
  useAppStore.setState({ composerPrefill: { sessionId: view.sessionId, text: "检验 Action 当前会话请求", fileReferences: [] } });
  await until(() => readEditorValue(editor()) === "检验 Action 当前会话请求");
  await fixture("releaseLaunch"); await click("快速审查");
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 1);
  await finishProvider();
  let executed = await fixture("snapshot") as { transformed: string; skillIds: string[]; skillBodies: string[] };
  check(executed.transformed.includes('in order: "code-review"'), "Action 未进入原生 Skill 调用链");
  check(executed.transformed.includes("检验 Action 当前会话请求") && !executed.transformed.includes("这段说明不应发送"), "调用上下文错误");
  check(executed.skillIds.includes("code-review"), "Pi Runtime 未加载 Skill");
  await fixture("updateActionSkill", { path: view.projectPath, body: "UPDATED_ACTION_SKILL_BODY" });
  const configBeforeUpdate = JSON.stringify((await api.getCodingActions()).configuration);
  await fixture("reset"); await fixture("releaseLaunch"); await click("快速审查");
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 2);
  await finishProvider();
  executed = await fixture("snapshot") as typeof executed;
  check(executed.skillBodies.includes("UPDATED_ACTION_SKILL_BODY"), "Skill 更新后没有加载最新内容");
  check(JSON.stringify((await api.getCodingActions()).configuration) === configBeforeUpdate, "Skill 更新要求重存 Action");
  view.settings(); await until(() => input("Action 名称"));
  await select("选择 Action", "unused", "临时审查"); await click("删除 Action"); await click("保存");
  await fill("导入 Actions JSON", JSON.stringify({ schemaVersion: 1, actions: [{ id: "missing", label: "缺失 Skill", skillId: "missing-action-skill" }] }), type);
  await click("校验并导入");
  view.composer(); await until(() => editor());
  await until(() => document.body.textContent?.includes("Skill missing / unavailable"));
  const missing = [...document.querySelectorAll<HTMLButtonElement>(".coding-shortcuts-primary button")].find(button => button.textContent?.trim() === "缺失 Skill")!;
  check(missing.disabled, "缺失 Skill 没有可用性诊断"); missing.click();
  check((await fixture("snapshot") as { prompts: number }).prompts === 2, "缺失 Skill 仍然执行");
  await fixture("corruptActionConfig"); await loadCodingActions(true);
  await until(() => document.body.textContent?.includes("已回退默认"));
  check((await fixture("readActionConfig")) === "{invalid-actions", "损坏配置被静默覆盖");
  useAppStore.setState({ composerPrefill: { sessionId: view.sessionId, text: "普通 Chat 在配置损坏时仍然可用", fileReferences: [] } });
  await until(() => readEditorValue(editor()) === "普通 Chat 在配置损坏时仍然可用");
  await fixture("reset"); await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 3); await finishProvider();
  view.settings(); await until(() => input("Action 名称")); await click("恢复默认 Actions");
  await select("选择 Action", "code-review", "代码审查");
  await fill("Action 名称", "最终审查", type);
  await click("保存");
  await until(async () => (await api.getCodingActions()).configuration.actions.some(action => action.label === "最终审查"));
  check(JSON.stringify(await api.getSettings()) === JSON.stringify(view.nativeSettings), "Action 配置修改了原生设置");
  window.confirm = originalConfirm; view.root.unmount();
  return { nativeSettings: view.nativeSettings };
};
globalThis.codingActionsRestored = async checkpoint => {
  const view = await initialize(); view.settings(); await until(() => input("Action 名称"));
  await select("选择 Action", "code-review", "最终审查");
  check(input("Action 名称").value === "最终审查", "重启丢失 Action 配置");
  check(JSON.stringify(await api.getSettings()) === JSON.stringify(checkpoint.nativeSettings), "重启修改原生设置");
  view.root.unmount();
  return { ok: true, actions: true, migrated: true, crud: true, order: true, enabled: true, executed: true, latestSkill: true, missing: true, corruptFallback: true, ordinaryChat: true, persisted: true, nativeSettingsPreserved: true };
};
