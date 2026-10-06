import { mkdir, writeFile, unlink, symlink, rename } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { HostProcess } from "../../packages/host-runtime/src/host-process";
import { IPC } from "../../packages/shared/src/protocol";
import { WORKFLOW_STAGES } from "../../packages/shared/src/types/workflow";
import { registerWorkflowIpc } from "../../apps/desktop/electron/main/ipc/workflow-ipc";
import { registerWorkflowArtifactsIpc } from "../../apps/desktop/electron/main/ipc/workflow-artifacts-ipc";
import { registerRequirementsIpc } from "../../apps/desktop/electron/main/ipc/requirements-ipc";
import { ShortcutStore } from "../../apps/desktop/electron/main/extensions/shortcut-store";
import { readOpenableFile } from "../../packages/host-runtime/src/workspace-files";
import type { IpcRegistrar } from "../../apps/desktop/electron/main/ipc/types";
import { registerWorkflowDiscoveryFixture, crashWorkflowFixtureHost } from "./workflow-discovery-fixture.mjs";

const binaryPath = process.env.PI_DESKTOP_HOST_BIN;
if (!binaryPath) throw new Error("PI_DESKTOP_HOST_BIN is required for the workflow fixture");
const dataDir = join(__dirname, "host-data");
const projectA = join(__dirname, "project-a");
const projectB = join(__dirname, "project-b");
app.setPath("userData", join(__dirname, "profile"));

let host: HostProcess | null = null;
const discoveryFixture = process.env.PI_WORKFLOW_DISCOVERY === "1";
let executionFixture: ReturnType<typeof registerWorkflowDiscoveryFixture> | undefined;
let stopping = false;
let interceptNextHistoryRead = false;
let interceptNextArtifactOpen = false;
let interceptNextRequirementsPreview = false;
let markReadStarted: () => void = () => {};
let readStarted = Promise.resolve();
let releaseHeldRead: () => void = () => {};
let heldRead = Promise.resolve();
let markReadFinished: () => void = () => {};
let readFinished = Promise.resolve();

async function stop(exitCode: number): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    await executionFixture?.dispose();
    await host?.dispose();
  } catch (error) {
    console.error("WORKFLOW_RUNS_HOST_DISPOSE", String(error));
    exitCode = 1;
  }
  host = null;
  app.exit(exitCode);
}

const registrar: IpcRegistrar = {
  ipcMain,
  handle: (channel, handler) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
      const result = await handler(...args);
      if ((channel === IPC.invoke.workflowHistoryRead && interceptNextHistoryRead) || (channel === IPC.invoke.workflowArtifactOpen && interceptNextArtifactOpen) || (channel === IPC.invoke.requirementsPreview && interceptNextRequirementsPreview)) {
        interceptNextHistoryRead = false;
        interceptNextArtifactOpen = false;
        interceptNextRequirementsPreview = false;
        markReadStarted();
        await heldRead;
        markReadFinished();
      }
      return { ok: true, data: result };
      } catch (error) {
        const failure = error as { errorCode?: string; data?: { errorCode?: string }; message?: string };
        return { ok: false, error: { code: failure.data?.errorCode ?? failure.errorCode ?? "INTERNAL", message: failure.message ?? String(error) } };
      }
    });
  },
  handleWithEvent: () => { throw new Error("unexpected event-based workflow IPC"); },
  assertMainWindowSender: () => { throw new Error("unexpected sender assertion"); },
};

if (process.env.PI_CODING_WORKBENCH === "1") {
  const shortcutStore = new ShortcutStore(dataDir);
  registrar.handle(IPC.invoke.shortcutsGet, () => shortcutStore.load());
  registrar.handle(IPC.invoke.shortcutsSave, (value: unknown) => shortcutStore.save(value));
}

