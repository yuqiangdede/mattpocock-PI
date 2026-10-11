import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot, resolveElectronBinary } from "../../../scripts/e2e/boot.mjs";

const root = repositoryRoot();
const { build } = createRequire(join(root, "packages/agent-runtime/package.json"))("esbuild");
const rendererSource = String.raw`
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { zhCN } from "@pi-desktop/i18n";
import { CodingActionSettingsPage } from "../../apps/desktop/src/features/extensions/CodingActionSettingsPage";
import { CodingWorkbench } from "../../apps/desktop/src/features/coding/CodingWorkbench";
import { useCodingActionLauncher } from "../../apps/desktop/src/features/coding/useCodingActionLauncher";
import { loadCodingActions } from "../../apps/desktop/src/features/extensions/coding-action-state";
import { Textarea } from "../../apps/desktop/src/components/ui";
const root = createRoot(document.getElementById("root"));
const initialDraft = "Keep my draft\nfile \uFFFC";
function DraftComposer() {
  const [draft, setDraft] = useState(initialDraft);
  const references = useRef([{ id: "retained", path: "fixture.txt" }]);
  const launcher = useCodingActionLauncher({ sessionId: null, projectPath: "", blocked: false, draftKey: "fixture",
    readLiveDraft: () => draft, invalidatePromptEnhancement() {}, fileReferencesRef: references,
    applyEditorDraft(text, files) { if (files !== references.current) throw new Error("Attachments lost"); setDraft(text); },
  });
  return <><CodingWorkbench disabled={false} error={launcher.error} onExecute={launcher.execute} onSelectSkill={launcher.selectSkill} onSelectPrompt={launcher.selectPrompt} /><Textarea aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /></>;
}
const render = element => root.render(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>);
const field = key => document.querySelector('[aria-label="' + i18n.t("codingActions." + key) + '"]');
const until = async read => { const end = performance.now() + 8000; while (performance.now() < end) { const value = await read(); if (value) return value; await new Promise(requestAnimationFrame); } throw new Error("Timed out: " + document.body.textContent); };
const click = async label => { const button = await until(() => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label && !item.disabled)); button.click(); await new Promise(requestAnimationFrame); };
const fill = async (key, value) => { const input = await until(() => field(key)); const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(requestAnimationFrame); };
const check = (value, message) => { if (!value) throw new Error(message); };
window.promptButtonsProbe = async () => {
  await i18n.use(initReactI18next).init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } }, interpolation: { escapeValue: false } });
  await loadCodingActions();
  render(<CodingActionSettingsPage />);
  await until(() => field("promptName") && !field("promptName").disabled);
  check(field("promptName").value === i18n.t("codingActions.commitCode"), "Legacy default missing");
  await fill("promptName", "My commit");
  await fill("promptText", "Build first, commit with Git or SVN");
  await click(i18n.t("codingActions.save"));
  await until(() => document.body.textContent.includes(i18n.t("codingActions.saved")));
  await fill("promptName", "Unsaved name");
  await click(i18n.t("codingActions.cancel"));
  await until(() => field("promptName").value === "My commit");
  await loadCodingActions(true);
  render(<DraftComposer />);
  await until(() => document.querySelector('[aria-label="Draft"]'));
  await click("My commit");
  await until(() => document.querySelector('[aria-label="Draft"]').value === "Build first, commit with Git or SVN\n\n" + initialDraft);
  check(!document.querySelector(".coding-shortcuts-secondary [aria-haspopup]"), "More misplaced");
  render(<CodingActionSettingsPage />);
  await until(() => field("promptText")?.value === "Build first, commit with Git or SVN");
  await click(i18n.t("codingActions.addPrompt"));
  await fill("promptName", "Summary"); await fill("promptText", "Summarize my changes");
  await click(i18n.t("codingActions.save"));
  await until(() => document.body.textContent.includes(i18n.t("codingActions.saved")));
  await loadCodingActions(true);
  render(<DraftComposer />);
  await until(() => document.querySelector('[aria-label="Draft"]'));
  await click("Summary");
  await until(() => document.querySelector('[aria-label="Draft"]').value === "Summarize my changes\n\n" + initialDraft);
  root.unmount(); return { ok: true };
};
`;

test("Electron settings save and cancel names/prompts, reload persistence, and insert plain drafts with retained attachments", {
  timeout: 60_000,
  skip: process.platform === "linux" && !process.env.DISPLAY ? "Electron requires a display" : false,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-plain-prompts-"));
  try {
    await build({ stdin: { contents: rendererSource, resolveDir: join(root, "scripts/e2e"), loader: "tsx" },
      outfile: join(directory, "renderer.js"), bundle: true, platform: "browser", format: "esm", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
      alias: { "@pi-desktop/shared": join(root, "packages/shared/src/index.ts"), "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"), react: join(root, "apps/desktop/node_modules/react"), "react-dom": join(root, "apps/desktop/node_modules/react-dom") },
      nodePaths: [join(root, "apps/desktop/node_modules")],
    });
    await build({ stdin: { contents: `
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { CodingActionStore } from "${join(root, "apps/desktop/electron/main/extensions/coding-action-store.ts").replaceAll("\\", "/")}";
import { IPC } from "@pi-desktop/shared";
const directory = import.meta.dirname;
app.setPath("userData", join(directory, "profile"));
let sends = 0;
ipcMain.handle("prompt-fixture", async (_event, method, ...args) => {
  const store = new CodingActionStore(join(directory, "data"));
  if (method === IPC.invoke.codingActionsGet) return store.load();
  if (method === IPC.invoke.codingActionsSave) return store.save(args[0], args[1]);
  if (method === IPC.invoke.codingActionsReset) return store.reset();
  if (method === IPC.invoke.composerCommands) return { commands: [] };
  sends++; throw new Error("Unexpected Host request: " + method);
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { preload: join(directory, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", event => console.error(event.message));
  try { await win.loadFile(join(directory, "index.html")); const result = await win.webContents.executeJavaScript("window.promptButtonsProbe()");
    if (sends !== 0) throw new Error("Selection unexpectedly called the Host");
    console.log("PLAIN_PROMPT_PROBE " + JSON.stringify(result)); app.exit(0);
  } catch (error) { console.error(error.stack); app.exit(1); }
});`, resolveDir: root, loader: "ts" }, outfile: join(directory, "main.mjs"), bundle: true, platform: "node", format: "esm", external: ["electron"], alias: { "@pi-desktop/shared": join(root, "packages/shared/src/index.ts") } });
    await writeFile(join(directory, "preload.cjs"), 'const {contextBridge,ipcRenderer}=require("electron"); contextBridge.exposeInMainWorld("piDesktop",{invoke:async(method,...args)=>{try{return {ok:true,data:await ipcRenderer.invoke("prompt-fixture",method,...args)}}catch(error){return {ok:false,error:{message:error.message}}}},on:()=>()=>{}});');
    await writeFile(join(directory, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'"></head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(resolveElectronBinary(root).electronBinary, [join(directory, "main.mjs")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; });
    const timeout = setTimeout(() => child.kill(), 30_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(timeout));
    assert.equal(code, 0, output);
    assert.ok(output.includes('PLAIN_PROMPT_PROBE {"ok":true}'), output);
    const saved = JSON.parse(await readFile(join(directory, "data/extensions/coding-actions.json"), "utf8"));
    assert.deepEqual(saved.promptActions.map(action => [action.label, action.prompt]), [["My commit", "Build first, commit with Git or SVN"], ["Summary", "Summarize my changes"]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
