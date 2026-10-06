import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { en, zhCN, flattenCatalog } from "@pi-desktop/i18n";
import { Composer } from "../../apps/desktop/src/components/Composer";
import { WorkflowTab } from "../../apps/desktop/src/components/workpanel/WorkflowTab";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { readEditorValue } from "../../apps/desktop/src/features/chat/composer/editor";
import { api } from "../../apps/desktop/src/lib/api";

type Checkpoint = { groupId: string; contentHash: string };
declare global {
  var requirementsConfirmationProbe: () => Promise<Checkpoint>;
  var requirementsConfirmationRestored: (checkpoint: Checkpoint) => Promise<unknown>;
}
const params = new URLSearchParams(location.search);
const projectA = params.get("projectA")!;
const projectB = params.get("projectB")!;
const sessionId = params.get("sessionId")!;
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const action = (name: string, input?: unknown) => window.workflowFixture.artifactAction(name, input);
let root: Root;

async function until<T>(read: () => T | false | null | undefined | Promise<T | false | null | undefined>, label: string): Promise<T> {
  const end = performance.now() + 15000;
  while (performance.now() < end) {
    const value = await read();
    if (value) return value;
    await new Promise<void>(requestAnimationFrame);
  }
  throw new Error(`Requirements fixture timed out: ${label}; ${document.body.innerText.slice(-1800)}`);
}
const dialog = () => document.querySelector<HTMLDialogElement>(".requirements-confirmation-dialog");
const button = (label: string, inDialog = false) => [...(inDialog ? dialog()! : document).querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === label);
async function click(label: string, inDialog = false) {
  const node = await until(() => { const item = button(label, inDialog); return item && !item.disabled ? item : null; }, label);
  node.focus(); node.click();
}
function field(label: string, value: string) {
  const input = dialog()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function initialize() {
  await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: flattenCatalog(en) }, "zh-CN": { translation: flattenCatalog(zhCN) } }, interpolation: { escapeValue: false } });
  await action("setWorkspace", projectA);
  const sessions = (await api.listSessions()).sessions;
  useAppStore.setState({ activeSessionId: sessionId, sessions: sessions.map(session => ({ ...session, providerId: "workflow-fixture", modelId: "fixture-model" })),
    providers: [{ id: "workflow-fixture", name: "Fixture", vendorKey: "custom", type: "custom", protocol: "openai-completions", enabled: true, authKind: "none", hasSecret: false, models: [{ id: "fixture-model", contextWindow: 32000, maxTokens: 2048, thinkingLevels: ["off"], defaultThinkingLevel: "off" }], supportsReasoning: false, supportedThinkingLevels: ["off"] }],
    workspace: { path: projectA, name: "Project A" }, page: "chat", runningSessions: {}, isRunning: false });
  root = createRoot(document.getElementById("root")!);
  renderComposer();
  await until(() => document.querySelector(".composer-input"), "Composer mounted");
}
function RequirementsFixture() {
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  return <><Composer variant="home" /><WorkflowTab projectPath={projectPath} projectMeta={{}} sessionId={sessionId} /></>;
}
function renderComposer() { root.render(<I18nextProvider i18n={i18n}><RequirementsFixture /></I18nextProvider>); }
async function open() {
  await click("Confirm requirements");
  await until(() => dialog()?.open && !dialog()?.querySelector('input')?.disabled, "confirmation dialog hydrated");
}
async function close() { await click("Cancel", true); await until(() => !dialog(), "dialog closed"); }