if (discoveryFixture) {
  executionFixture = registerWorkflowDiscoveryFixture({ registrar, getHost: () => host, dataDir, root: process.env.PI_WORKFLOW_REPO_ROOT });
  ipcMain.handle("workflow.discovery.fixture", (_event, name, input) => executionFixture!.action(name, input));
} else {
  registerWorkflowIpc({ registrar, getHost: () => host });
}
ipcMain.handle(IPC.invoke.projectGroupList, async () => host!.call("project.groups.list"));
const readFixtureFile = async (path: string) => {
  const { workspace } = await host!.call<{ workspace: { path: string } }>("workspace.get");
  const { groups } = await host!.call<{ groups: Array<{ roots: Array<{ path: string }> }> }>("project.groups.list");
  const group = groups.find((group) => group.roots.some((root) => root.path === workspace.path));
  return readOpenableFile(path, workspace.path, group?.roots.map((root) => root.path) ?? []);
};
registerWorkflowArtifactsIpc({ registrar, getHost: () => host, readFile: readFixtureFile });
registerRequirementsIpc({ registrar, getHost: () => host, readFile: readFixtureFile });
registrar.handle(IPC.invoke.fsRead, async (input: { path: string }) => readFixtureFile(input.path));
ipcMain.handle("workflow.artifacts.fixture", async (_event, name, input) => {
  if (name === "pauseOpen") {
    interceptNextArtifactOpen = true;
    readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    heldRead = new Promise((resolve) => { releaseHeldRead = resolve; });
    readFinished = new Promise((resolve) => { markReadFinished = resolve; });
    return;
  }
  if (name === "waitOpen") return readStarted;
  if (name === "releaseOpen") { releaseHeldRead(); return readFinished; }
  if (name === "setWorkspace") return host!.call("workspace.set", { path: input });
  if (name === "writeRequirements") return writeFile(join(projectA, "requirements.md"), String(input), "utf8");
  if (name === "pauseRequirementsPreview") {
    interceptNextRequirementsPreview = true;
    readStarted = new Promise((resolve) => { markReadStarted = resolve; });
    heldRead = new Promise((resolve) => { releaseHeldRead = resolve; });
    readFinished = new Promise((resolve) => { markReadFinished = resolve; });
    return;
  }
  if (name === "removeFile") return unlink(join(projectA, "docs/glossary.md"));
  if (name === "detachRoot") {
    const destination = join(__dirname, "project-a-offline");
    if (![projectA, destination].every((path) => resolve(path).startsWith(resolve(__dirname) + sep))) throw new Error("fixture root escaped scratch directory");
    return rename(projectA, destination);
  }
  throw new Error("unknown artifact fixture action");
});
ipcMain.handle("workflow.fixture.pauseNextRead", () => {
  interceptNextHistoryRead = true;
  readStarted = new Promise((resolve) => { markReadStarted = resolve; });
  heldRead = new Promise((resolve) => { releaseHeldRead = resolve; });
  readFinished = new Promise((resolve) => { markReadFinished = resolve; });
});
ipcMain.handle("workflow.fixture.waitForReadStart", () => readStarted);
ipcMain.handle("workflow.fixture.releaseRead", () => { releaseHeldRead(); });
ipcMain.handle("workflow.fixture.waitForReadFinish", () => readFinished);
ipcMain.handle(IPC.invoke.projectRemove, async (_event, input: { path?: unknown } = {}) => {
  if (typeof input.path !== "string") throw new Error("project path required");
  return host!.call("projects.remove", { path: input.path });
});

app.on("window-all-closed", () => { void stop(0); });

