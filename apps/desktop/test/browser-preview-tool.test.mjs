import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidecarSource = await readFile(
  new URL("../electron/main/agent-sidecar.ts", import.meta.url),
  "utf8",
);
const mainSource = await readFile(
  new URL("../electron/main/index.ts", import.meta.url),
  "utf8",
);
const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const apiSource = await readFile(
  new URL("../src/lib/api.ts", import.meta.url),
  "utf8",
);
const protocolSource = await readFile(
  new URL("../../../packages/shared/src/protocol.ts", import.meta.url),
  "utf8",
);
const runtimeSource = await readFile(
  new URL("../../../packages/agent-runtime/src/runtime.ts", import.meta.url),
  "utf8",
);

test("sidecar routes main-local tools before the host-core proxy", () => {
  // Local tools short-circuit tools.execute; other methods still proxy.
  assert.match(sidecarSource, /setLocalTool\(name: string, handler: LocalToolHandler\)/);
  assert.match(
    sidecarSource,
    /method === "tools\.execute"\s*\?\s*this\.localTools\.get/,
  );
  // Host availability is only required on the proxy path, after local
  // dispatch — a local tool must work even if host-core is restarting.
  const proxyBranch = sidecarSource.slice(
    sidecarSource.indexOf('msg.method === "host.proxy"'),
  );
  assert.ok(
    proxyBranch.indexOf("this.localTools.get") <
      proxyBranch.indexOf('throw new Error("host unavailable")'),
  );
});

test("main serves BrowserPreview: workspace-gated navigate + renderer event", () => {
  assert.match(mainSource, /s\.setLocalTool\("BrowserPreview"/);
  // Path must resolve to a real file inside the workspace before navigating.
  const handler = mainSource.slice(
    mainSource.indexOf('s.setLocalTool("BrowserPreview"'),
    mainSource.indexOf("sidecar = s;"),
  );
  assert.ok(
    handler.indexOf("resolveLocalFile(raw, root)") <
      handler.indexOf("browserPane.navigate(raw, root)"),
  );
  assert.match(handler, /sendToRenderer\(IPC\.event\.browserPreview/);
  assert.match(protocolSource, /browserPreview: "pi-desktop\/browser\/event\/preview"/);
});

test("renderer surfaces the browser tab when the agent opens a preview", () => {
  assert.match(apiSource, /onBrowserPreview:/);
  assert.match(
    appSource,
    /api\.onBrowserPreview\(\(\) => \{\s*useAppStore\.getState\(\)\.openWorkPanelTab\(toolWorkPanelTab\("browser"\)\);/,
  );
  assert.match(appSource, /offBrowserPreview\(\);/);
});

test("agent runtime exposes BrowserPreview in every mode and prompts for it", () => {
  assert.match(
    runtimeSource,
    /const tools = \["Read", "Glob", "Grep", "BrowserPreview"\];/,
  );
  assert.match(
    runtimeSource,
    /toolName === "Read" \|\| toolName === "BrowserPreview"/,
  );
  // Default system prompt teaches the live-reload contract: one call per page.
  assert.match(runtimeSource, /call the BrowserPreview tool/);
  assert.match(runtimeSource, /live-reloads/);
});
