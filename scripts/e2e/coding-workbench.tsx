import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { readComposerDraft } from "../../apps/desktop/src/lib/composer-draft-cache";
import { nextChipToken, readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";

declare global { var codingWorkbenchProbe: () => Promise<unknown>; interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } } }
const params = new URLSearchParams(location.search);
const sessionId = params.get("sessionId")!;
const projectPath = params.get("projectA")!;
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
async function until<T>(read: () => T | false | null | Promise<T | false | null>): Promise<T> {
  const end = performance.now() + 12000;
  while (performance.now() < end) { const value = await read(); if (value) return value; await new Promise<void>(requestAnimationFrame); }
  throw new Error(`Shortcut fixture timed out: ${document.body.textContent?.slice(-800)}`);
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
async function click(label: string) {
  const button = await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label && !item.disabled));
  button.focus(); button.click();
}
globalThis.codingWorkbenchProbe = async () => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ activeSessionId: sessionId, sessions: sessions.map((session) => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectPath, name: "Project A" }, page: "chat", runningSessions: {}, isRunning: false });
  let root = createRoot(document.getElementById("root")!);
  root.render(<I18nextProvider i18n={i18n as I18n}><Composer variant="home" /></I18nextProvider>);
  await until(() => editor());
  await click("Implement");
  await until(() => readEditorValue(editor()) === "/implement ");
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "Shortcut submitted automatically");
  check((await api.listFreeTasks(projectPath)).tasks.length === 0, "Shortcut created a Free Task");
  const mappings = [
    ["Engineering initialization", "setup-matt-pocock-skills"], ["Discuss requirements", "grill-with-docs"],
    ["Form specification", "to-spec"], ["Split tickets", "to-tickets"], ["Implement", "implement"],
    ["Diagnose bug", "diagnosing-bugs"], ["Review code", "code-review"], ["Retrospective", "retro"],
  ];
  const prefill = async (text: string, fileReferences: { path: string; name: string; kind: "file"; token: string }[] = []) => {
    useAppStore.setState({ composerPrefill: { sessionId, text, fileReferences } });
    await until(() => readEditorValue(editor()) === text);
  };
  for (const [label, skill] of mappings) {
    await prefill(""); await click(label);
    await until(() => readEditorValue(editor()) === `/${skill} `);
  }
  const token = nextChipToken();
  const body = `Keep this request\nwith its file ${token}`;
  const reference = { path: `${projectPath}/README.md`, name: "README.md", kind: "file" as const, token };
  await prefill(body, [reference]); await click("Review code");
  await until(() => readEditorValue(editor()) === `/code-review ${body}`);
  const saved = await until(() => {
    const draft = readComposerDraft(sessionId);
    return draft?.text === `/code-review ${body}` && draft;
  });
  check(saved?.fileReferences.some((item) => item.path === reference.path), "Shortcut lost attachment");
  check(saved?.text === `/code-review ${body}`, "Shortcut lost persisted text");
  root.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(<I18nextProvider i18n={i18n as I18n}><Composer variant="docked" /></I18nextProvider>);
  await until(() => editor() && readEditorValue(editor()) === `/code-review ${body}`);
  check(readComposerDraft(sessionId)?.fileReferences.some((item) => item.path === reference.path), "Composer remount lost attachment");
  check(!document.querySelector(".coding-task-panel,.coding-result"), "Legacy task UI remains");
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "Insertion started provider");
  // 人工发送经过真实 Store、IPC、Host 和 Agent Runtime。
  await prefill("Implement a simple empty state"); await click("Implement");
  await until(() => readEditorValue(editor()) === "/implement Implement a simple empty state");
  await fixture("releaseLaunch");
  const send = await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"));
  send.click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 1);
  const selected = await fixture("snapshot") as { transformed: string; skillIds: string[] };
  check(selected.transformed.includes('in order: "implement"'), "Manual send did not resolve skill");
  check(selected.transformed.includes("Implement a simple empty state"), "Manual send lost request");
  await fixture("releaseProvider");
  const loaded = await fixture("snapshot") as { skillIds: string[] };
  check(loaded.skillIds.at(-1) === "implement", "Skill body was not loaded");
  check((await api.listFreeTasks(projectPath)).tasks.length === 0, "Manual send created Free Task");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  await prefill("/implement Implement a simple empty state");
  await fixture("reset"); await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 2);
  check((await fixture("snapshot") as { transformed: string }).transformed === selected.transformed, "Shortcut differs from manual slash prompt");
  await fixture("releaseProvider");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  await prefill("Set up engineering conventions"); await click("Engineering initialization");
  await until(() => readEditorValue(editor()) === "/setup-matt-pocock-skills Set up engineering conventions");
  await fixture("reset"); await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 3);
  await fixture("releaseProvider");
  check((await fixture("snapshot") as { skillIds: string[] }).skillIds.at(-1) === "setup-matt-pocock-skills", "Setup skill was not loaded");
  check((await api.listFreeTasks(projectPath)).tasks.length === 0, "Setup entered native initialization");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  await api.setProject(projectPath);
  await prefill("Keep this draft for remediation");
  await fixture("setSkillEnabled", { path: projectPath, id: "implement", enabled: false });
  await click("Implement");
  await until(() => document.querySelector(".coding-shortcut-error"));
  check(readEditorValue(editor()) === "Keep this draft for remediation", "Disabled skill changed draft");
  await click("Configure skills");
  check(useAppStore.getState().page === "settings" && useAppStore.getState().settingsTab === "skills", "Remediation opens wrong settings");
  useAppStore.setState({ page: "chat" });
  await fixture("setSkillEnabled", { path: projectPath, id: "implement", enabled: true });
  await click("Implement");
  await until(() => readEditorValue(editor()) === "/implement Keep this draft for remediation");
  await fixture("catalogUnavailable", true);
  await click("Review code");
  await until(() => document.querySelector(".coding-shortcut-error")?.textContent?.includes("catalog unavailable"));
  check(readEditorValue(editor()) === "/implement Keep this draft for remediation", "Failed catalog changed draft");
  await fixture("catalogUnavailable", false);
  await click("Review code");
  await until(() => readEditorValue(editor()) === "/code-review /implement Keep this draft for remediation");
  await prefill("Keep originating draft");
  await fixture("holdCatalog"); await click("Implement"); await fixture("waitForCatalog");
  const otherSessionId = params.get("otherSessionId")!;
  useAppStore.setState({ activeSessionId: otherSessionId, composerPrefill: { sessionId: otherSessionId, text: "Other conversation", fileReferences: [] } });
  await until(() => readEditorValue(editor()) === "Other conversation");
  await fixture("releaseCatalog");
  await click("Review code");
  await until(() => readEditorValue(editor()) === "/code-review Other conversation");
  check(readComposerDraft(sessionId)?.text === "Keep originating draft", "Stale response modified originating draft");
  useAppStore.setState({ activeSessionId: sessionId });
  await until(() => readEditorValue(editor()) === "Keep originating draft");
  await fixture("holdCatalog"); await click("Implement"); await fixture("waitForCatalog");
  await prefill("Edited while catalog was loading");
  await fixture("releaseCatalog");
  await until(() => readEditorValue(editor()) === "/implement Edited while catalog was loading");
  console.info("SHORTCUT_PHASE busy");
  const turn = await fixture("hostCall", { method: "session.beginTurn", params: { sessionId } }) as { turnId: string };
  useAppStore.setState({ isRunning: true, runningSessions: { [sessionId]: true } });
  await prefill("Review after current work"); await click("Review code");
  await until(() => readEditorValue(editor()) === "/code-review Review after current work");
  check((await api.listQueuedPrompts(sessionId)).entries.length === 0, "Busy insertion queued automatically");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  const queued = await until(async () => (await api.listQueuedPrompts(sessionId)).entries[0]);
  console.info("SHORTCUT_PHASE queued");
  check(useAppStore.getState().queuedPrompts[sessionId]?.some((item) => item.content === "/code-review Review after current work"), "Ordinary queue lost skill/request");
  await api.removeQueuedPrompt(queued.id);
  await fixture("hostCall", { method: "session.endTurn", params: { turnId: turn.turnId, status: "completed", createNotification: false } });
  useAppStore.setState({ isRunning: false, runningSessions: {}, queuedPrompts: {} });
  await prefill("");
  console.info("SHORTCUT_PHASE narrow");
  await fixture("resize", { width: 460, height: 760 });
  await until(() => innerWidth <= 460 && innerWidth > 300);
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(".coding-shortcuts button")];
  check(buttons.every((button) => button.tabIndex >= 0 && button.getBoundingClientRect().right <= innerWidth), "Narrow/keyboard controls overflow");
  check(document.documentElement.scrollWidth <= innerWidth, "Narrow layout has horizontal overflow");
  const implementation = buttons.find((button) => button.textContent === "Implement")!;
  implementation.focus(); await fixture("pressKey", "Space");
  console.info("SHORTCUT_PHASE keyboard");
  await until(() => readEditorValue(editor()) === "/implement " && document.activeElement === editor());
  await i18n.changeLanguage("zh-CN");
  await until(() => [...document.querySelectorAll(".coding-shortcuts button")].some((button) => button.textContent === "工程初始化"));
  root.unmount();
  return { ok: true, inserted: true, manual: true, mappings: true, retained: true,
    setup: true, remediation: true, stale: true, queue: true, narrow: true, keyboard: true, localized: true };
};
