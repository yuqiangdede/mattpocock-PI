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
import { until, check, click, fill } from "./skill-shortcuts-helpers";

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
  useAppStore.setState({ settings: await api.getSettings(), activeSessionId: sessionId, sessions: (await api.listSessions()).sessions,
    workspace: { path: projectPath, name: "Project A" }, page: "chat", isRunning: false, runningSessions: {} });
  const root = createRoot(document.getElementById("root")!);
  return { root,
    settings: () => root.render(<I18nextProvider i18n={i18n}><ShortcutSettingsPage /></I18nextProvider>),
    composer: () => root.render(<I18nextProvider i18n={i18n}><Composer variant="home" /></I18nextProvider>),
  };
}

globalThis.shortcutSettingsProbe = async () => {
  const nativeSettings = await api.getSettings();
  const view = await initialize();
  view.composer(); await until(() => editor());
  const token = nextChipToken();
  const body = `保留已有请求 ${token}`;
  const reference = { path: `${projectPath}/README.md`, name: "README.md", kind: "file" as const, token };
  useAppStore.setState({ composerPrefill: { sessionId, text: body, fileReferences: [reference] } });
  await until(() => readEditorValue(editor()) === body);
  view.settings(); await until(() => input("按钮名称"));
  await fill("按钮名称", "定制审查入口", value => fixture("typeText", value));
  await fill("默认提示词", "检查当前项目的真实阻塞。", value => fixture("typeText", value));
  await fill("备注", "这条备注不得进入草稿。", value => fixture("typeText", value));
  const preview = document.querySelector('[aria-label="插入内容预览"]')?.textContent;
  check(preview === "/ask-matt 检查当前项目的真实阻塞。", "预览未反映编辑后的提示词");
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
  await until(() => readEditorValue(editor()) === "/ask-matt 检查当前项目的真实阻塞。");
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "重启自动提交草稿");
  view.root.unmount();
  return { ok: true, edited: true, inserted: true, attachments: true, manual: true, persisted: true, nativeSettingsPreserved: true, localized: true };
};
