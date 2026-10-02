import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveElectronBinary } from "./e2e/boot.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));
const recoveryFixture = process.argv.includes("--recovery");
const stagesFixture = process.argv.includes("--stages");
const reopenFixture = process.argv.includes("--reopen");
const artifactsFixture = process.argv.includes("--artifacts");
const discoveryFixture = process.argv.includes("--discovery") || recoveryFixture || stagesFixture || reopenFixture || artifactsFixture;
const scratchRoot = join(root, ".pi-desktop-test");
await mkdir(scratchRoot, { recursive: true });
const require = createRequire(join(root, "packages/agent-runtime/package.json"));
const { build } = require("esbuild");
const { electronBinary } = resolveElectronBinary(root);
const hostBinary = join(root, "target/debug", `pi-desktop-host-core${process.platform === "win32" ? ".exe" : ""}`);
const temp = await mkdtemp(join(scratchRoot, "workflow-runs-"));
const tempResolved = resolve(temp);
if (!tempResolved.startsWith(`${resolve(scratchRoot)}${sep}`)) {
  throw new Error("workflow E2E scratch directory escaped the project scratch root");
}

try {
  await build({
    entryPoints: [join(root, artifactsFixture ? "scripts/e2e/workflow-artifacts.tsx" : reopenFixture ? "scripts/e2e/workflow-reopen.tsx" : stagesFixture ? "scripts/e2e/workflow-stages.tsx" : recoveryFixture ? "scripts/e2e/workflow-recovery.tsx" : discoveryFixture ? "scripts/e2e/workflow-discovery.tsx" : "scripts/e2e/workflow-runs.tsx")],
    outfile: join(temp, "renderer.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    jsx: "automatic",
    loader: { ".css": "empty" },
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"),
      "@pi-desktop/shared": join(root, "packages/shared/src/index.ts"),
      react: join(root, "apps/desktop/node_modules/react"),
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
    },
    nodePaths: [join(root, "apps/desktop/node_modules")],
  });

  await build({
    entryPoints: [join(root, "scripts/e2e/workflow-main.ts")],
    outfile: join(temp, "main.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    banner: { js: 'import { createRequire as __fixtureCreateRequire } from "node:module"; import { fileURLToPath as __fixtureFilePath } from "node:url"; import { dirname as __fixtureDirectory } from "node:path"; const require = __fixtureCreateRequire(import.meta.url); const __dirname = __fixtureDirectory(__fixtureFilePath(import.meta.url));' },
    external: ["electron"],
    alias: {
      "@pi-desktop/shared": join(root, "packages/shared/src/index.ts"),
    },
    nodePaths: [join(root, "apps/desktop/node_modules"), join(root, "packages/host-runtime/node_modules")],
  });

  const styleNames = ["tokens", "base", "ui-kit", "work-panel"];
  const styles = (await Promise.all(styleNames.map((name) =>
    readFile(join(root, `apps/desktop/src/styles/${name}.css`), "utf8"),
  ))).join("\n").replace(/@theme(?: inline)?/g, ":root");
  await writeFile(join(temp, "styles.css"), `${styles}
    body { margin: 0; background: var(--ds-bg-primary); }
    .workflow-tab { height: 100vh; }
    .fixture-controls { position: fixed; z-index: 1000; inset: 0 0 auto; display: flex;
      gap: 8px; padding: 10px; background: #171717; color: #fff; }
  `, "utf8");
  await writeFile(join(temp, "index.html"), `<!doctype html><html lang="en"><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:">
    <link rel="stylesheet" href="styles.css"><body><div id="root"></div>
    <script type="module" src="renderer.js"></script></body></html>`, "utf8");
  await writeFile(join(temp, "preload.cjs"), `
    const { contextBridge, ipcRenderer } = require("electron");
    contextBridge.exposeInMainWorld("piDesktop", {
      invoke: async (channel, ...args) => {
        try { const result = await ipcRenderer.invoke(channel, ...args); return typeof result?.ok === "boolean" ? result : { ok: true, data: result }; }
        catch (error) { return { ok: false, error: { message: error.message, code: error.errorCode } }; }
      },
    });
    contextBridge.exposeInMainWorld("workflowFixture", {
      artifactAction: (name, input) => ipcRenderer.invoke("workflow.artifacts.fixture", name, input),
      action: (name, input) => ipcRenderer.invoke("workflow.discovery.fixture", name, input),
      pauseNextRead: () => ipcRenderer.invoke("workflow.fixture.pauseNextRead"),
      waitForReadStart: () => ipcRenderer.invoke("workflow.fixture.waitForReadStart"),
      releaseRead: () => ipcRenderer.invoke("workflow.fixture.releaseRead"),
      waitForReadFinish: () => ipcRenderer.invoke("workflow.fixture.waitForReadFinish"),
    });
  `, "utf8");

  const env = { ...process.env, PI_DESKTOP_HOST_BIN: hostBinary, PI_WORKFLOW_ARTIFACTS: artifactsFixture ? "1" : "0", PI_WORKFLOW_DISCOVERY: discoveryFixture ? "1" : "0", PI_WORKFLOW_REOPEN: reopenFixture ? "1" : "0", PI_WORKFLOW_STAGES: stagesFixture ? "1" : "0", PI_WORKFLOW_RECOVERY: recoveryFixture ? "1" : "0", PI_WORKFLOW_REPO_ROOT: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electronBinary, [join(temp, "main.mjs")], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (data) => { output += data; });
  }
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, 60000);
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  }).finally(() => clearTimeout(timeout));

  if (timedOut && process.platform === "win32" && child.pid) {
    await execFileAsync("taskkill", ["/PID", String(child.pid), "/T", "/F"]).catch(() => {});
  }
  const resultLine = output.split(/\r?\n/).find((line) => line.startsWith("WORKFLOW_RUNS_PROBE "));
  console.log(resultLine ?? output.slice(-5000));
  assert.equal(timedOut, false, `workflow E2E timed out: ${output.slice(-5000)}`);
  assert.ok(resultLine, `workflow E2E returned no result (exit=${exitCode}): ${output.slice(-5000)}`);
  assert.equal(exitCode, 0, output.slice(-5000));
  const result = JSON.parse(resultLine.slice("WORKFLOW_RUNS_PROBE ".length));
  assert.equal(result.ok, true);
  if (artifactsFixture) {
    assert.equal(result.registeredBeforeExecution, true);
    assert.equal(result.previewed, true);
    assert.equal(result.persisted, true);
    assert.equal(result.unavailableRetained, true);
  } else if (reopenFixture) {
    assert.equal(result.reopened, true);
    assert.equal(result.restartRetained, true);
    assert.equal(result.promptCount, 7);
  } else if (stagesFixture) {
    assert.equal(result.completed, true);
    assert.equal(result.doneAndNewRun, true);
    assert.equal(result.promptCount, 9);
  } else if (discoveryFixture) {
    assert.equal(result.restartInterrupted, true);
    assert.equal(result.promptCount, recoveryFixture ? 10 : 4);
    assert.equal(result.specStayedLocked, true);
    assert.equal(result.skillLoads, recoveryFixture ? 10 : 4);
  } else {
  assert.equal(result.projectAAvailableAfterRemoval, false);
  assert.equal(result.projectBHasNoRun, true);
  assert.equal(result.discoveryOnly, true);
  assert.equal(result.archivedBindingReadOnly, true);
  assert.deepEqual(result.projectARuns, [
    { title: "First project effort", outcome: "archived" },
    { title: "Second project effort", outcome: "active" },
  ]);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
