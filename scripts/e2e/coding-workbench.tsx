import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { CODING_SKILL_SHORTCUTS, CODING_MORE_SKILLS } from "../../apps/desktop/src/features/coding/CodingWorkbench";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { api } from "../../apps/desktop/src/lib/api";
import { readComposerDraft } from "../../apps/desktop/src/lib/composer-draft-cache";
import { nextChipToken, readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";

declare global { var codingWorkbenchProbe: (requirementsOnly?: boolean) => Promise<unknown>; interface Window { workflowFixture: { action: (name: string, input?: unknown) => Promise<unknown> } } }
const params = new URLSearchParams(location.search);
const sessionId = params.get("sessionId")!;
const projectPath = params.get("projectA")!;
const fixture = (name: string, input?: unknown) => window.workflowFixture.action(name, input);
async function until<T>(read: () => T | false | null | Promise<T | false | null>): Promise<T> {
  const end = performance.now() + 12000;
  while (performance.now() < end) { const value = await read(); if (value) return value; await new Promise<void>(requestAnimationFrame); }
  throw new Error(`Shortcut fixture timed out; focus=${document.activeElement?.getAttribute("aria-label")}; tooltip=${document.querySelector('[role="tooltip"]')?.textContent}; ${document.body.textContent?.slice(-800)}`);
}
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const draftFor = (skill: string, body = "") => {
  const action = skill === "ask-matt" ? "ask" : [...CODING_SKILL_SHORTCUTS, ...CODING_MORE_SKILLS].find(item => item.skill === skill)!.action;
  const prompt = i18n.t(`coding.prompts.${action}`);
  return `/${skill} ${prompt}` + (body ? "\n\n" + body : "");
};
const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
function focusForTooltip(button: HTMLButtonElement) {
  // Hidden Electron windows can change activeElement without emitting focusin.
  let observed = false;
  const onFocus = () => { observed = true; };
  button.addEventListener("focusin", onFocus);
  button.focus();
  button.removeEventListener("focusin", onFocus);
  if (!observed) button.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}
async function click(label: string) {
  const button = await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === label && !item.disabled));
  console.info("SHORTCUT_SELECT", label);
  button.focus(); button.click();
}
globalThis.codingWorkbenchProbe = async (requirementsOnly = false) => {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ activeSessionId: sessionId, sessions: sessions.map((session) => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectPath, name: "Project A" }, page: "chat", runningSessions: {}, isRunning: false });
  let root = createRoot(document.getElementById("root")!);
  root.render(<I18nextProvider i18n={i18n as I18n}><Composer variant="home" /></I18nextProvider>);
  await until(() => editor());
  const implementButton = await until(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === en.coding.implement));
  implementButton.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  await until(() => document.querySelector('[role="tooltip"]')?.textContent?.includes(en.coding.skillGuides.implement.example));
  check(readEditorValue(editor()) === "", "Reading skill guidance changed the draft");
  implementButton.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" }));
  await until(() => !document.querySelector('[role="tooltip"]'));
  const primaryLabels = [...document.querySelectorAll(".coding-shortcuts-primary > button, .coding-shortcuts-primary > .coding-requirements-split > button")].map(button => button.textContent?.trim());
  check(JSON.stringify(primaryLabels) === JSON.stringify([i18n.t("coding.ask"), "Discuss requirements", "Implement", "Diagnose bug", "Review code"]), "Common shortcut order changed");
  const more = async () => {
    await click(i18n.t("coding.more"));
    await until(() => document.querySelector(".coding-more-menu.is-open"));
  };
  await more();
  const groups = [...document.querySelectorAll(".coding-more-menu [role='group']")];
  check(groups.length === 4 && groups.every(group => group.getAttribute("aria-label")), "More groups need accessible names");
  const menuLabels = [...document.querySelectorAll(".coding-more-menu [role='menuitem']")].map(button => button.textContent?.trim());
  check(menuLabels.length === 19 && new Set(menuLabels).size === 19, "More skills missing or duplicated");
  await until(() => document.querySelector(".coding-more-menu")?.contains(document.activeElement));
  const prototypeButton = [...document.querySelectorAll<HTMLButtonElement>(".coding-more-menu [role='menuitem']")].find(button => button.textContent?.trim() === en.coding.prototype)!;
  focusForTooltip(prototypeButton);
  await until(() => document.querySelector('[role="tooltip"]')?.textContent?.includes(en.coding.skillGuides.prototype.example));
  check(readEditorValue(editor()) === "", "Focusing menu guidance changed the draft");
  await fixture("pressKey", "Escape");
  await until(() => !document.querySelector(".coding-more-menu"));
  await until(() => !document.querySelector('[role="tooltip"]'));
  await click("Implement");
  await until(() => readEditorValue(editor()) === draftFor("implement"));
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "Shortcut submitted automatically");
  check((await api.listFreeTasks(projectPath)).tasks.length === 0, "Shortcut created a Free Task");
  const mappings = [
    ["Initialize", "setup-matt-pocock-skills"], ["Discuss requirements", "grill-with-docs"],
    ["Form specification", "to-spec"], ["Split tickets", "to-tickets"], ["Implement", "implement"],
    ["Diagnose bug", "diagnosing-bugs"], ["Review code", "code-review"], ["Retrospective", "retro"],
  ];
  const prefill = async (text: string, fileReferences: { path: string; name: string; kind: "file"; token: string }[] = []) => {
    useAppStore.setState({ composerPrefill: { sessionId, text, fileReferences } });
    await until(() => readEditorValue(editor()) === text);
  };
  for (const [label, skill] of mappings) {
    await prefill("");
    if (skill === "to-spec" || skill === "to-tickets") {
      check(![...document.querySelectorAll(".coding-shortcuts button")].some((button) => button.textContent?.trim() === label), "Secondary requirement action remains in toolbar");
      const trigger = document.querySelector<HTMLButtonElement>(".coding-requirements-split [aria-haspopup='menu']")!;
      trigger.focus(); await fixture("pressKey", "Space");
      await until(() => document.querySelector(".coding-requirements-menu.is-open"));
      await until(() => document.querySelector(".coding-requirements-menu")?.contains(document.activeElement));
      const action = skill === "to-spec" ? "spec" : "tickets";
      const button = [...document.querySelectorAll<HTMLButtonElement>(".coding-requirements-menu button")].find(button => button.textContent?.trim() === label)!;
      focusForTooltip(button);
      await until(() => document.querySelector('[role="tooltip"]')?.textContent?.includes(en.coding.skillGuides[action].example));
    }
    if (skill === "setup-matt-pocock-skills" || skill === "retro") await more();
    await click(label);
    await until(() => readEditorValue(editor()) === draftFor(skill));
    check(!document.querySelector(".coding-requirements-menu"), "Requirement selection left menu open");
  }
  await prefill(""); await click("Discuss requirements");
  await until(() => readEditorValue(editor()) === draftFor("grill-with-docs"));
  const requirementsTrigger = () => document.querySelector<HTMLButtonElement>(".coding-requirements-split [aria-haspopup='menu']")!;
  requirementsTrigger().click();
  await until(() => document.querySelector(".coding-requirements-menu.is-open"));
  await fixture("pressKey", "Escape");
  await until(() => !document.querySelector(".coding-requirements-menu") && document.activeElement === requirementsTrigger());
  requirementsTrigger().click();
  await until(() => document.querySelector(".coding-requirements-menu.is-open"));
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  await until(() => !document.querySelector(".coding-requirements-menu"));
  requirementsTrigger().click();
  await until(() => document.querySelector(".coding-requirements-menu.is-open"));
  const currentSessions = useAppStore.getState().sessions;
  useAppStore.setState({ sessions: currentSessions.map((session) => session.id === sessionId ? { ...session, source: "pi-native" } : session) });
  await until(() => requirementsTrigger().disabled && !document.querySelector(".coding-requirements-menu"));
  useAppStore.setState({ sessions: currentSessions });
  await until(() => !requirementsTrigger().disabled);
  if (requirementsOnly) {
    await fixture("resize", { width: 460, height: 760 });
    await until(() => innerWidth <= 460);
    check(document.documentElement.scrollWidth <= innerWidth, "Requirements split button overflows narrow layout");
    await i18n.changeLanguage("zh-CN");
    await until(() => document.querySelector(".coding-requirements-split")?.textContent?.includes("需求讨论"));
    requirementsTrigger().focus(); await fixture("pressKey", "Space");
    await until(() => document.querySelector(".coding-requirements-menu.is-open"));
    check(document.querySelector(".coding-requirements-menu")?.textContent?.includes("需求固化"), "Localized specification item missing");
    check(document.querySelector(".coding-requirements-menu")?.textContent?.includes("拆分工单"), "Localized tickets item missing");
    await until(() => document.querySelector(".coding-requirements-menu")?.contains(document.activeElement));
    const specificationButton = [...document.querySelectorAll<HTMLButtonElement>(".coding-requirements-menu button")].find(button => button.textContent?.trim() === zhCN.coding.spec)!;
    focusForTooltip(specificationButton);
    const tooltip = await until(() => {
      const element = document.querySelector<HTMLElement>('[role="tooltip"]');
      return element?.textContent?.includes(zhCN.coding.skillGuides.spec.example) && element;
    });
    check(tooltip.textContent?.includes(zhCN.settings.engineering.when) && tooltip.textContent?.includes(zhCN.settings.engineering.purpose), "Localized tooltip headings missing");
    const tooltipRect = tooltip.getBoundingClientRect();
    check(tooltipRect.left >= 0 && tooltipRect.right <= innerWidth, "Skill tooltip exceeds narrow viewport");
    check((await fixture("snapshot") as { prompts: number }).prompts === 0, "Requirements menu submitted a prompt");
    root.unmount();
    return { ok: true, requirementsMenu: true, mappings: true, keyboard: true, disabled: true, narrow: true, localized: true };
  }
  for (const shortcut of [{ action: "ask", skill: "ask-matt" }, ...CODING_MORE_SKILLS]) {
    await prefill("");
    if (shortcut.action !== "ask") await click("More");
    await click(i18n.t(`coding.${shortcut.action}`));
    const available = (await api.composerCommands()).commands.some(command => command.kind === "skill" && command.skillId === shortcut.skill);
    if (available) {
      await until(() => readEditorValue(editor()) === draftFor(shortcut.skill));
    } else {
      await until(() => document.querySelector(".coding-shortcut-error"));
      check(readEditorValue(editor()) === "", "Unavailable More skill changed the draft");
    }
  }
  const token = nextChipToken();
  const body = `Keep this request\nwith its file ${token}`;
  const reference = { path: `${projectPath}/README.md`, name: "README.md", kind: "file" as const, token };
  await prefill(body, [reference]); await click("Review code");
  await until(() => readEditorValue(editor()) === draftFor("code-review", body));
  const saved = await until(() => {
    const draft = readComposerDraft(sessionId);
    return draft?.text === draftFor("code-review", body) && draft;
  });
  check(saved?.fileReferences.some((item) => item.path === reference.path), "Shortcut lost attachment");
  check(saved?.text === draftFor("code-review", body), "Shortcut lost persisted text");
  root.unmount();
  root = createRoot(document.getElementById("root")!);
  root.render(<I18nextProvider i18n={i18n as I18n}><Composer variant="docked" /></I18nextProvider>);
  await until(() => editor() && readEditorValue(editor()) === draftFor("code-review", body));
  check(readComposerDraft(sessionId)?.fileReferences.some((item) => item.path === reference.path), "Composer remount lost attachment");
  check(!document.querySelector(".coding-task-panel,.coding-result"), "Legacy task UI remains");
  check((await fixture("snapshot") as { prompts: number }).prompts === 0, "Insertion started provider");
  // 人工发送经过真实 Store、IPC、Host 和 Agent Runtime。
  await prefill("Implement a simple empty state"); await click("Implement");
  await until(() => readEditorValue(editor()) === draftFor("implement", "Implement a simple empty state"));
  await fixture("releaseLaunch");
  const send = await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"));
  send.click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 1);
  const selected = await fixture("snapshot") as { transformed: string; skillIds: string[] };
  check(selected.transformed.includes('in order: "implement"'), "Manual send did not resolve skill");
  check(selected.transformed.includes("Implement a simple empty state"), "Manual send lost request");
  await fixture("releaseProvider");
  const loaded = await until(async () => {
    const snapshot = await fixture("snapshot") as { skillIds: string[] };
    return snapshot.skillIds.at(-1) === "implement" && snapshot;
  });
  check(loaded.skillIds.at(-1) === "implement", "Skill body was not loaded");
  check((await api.listFreeTasks(projectPath)).tasks.length === 0, "Manual send created Free Task");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  await prefill(draftFor("implement", "Implement a simple empty state"));
  await fixture("reset"); await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 2);
  check((await fixture("snapshot") as { transformed: string }).transformed === selected.transformed, "Shortcut differs from manual slash prompt");
  await fixture("releaseProvider");
  useAppStore.setState({ isRunning: false, runningSessions: {} });
  await prefill("Set up engineering conventions"); await more(); await click("Initialize");
  await until(() => readEditorValue(editor()) === draftFor("setup-matt-pocock-skills", "Set up engineering conventions"));
  await fixture("reset"); await fixture("releaseLaunch");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  await until(async () => (await fixture("snapshot") as { prompts: number }).prompts === 3);
  await fixture("releaseProvider");
  await until(async () => (await fixture("snapshot") as { skillIds: string[] }).skillIds.at(-1) === "setup-matt-pocock-skills");
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
  await until(() => readEditorValue(editor()) === draftFor("implement", "Keep this draft for remediation"));
  await fixture("catalogUnavailable", true);
  await click("Review code");
  await until(() => document.querySelector(".coding-shortcut-error")?.textContent?.includes("catalog unavailable"));
  check(readEditorValue(editor()) === draftFor("implement", "Keep this draft for remediation"), "Failed catalog changed draft");
  await fixture("catalogUnavailable", false);
  await click("Review code");
  await until(() => readEditorValue(editor()) === draftFor("code-review", draftFor("implement", "Keep this draft for remediation")));
  await prefill("Keep originating draft");
  await fixture("holdCatalog"); await click("Implement"); await fixture("waitForCatalog");
  const otherSessionId = params.get("otherSessionId")!;
  useAppStore.setState({ activeSessionId: otherSessionId, composerPrefill: { sessionId: otherSessionId, text: "Other conversation", fileReferences: [] } });
  await until(() => readEditorValue(editor()) === "Other conversation");
  await fixture("releaseCatalog");
  await click("Review code");
  await until(() => readEditorValue(editor()) === draftFor("code-review", "Other conversation"));
  check(readComposerDraft(sessionId)?.text === "Keep originating draft", "Stale response modified originating draft");
  useAppStore.setState({ activeSessionId: sessionId });
  await until(() => readEditorValue(editor()) === "Keep originating draft");
  await fixture("holdCatalog"); await click("Implement"); await fixture("waitForCatalog");
  await prefill("Edited while catalog was loading");
  await fixture("releaseCatalog");
  await until(() => readEditorValue(editor()) === draftFor("implement", "Edited while catalog was loading"));
  console.info("SHORTCUT_PHASE busy");
  const turn = await fixture("hostCall", { method: "session.beginTurn", params: { sessionId } }) as { turnId: string };
  useAppStore.setState({ isRunning: true, runningSessions: { [sessionId]: true } });
  await prefill("Review after current work"); await click("Review code");
  await until(() => readEditorValue(editor()) === draftFor("code-review", "Review after current work"));
  check((await api.listQueuedPrompts(sessionId)).entries.length === 0, "Busy insertion queued automatically");
  (await until(() => document.querySelector<HTMLButtonElement>(".send-btn:not(:disabled)"))).click();
  const queued = await until(async () => (await api.listQueuedPrompts(sessionId)).entries[0]);
  console.info("SHORTCUT_PHASE queued");
  check(useAppStore.getState().queuedPrompts[sessionId]?.some((item) => item.content === draftFor("code-review", "Review after current work")), "Ordinary queue lost skill/request");
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
  await until(() => readEditorValue(editor()) === draftFor("implement") && document.activeElement === editor());
  await i18n.changeLanguage("zh-CN");
  await until(() => [...document.querySelectorAll(".coding-shortcuts button")].some((button) => button.textContent === "咨询下一步"));
  await prefill(""); await click("咨询下一步");
  await until(() => readEditorValue(editor()) === draftFor("ask-matt"));
  check(readEditorValue(editor()).includes(zhCN.coding.prompts.ask), "Localized default instruction missing");
  root.unmount();
  return { ok: true, inserted: true, manual: true, mappings: true, retained: true,
    setup: true, remediation: true, stale: true, queue: true, narrow: true, keyboard: true, localized: true };
};
