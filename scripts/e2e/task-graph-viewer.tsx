import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { en } from "@pi-desktop/i18n";
import { createDefaultCodingActions } from "@pi-desktop/shared";
import { CodingWorkbench } from "../../apps/desktop/src/features/coding/CodingWorkbench";
import { api } from "../../apps/desktop/src/lib/api";
import { isBlockingOverlayActive } from "../../apps/desktop/src/lib/blocking-overlay";

declare global { interface Window { taskGraphProbe: () => Promise<unknown>; } }
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const settle = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
let executions = 0;
api.composerCommands = async () => ({ commands: [] });
api.getCodingActions = async () => ({ configuration: createDefaultCodingActions() });
const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
const container = document.getElementById("root");
assert(container, "root is present");
const root = createRoot(container!);
flushSync(() => root.render(<I18nextProvider i18n={i18n}><CodingWorkbench disabled={true} error={null} onExecute={() => executions++} onSelectSkill={() => executions++} onCommit={() => executions++} /></I18nextProvider>));
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(element => element.textContent?.trim() === label);
const click = (element: HTMLButtonElement | undefined) => { assert(element && !element.disabled, "available button"); element!.focus(); flushSync(() => element!.click()); };
window.taskGraphProbe = async () => {
  await settle();
  const more = button(en.codingActions.more);
  click(more);
  await settle();
  const entry = button(en.coding.implementSpec);
  assert(entry && !entry.disabled, "viewer exists without an installed skill, including while execution is disabled");
  click(entry);
  await settle();
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  assert(dialog && isBlockingOverlayActive(), "viewer is a blocking overlay");
  const input = dialog!.querySelector<HTMLTextAreaElement>("textarea");
  assert(input && document.activeElement === input, "opening focuses pasted JSON input");
  const setInput = (value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    assert(setter, "native input setter");
    flushSync(() => { setter!.call(input, value); input!.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const inspect = () => flushSync(() => dialog!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  setInput(JSON.stringify({ tasks: [
    { id: "spec", title: "Approve scope", status: "done" },
    { id: "work", title: "Implement approved work", status: "pending", blockedBy: ["spec"] },
    { id: "verify", title: "Verify work", status: "pending", blockedBy: ["work"] },
  ] }));
  inspect();
  assert(dialog!.textContent?.includes("Ready pending tasks (informational): work"), "inspection shows only dependency-ready work");
  assert(dialog!.textContent?.includes("Dependencies: spec"), "dependencies are visible");
  assert(dialog!.textContent?.includes(en.skillGates.description), "actual permissions remain with CLI/Hooks");
  setInput("{");
  assert(!dialog!.querySelector('[aria-label="Task graph results"]'), "editing clears stale results");
  inspect();
  assert(dialog!.querySelector('[role="alert"]')?.textContent === en.taskGraph.errors.json, "invalid JSON gives visible recovery");
  setInput('{"tasks":[]}');
  inspect();
  assert(dialog!.textContent?.includes(en.taskGraph.empty), "valid input recovers without reopening");
  const controls = dialog!.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>("button,textarea");
  controls[controls.length - 1].focus();
  const forward = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  controls[controls.length - 1].dispatchEvent(forward);
  assert(forward.defaultPrevented && document.activeElement === controls[0], "Tab wraps within viewer");
  const backward = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  controls[0].dispatchEvent(backward);
  assert(backward.defaultPrevented && document.activeElement === controls[controls.length - 1], "Shift+Tab wraps within viewer");
  flushSync(() => input!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await settle();
  assert(!document.querySelector('[role="dialog"]') && !isBlockingOverlayActive(), "Escape closes and releases blocking overlay");
  assert(document.activeElement === more, "closing restores launcher focus");
  click(more); await settle(); click(button(en.coding.implementSpec)); await settle();
  click(button(en.taskGraph.close)); await settle();
  assert(!document.querySelector(`[role="dialog"]`) && document.activeElement === more, "Close button releases overlay and restores focus");
  assert(executions === 0, "no task dispatch or skill prompt execution");
  return { ok: true, checks: ["catalog-independent launcher", "readonly availability", "open and focus", "inspect dependencies/frontier", "invalid input recovery", "CLI/Hook gates", "Tab focus loop", "Escape close and focus restore", "explicit close", "no dispatch"] };
};
