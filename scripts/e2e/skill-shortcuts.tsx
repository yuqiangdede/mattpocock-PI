import { createRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { ShortcutSettingsPage } from "../../apps/desktop/src/features/extensions/ShortcutSettingsPage";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { readComposerDraft } from "../../apps/desktop/src/lib/composer-draft-cache";
import { nextChipToken, readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";
import { until, check, click, fill, select } from "./skill-shortcuts-helpers";

declare global {
  var shortcutSettingsProbe: () => Promise<unknown>;
  var shortcutSettingsRestored: (checkpoint: Checkpoint) => Promise<unknown>;
  interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } }
}
type Checkpoint = { nativeSettings: unknown };
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
const input = (label: string) => document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
const params = new URLSearchParams(location.search);
const sessionId = params.get("sessionId")!;
const projectPath = params.get("projectA")!;

async function initialize() {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  useAppStore.setState({ settings: await api.getSettings(), activeSessionId: sessionId, sessions: (await api.listSessions()).sessions.map(session => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  const root = createRoot(document.getElementById("root")!);
  return { root,
    settings: () => root.render(<I18nextProvider i18n={i18n}><ShortcutSettingsPage /></I18nextProvider>),
    composer: () => root.render(<I18nextProvider i18n={i18n}><Composer variant="home" /></I18nextProvider>),
  };
}

globalThis.shortcutSettingsProbe = async () => {
  await api.setProject(projectPath);
  const nativeSettings = await api.getSettings();
  const view = await initialize();
  const migrated = await api.getShortcutConfiguration();
  check(migrated.buttons.find(button => button.presetId === "ask")?.prompt === "旧版自定义提示词", "旧自定义提示词未迁移");
  check(migrated.buttons.find(button => button.presetId === "review")?.prompt === "", "旧显式空提示词丢失");
  check(migrated.buttons.find(button => button.presetId === "spec")?.prompt === undefined, "旧默认值未保留语言语义");
  view.composer(); await until(() => editor());
  const token = nextChipToken();
  const body = `保留已有请求 ${token}`;
  const reference = { path: `${projectPath}/README.md`, name: "README.md", kind: "file" as const, token };
  useAppStore.setState({ composerPrefill: { sessionId, text: body, fileReferences: [reference] } });
  await until(() => readEditorValue(editor()) === body);
  view.settings(); await until(() => input("按钮名称"));
  const askCommand = (await api.composerCommands()).commands.find(command => command.shortcutBinding?.skillId === "ask-matt" && command.shortcutBinding.sourceId === "global");
  check(askCommand, "完整 Skill 来源目录缺少全局 Matt Skill");
  await select("Skill", askCommand.name, `${askCommand.title} (ask-matt)`);
  await fill("按钮名称", "定制审查入口", value => fixture("typeText", value));
  await fill("默认提示词", "检查当前项目的真实阻塞。", value => fixture("typeText", value));
  await fill("备注", "这条备注不得进入草稿。", value => fixture("typeText", value));
  const preview = document.querySelector('[aria-label="插入内容预览"]')?.textContent;
  check(preview === `/${askCommand.name} 检查当前项目的真实阻塞。`, "预览未反映完整来源与编辑后的提示词");
  await click("保存");
  await until(() => document.body.textContent?.includes("快捷按钮已保存"));
  check(JSON.stringify(await api.getSettings()) === JSON.stringify(nativeSettings), "扩展保存改变原生设置");
  await fill("按钮名称", "取消的修改", value => fixture("typeText", value));
  await click("取消"); await until(() => input("按钮名称").value === "定制审查入口");
  await i18n.changeLanguage("zh-CN");
  check(input("按钮名称").value === "定制审查入口" && input("默认提示词").value === "检查当前项目的真实阻塞。", "语言切换覆盖自定义内容");
  view.composer(); await until(() => editor() && readEditorValue(editor()) === body);
  await click("定制审查入口");
  const expectedDraft = `${preview}\n\n${body}`;
  await until(() => readEditorValue(editor()) === expectedDraft);
  const draft = await until(() => readComposerDraft(sessionId)?.text === expectedDraft && readComposerDraft(sessionId));
  check(draft.fileReferences.some(item => item.path === reference.path), "插入丢失已有附件");
  check(!draft.text.includes("这条备注"), "备注进入了草稿");
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "点击按钮自动发送了请求");
  view.settings(); await until(() => input("按钮名称"));
  await click("复制按钮");
  await until(() => input("按钮名称").value.includes("副本"));
  await fill("按钮名称", "第二个同 Skill 按钮", value => fixture("typeText", value));
  await fill("默认提示词", "使用第二条独立提示词。", value => fixture("typeText", value));
  await click("上移");
  await select("选择按钮", "matt:discovery", zhCN.coding.discovery);
  input("启用").click();
  await select("选择按钮", "matt:spec", zhCN.coding.spec);
  await select("更多分组", "maintenance", zhCN.coding.groups.maintenance);
  await click("保存"); await until(() => document.body.textContent?.includes("快捷按钮已保存"));
  const layout = await api.getShortcutConfiguration();
  const copyIndex = layout.buttons.findIndex(button => button.name === "第二个同 Skill 按钮");
  check(copyIndex >= 0 && copyIndex < layout.buttons.findIndex(button => button.presetId === "review"), "复制按钮的排序没有生效");
  check(layout.buttons.find(button => button.presetId === "discovery")?.enabled === false, "隐藏按钮未保存");
  check(layout.buttons.find(button => button.presetId === "spec")?.group === "maintenance", "分组修改未保存");
  view.composer(); await until(() => editor());
  check(!document.querySelector(".coding-shortcuts-primary")?.textContent?.includes(zhCN.coding.discovery), "隐藏按钮仍然展示");
  check(document.body.textContent?.includes(zhCN.coding.formal) && document.body.textContent?.includes(zhCN.coding.requirements.action), "固定操作被隐藏按钮影响");
  await click("第二个同 Skill 按钮");
  await until(() => readEditorValue(editor()).startsWith(`/${askCommand.name} 使用第二条独立提示词。`));
  await fixture("captureShortcutPage", "composer");
  view.settings(); await until(() => input("按钮名称"));
  await select("选择按钮", "matt:review", zhCN.coding.review);
  await click("恢复当前按钮内容");
  check(input("默认提示词").value === zhCN.coding.prompts.review, "单项恢复没有恢复默认内容");
  await click("取消");
  const beforeRestore = await api.listShortcutBackups();
  let confirmation = "";
  const originalConfirm = window.confirm;
  window.confirm = message => { confirmation = message; return false; };
  await click("恢复整套默认");
  check(confirmation.includes("自建按钮") && JSON.stringify(await api.getShortcutConfiguration()) === JSON.stringify(layout), "取消整套恢复仍然写入配置");
  window.confirm = message => { confirmation = message; return true; };
  await click("恢复整套默认");
  await until(() => document.body.textContent?.includes("快捷按钮恢复成功"));
  check(!(await api.getShortcutConfiguration()).buttons.some(button => !button.presetId), "整套恢复保留了自建按钮");
  const afterRestore = await api.listShortcutBackups();
  const restoreBackup = afterRestore.find(id => !beforeRestore.includes(id));
  check(restoreBackup, "整套恢复没有创建可恢复备份");
  await click("查看有效备份"); await until(() => document.querySelector('[aria-label="选择恢复备份"]'));
  await select("选择恢复备份", restoreBackup);
  await click("恢复所选备份");
  await until(async () => JSON.stringify(await api.getShortcutConfiguration()) === JSON.stringify(layout));
  await click("新建按钮"); await until(() => input("按钮名称").value === "新按钮");
  await fill("按钮名称", "新增后删除的按钮", value => fixture("typeText", value));
  await click("保存"); await until(async () => (await api.getShortcutConfiguration()).buttons.some(button => button.name === "新增后删除的按钮"));
  await click("删除按钮"); await click("保存");
  await until(async () => !(await api.getShortcutConfiguration()).buttons.some(button => button.name === "新增后删除的按钮"));
  await fixture("createShortcutProjectSkill", { path: projectPath });
  view.composer(); await until(() => editor());
  const preserved = readEditorValue(editor());
  const unavailable = await until(() => {
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="定制审查入口"]');
    return button?.disabled && button.getAttribute("aria-description")?.includes("不可用") && button;
  });
  unavailable.click();
  check(readEditorValue(editor()) === preserved, "全局来源被项目覆盖后仍插入错误来源");
  view.settings(); await until(() => input("按钮名称"));
  const projectCommand = (await api.composerCommands()).commands.find(command => command.shortcutBinding?.skillId === "ask-matt" && command.shortcutBinding.sourceId === "project");
  check(projectCommand, "项目覆盖没有发布来源目录");
  await select("选择按钮", "matt:ask", "定制审查入口");
  await select("Skill", projectCommand.name, `${projectCommand.title} (ask-matt)`);
  await click("保存"); await until(() => document.body.textContent?.includes("快捷按钮已保存"));
  view.composer(); await until(() => editor());
  useAppStore.setState({ composerPrefill: { sessionId, text: "", fileReferences: [] } });
  await until(() => readEditorValue(editor()) === "");
  await click("定制审查入口");
  await until(() => readEditorValue(editor()) === `/${projectCommand.name} 检查当前项目的真实阻塞。`);
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "来源重新绑定自动提交请求");
  await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 1);
  await fixture("releaseProvider");
  const executed = await until(async () => {
    const result = await fixture("snapshot") as { loadedSkillDocuments: Array<{ id: string; body: string }> };
    return result.loadedSkillDocuments.some(document => document.id === projectCommand.name) && result;
  });
  check(executed.loadedSkillDocuments.find(document => document.id === projectCommand.name)?.body === "PROJECT_SOURCE_BODY_FOR_SHORTCUT_ACCEPTANCE", "实际执行没有加载所选来源的 Skill 文档");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  view.settings(); await until(() => input("按钮名称"));
  window.confirm = originalConfirm;
  await fixture("captureShortcutPage", "settings");
  view.root.unmount();
  return { nativeSettings };
};

globalThis.shortcutSettingsRestored = async checkpoint => {
  const view = await initialize();
  view.settings(); await until(() => input("按钮名称")?.value === "定制审查入口");
  check(input("默认提示词").value === "检查当前项目的真实阻塞。" && input("备注").value === "这条备注不得进入草稿。", "重启丢失提示词或备注");
  check(JSON.stringify(await api.getSettings()) === JSON.stringify(checkpoint.nativeSettings), "重启后原生设置发生变化");
  // Composer 草稿属于既有 renderer 内存契约；重启验证持久化的按钮配置。
  view.composer(); await until(() => editor());
  await click("定制审查入口");
  await until(() => readEditorValue(editor()) === "/ext-skill/user/project/ask-matt 检查当前项目的真实阻塞。");
  check((await fixture("snapshot") as { prompts: number }).prompts === 1, "重启自动提交草稿");
  view.root.unmount();
  return { ok: true, edited: true, inserted: true, attachments: true, manual: true, persisted: true, nativeSettingsPreserved: true, localized: true, migrated: true, layout: true, recovered: true, sourceBody: true };
};