globalThis.requirementsConfirmationProbe = async () => {
  await initialize();
  await action("writeRequirements", "# Requirements\n\nThe user approves the current specification.\n\n## Acceptance\nKeep drafts and history.");
  const groups = (await api.listProjectGroups()).groups;
  const group = groups.find(item => item.name === "Project A")!;
  const other = groups.find(item => item.name === "Project B")!;
  const editor = () => document.querySelector<HTMLElement>(".composer-input")!;
  const draft = "Preserve this unsent draft.";
  useAppStore.setState({ composerPrefill: { sessionId, text: draft, fileReferences: [] } });
  await until(() => readEditorValue(editor()) === draft, "draft prefilled");
  check(!document.querySelector(".coding-workbench")?.textContent?.includes("Confirm requirements"), "Composer retained confirmation action");

  await open();
  field("Specification file", "requirements.md");
  await click("Preview / refresh", true);
  await until(() => dialog()?.innerText.includes("Awaiting human confirmation"), "first preview");
  check(dialog()?.innerText.includes("The user approves"), "Exact file excerpt missing");
  await close();
  check((await api.readRequirementsHistory(group.id)).confirmations.length === 0, "Cancel wrote a decision");
  check(readEditorValue(editor()) === draft, "Confirmation preview modified the draft");

  await open();
  await window.workflowFixture.action("pressKey", "Escape");
  await until(() => !dialog(), "Escape dismisses confirmation");
  check(document.activeElement === button("Confirm requirements"), "Escape did not restore action focus");

  for (const unsafe of [
    { projectGroupId: group.id, workspaceRoot: group.roots[0].path, relativePath: "escape/outside.md" },
    { projectGroupId: other.id, workspaceRoot: group.roots[0].path, relativePath: "requirements.md" },
  ]) {
    let rejected = false;
    try { await api.previewRequirements(unsafe); } catch { rejected = true; }
    check(rejected, "File preview crossed the registered project boundary");
  }

  await open();
  field("Specification file", "requirements.md");
  await click("Preview / refresh", true);
  await click("Confirm this version", true);
  await until(() => dialog()?.innerText.includes("Current version confirmed"), "first confirmation");
  const first = await api.readRequirementsHistory(group.id);
  check(first.confirmations.length === 1, "Confirmation not retained");
  const retry = await api.confirmRequirements({ projectGroupId: group.id, workspaceRoot: first.confirmations[0].workspaceRoot, relativePath: "requirements.md", expectedRevision: 0, contentHash: first.confirmations[0].contentHash });
  check(retry.revision === 1 && retry.confirmations[0].id === first.confirmations[0].id, "Native request retry wrote another confirmation");
  check((await api.readWorkflowHistory(group.id)).history.runs.length === 0, "Ordinary chat confirmation created a run");
  await close();
  check(readEditorValue(editor()) === draft, "Approval modified the unsent draft");

  const runHistory = (await api.createWorkflowRun(group.id, "Shared requirements", 0)).history;
  root.render(<I18nextProvider i18n={i18n}><WorkflowTab projectPath={projectA} projectMeta={{}} sessionId={sessionId} /></I18nextProvider>);
  await until(() => document.querySelector(".workflow-tab"), "Workflow mounted");
  await open();
  await until(() => dialog()?.innerText.includes("Current version confirmed"), "Workflow shares approval");
  check((await api.readWorkflowHistory(group.id)).history.runs[0].stages[1].status === "locked", "File approval bypassed stage prerequisites");
  check((await api.readWorkflowHistory(group.id)).history.revision === runHistory.revision, "Content approval changed Workflow history");

  await action("writeRequirements", "# Revised requirements\n\nReview affected tasks after changing the behavior.");
  await click("Preview / refresh", true);
  await until(() => dialog()?.innerText.includes("Requirements changed — confirmation needed"), "changed content detected");
  await action("writeRequirements", "# Final requirements\n\nA further edit happened after preview.");
  await click("Confirm this version", true);
  await until(() => dialog()?.querySelector('[role="alert"]')?.textContent?.includes("Refresh"), "stale preview rejected");
  check((await api.readRequirementsHistory(group.id)).confirmations.length === 1, "Stale preview wrote a decision");
  await click("Preview / refresh", true);
  await click("Confirm this version", true);
  await until(() => dialog()?.innerText.includes("Current version confirmed"), "revised confirmation");
  const revised = await api.readRequirementsHistory(group.id);
  check(revised.confirmations.length === 2 && revised.confirmations[0].id === first.confirmations[0].id, "Historical approval was lost");
  await close();

  renderComposer();
  await until(() => editor(), "Composer restored");
  for (const dismissal of ["Cancel", "Escape"]) {
    await action("pauseRequirementsPreview");
    await click("Confirm requirements");
    await action("waitOpen");
    if (dismissal === "Cancel") await click("Cancel", true);
    else await window.workflowFixture.action("pressKey", "Escape");
    await until(() => !dialog(), `${dismissal} dismisses pending preview`);
    check(document.activeElement === button("Confirm requirements"), "Pending dismissal did not restore focus");
    await action("releaseOpen");
    check(!dialog(), "Late preview reopened the dismissed dialog");
    check((await api.readRequirementsHistory(group.id)).confirmations.length === 2, "Pending dismissal changed approval history");
  }
  await action("pauseRequirementsPreview");
  await click("Confirm requirements");
  await action("waitOpen");
  useAppStore.setState({ workspace: { path: projectB, name: "Project B" } });
  await action("setWorkspace", projectB);
  await until(() => !dialog(), "project switch closes owned dialog");
  await action("releaseOpen");
  await open();
  check(!dialog()?.innerText.includes("Current version confirmed"), "Old preview leaked into another project");
  check((await api.readRequirementsHistory(other.id)).confirmations.length === 0, "Other project inherited approvals");
  await close();

  useAppStore.setState({ workspace: { path: projectA, name: "Project A" } });
  await action("setWorkspace", projectA);
  await i18n.changeLanguage("zh-CN");
  await click("确认需求");
  await until(() => dialog()?.innerText.includes("当前版本已确认"), "Chinese status");
  check(dialog()?.innerText.includes("确认历史（2）"), "Chinese history label missing");
  await click("取消", true);
  const snapshot = await window.workflowFixture.action("snapshot") as { prompts: number };
  check(snapshot.prompts === 0, "Confirmation started an Agent");
  return { groupId: group.id, contentHash: revised.confirmations[1].contentHash };
};

globalThis.requirementsConfirmationRestored = async checkpoint => {
  await initialize();
  await open();
  await until(() => dialog()?.innerText.includes("Current version confirmed"), "restart restores approval");
  const history = await api.readRequirementsHistory(checkpoint.groupId);
  check(history.confirmations.length === 2 && history.confirmations[1].contentHash === checkpoint.contentHash, "Restart changed confirmed version or history");
  await close();
  return { ok: true, confirmed: true, shared: true, reconfirmed: true, persisted: true, cancelled: true, isolated: true, stale: true, localized: true, manual: true };
};
