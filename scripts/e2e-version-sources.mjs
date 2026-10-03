#!/usr/bin/env node
/** 在隔离的 Electron 中验证实际版本设置组件与样式。 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repositoryRoot, resolveElectronBinary } from "./e2e/boot.mjs";

const root = repositoryRoot();
const { build } = createRequire(join(root, "packages/agent-runtime/package.json"))("esbuild");
const cacheRoot = join(root, "cache", "verification");
await mkdir(cacheRoot, { recursive: true });
const temp = await mkdtemp(join(cacheRoot, "version-sources-"));
try {
  if (process.argv.includes("--controller")) {
    await build({ entryPoints: [join(root, "scripts/e2e/fork-updater.mjs")],
      outfile: join(temp, "controller.cjs"), bundle: true, platform: "node", format: "cjs", external: ["electron"],
      nodePaths: [join(root, "apps/desktop/node_modules")],
      // 仅替换发布网络和安装器边界，执行真实的更新控制器。
      plugins: [{ name: "updater-boundaries", setup(build) {
        build.onResolve({ filter: /^electron-updater$/ }, () => ({path: "updater", namespace: "fixture"}));
        build.onResolve({ filter: /skill-market-catalog$/ }, () => ({path: "releases", namespace: "fixture"}));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({loader: "js", contents: args.path === "releases"
          ? 'export async function fetchVersionSource() { return [{tag_name:"v0.17.0",draft:false,prerelease:false}]; }'
          : 'import {EventEmitter} from "node:events"; class Updater extends EventEmitter { setFeedURL(feed) { this.feed = feed; } } const autoUpdater = new Updater(); export default {autoUpdater, NsisUpdater: Updater};' }));
      }}],
    });
  }
  if (process.argv.includes("--live-network")) {
    await build({ entryPoints: [join(root, "scripts/e2e/version-sources-live.ts")],
      outfile: join(temp, "live.cjs"), bundle: true, platform: "node", format: "cjs", external: ["electron"],
      nodePaths: [join(root, "apps/desktop/node_modules")],
    });
  }
  await build({ entryPoints: [join(root, "scripts/e2e/version-sources.jsx")],
    outfile: join(temp, "renderer.js"), bundle: true, platform: "browser", format: "esm", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
    alias: { "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"),
      react: join(root, "apps/desktop/node_modules/react"),
      "react-dom": join(root, "apps/desktop/node_modules/react-dom"),
      i18next: join(root, "apps/desktop/node_modules/i18next"),
      "react-i18next": join(root, "apps/desktop/node_modules/react-i18next") },
    nodePaths: [join(root, "apps/desktop/node_modules")],
  });
  const renderer = join(root, "apps/desktop/out/renderer");
  const html = await readFile(join(renderer, "index.html"), "utf8");
  const css = [...html.matchAll(/href="([^" ]+\.css)"/g)].map((match) => match[1]);
  assert(css.length, "Run pnpm build:js before this test");
  await cp(join(renderer, "assets"), join(temp, "assets"), { recursive: true });
  await writeFile(join(temp, "index.html"), `<!doctype html><html data-platform="darwin"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:">${css.map((path) => `<link rel="stylesheet" href="${path}">`).join("")}</head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>`);
  await writeFile(join(temp, "main.cjs"), `
const { app, BrowserWindow } = require("electron");
const path = require("node:path");
app.setPath("userData", path.join(__dirname, "profile"));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 720,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", (event) => console.error(event.message));
  try {
    await win.loadFile(path.join(__dirname, "index.html"));
    const result = await win.webContents.executeJavaScript("window.settingsScrollProbe()");
    console.log("SETTINGS_SCROLL " + JSON.stringify(result));
    if (require("node:fs").existsSync(path.join(__dirname, "controller.cjs"))) {
      console.log("FORK_UPDATER " + JSON.stringify(await require(path.join(__dirname, "controller.cjs")).probe()));
    }
    ${process.argv.includes("--screenshot") ? `require("node:fs").writeFileSync(${JSON.stringify(join(cacheRoot, "version-sources.png"))}, (await win.webContents.capturePage()).toPNG());` : ""}
    if (require("node:fs").existsSync(path.join(__dirname, "live.cjs"))) {
      console.log("VERSION_SOURCES_LIVE " + JSON.stringify(await require(path.join(__dirname, "live.cjs")).probe()));
    }
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(resolveElectronBinary(root).electronBinary, [join(temp, "main.cjs")], { env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { output += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  let code;
  try { code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }); }
  finally { clearTimeout(timer); }
  assert.equal(code, 0, output);
  const result = output.split(/\r?\n/).find((line) => line.startsWith("SETTINGS_SCROLL "));
  assert(result, output);
  console.log(result);
  const liveResult = output.split(/\r?\n/).find((line) => line.startsWith("VERSION_SOURCES_LIVE "));
  if (liveResult) console.log(liveResult);
  const controllerResult = output.split(/\r?\n/).find((line) => line.startsWith("FORK_UPDATER "));
  if (controllerResult) console.log(controllerResult);
} finally { await rm(temp, { recursive: true, force: true }); }