async function main(): Promise<void> {
  await Promise.all([mkdir(projectA, { recursive: true }), mkdir(projectB, { recursive: true })]);
  if (process.env.PI_WORKFLOW_ARTIFACTS === "1" || process.env.PI_REQUIREMENTS_CONFIRMATION === "1") {
    await mkdir(join(projectA, "docs"), { recursive: true });
    await writeFile(join(projectA, "docs/glossary.md"), "# Workflow glossary\n\nA Workflow Project is a logical project group.", "utf8");
    await writeFile(join(projectB, "outside.md"), "Fixture outside content.", "utf8");
    await symlink(projectB, join(projectA, "escape"), process.platform === "win32" ? "junction" : "dir");
  }
  host = new HostProcess({
    binaryPath,
    dataDir,
    env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") },
    onStderr: (text) => console.error(`[host-core] ${text.trimEnd()}`),
  });
  await app.whenReady();
  try {
    await host.handshake();
    if (process.env.PI_CODING_WORKBENCH === "1") await host.call("skills.ensureBundled");
    await host.call("workspace.set", { path: projectA });
    await host.call("project.group.create", { name: "Project A", folders: [projectA] });
    await host.call("workspace.set", { path: projectB });
    await host.call("project.group.create", { name: "Project B", folders: [projectB] });
    let sessionId = "";
    let otherSessionId = "";
    if (discoveryFixture) {
      const first = await host.call<{ session: { id: string } }>("session.create", { projectPath: projectA, mode: "agent", title: "Workflow fixture A" });
      const second = await host.call<{ session: { id: string } }>("session.create", { projectPath: projectB, mode: "agent", title: "Workflow fixture B" });
      sessionId = first.session.id;
      otherSessionId = second.session.id;
      for (const stage of WORKFLOW_STAGES) {
        await host.call("skills.create", { id: stage.skillId, name: stage.skillId, body: "Perform this engineering stage. Do not claim stage acceptance.", level: "project", projectPath: projectA });
      }
    }

    const window = new BrowserWindow({
      show: false,
      width: 900,
      height: 760,
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    window.webContents.on("console-message", (event) => console.error(event.message));
    await window.loadFile(join(__dirname, "index.html"), {
      query: { projectA, projectB, sessionId, otherSessionId },
    });
    try {
      let result;
      if (process.env.PI_SKILL_SHORTCUTS === "1") {
        const checkpoint = await window.webContents.executeJavaScript("globalThis.shortcutSettingsProbe()");
        await host.dispose();
        host = new HostProcess({ binaryPath, dataDir, env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") }, onStderr: (text) => console.error(text.trimEnd()) });
        await host.handshake();
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        result = await window.webContents.executeJavaScript(`globalThis.shortcutSettingsRestored(${JSON.stringify(checkpoint)})`);
      } else if (process.env.PI_REQUIREMENTS_CONFIRMATION === "1") {
        const checkpoint = await window.webContents.executeJavaScript("globalThis.requirementsConfirmationProbe()");
        await host.dispose();
        host = new HostProcess({ binaryPath, dataDir, env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") }, onStderr: (text) => console.error(text.trimEnd()) });
        await host.handshake();
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        result = await window.webContents.executeJavaScript(`globalThis.requirementsConfirmationRestored(${JSON.stringify(checkpoint)})`);
      } else if (process.env.PI_CODING_WORKBENCH === "1") {
        result = await window.webContents.executeJavaScript(`globalThis.codingWorkbenchProbe(${process.env.PI_REQUIREMENTS_MENU === "1"})`);
      } else if (process.env.PI_WORKFLOW_ARTIFACTS === "1") {
        const checkpoint = await window.webContents.executeJavaScript("globalThis.workflowArtifactsProbe()");
        await host.dispose();
        host = new HostProcess({ binaryPath, dataDir, env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") }, onStderr: (text) => console.error(text.trimEnd()) });
        await host.handshake();
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        result = await window.webContents.executeJavaScript(`globalThis.workflowArtifactsRestored(${JSON.stringify(checkpoint)})`);
      } else if (process.env.PI_WORKFLOW_REOPEN === "1") {
        const checkpoint = await window.webContents.executeJavaScript("globalThis.workflowReopenProbe()");
        await host.dispose();
        host = new HostProcess({ binaryPath, dataDir, env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") }, onStderr: (text) => console.error(text.trimEnd()) });
        await host.handshake();
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        result = await window.webContents.executeJavaScript(`globalThis.workflowReopenRestored(${JSON.stringify(checkpoint)})`);
      } else if (process.env.PI_WORKFLOW_STAGES === "1") {
        result = await window.webContents.executeJavaScript("globalThis.workflowStagesProbe()");
      } else if (discoveryFixture) {
        const running = await window.webContents.executeJavaScript("globalThis.workflowDiscoveryProbe()");
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        const checkpoint = await window.webContents.executeJavaScript(`globalThis.workflowDiscoveryResume(${JSON.stringify(running)})`);
        const oldHost = host;
        await crashWorkflowFixtureHost(oldHost);
        host = null;
        await executionFixture!.dispose();
        host = new HostProcess({ binaryPath, dataDir, env: { PI_DESKTOP_AGENTS_DIR: join(__dirname, "agents") }, onStderr: (text) => console.error(text.trimEnd()) });
        await host.handshake();
        await window.loadFile(join(__dirname, "index.html"), { query: { projectA, projectB, sessionId, otherSessionId } });
        result = await window.webContents.executeJavaScript(`globalThis.${process.env.PI_WORKFLOW_RECOVERY === "1" ? "workflowRecoveryRecovered" : "workflowDiscoveryRecovered"}(${JSON.stringify(checkpoint)})`);
      } else {
        result = await window.webContents.executeJavaScript("globalThis.workflowRunsProbe()");
      }
      console.log(`WORKFLOW_RUNS_PROBE ${JSON.stringify(result)}`);
      if (!result || typeof result !== "object" || !(result as { ok?: boolean }).ok) {
        throw new Error("renderer workflow acceptance probe failed");
      }
      window.close();
    } catch (error) {
      console.error("WORKFLOW_RUNS_PROBE_ERROR", error instanceof Error ? error.stack : String(error));
      await stop(1);
    }
  } catch (error) {
    console.error("WORKFLOW_RUNS_START_ERROR", error instanceof Error ? error.stack : String(error));
    await stop(1);
  }
}

void main();
