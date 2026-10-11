import { createRequire } from "node:module";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const option = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
const sourceRoot = resolve(option("--source-root") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const overlayRoot = resolve(option("--overlay-root") ?? sourceRoot);
const require = createRequire(join(sourceRoot, "apps/desktop/package.json"));
const { build } = require("esbuild");
const scratch = await mkdtemp(join(tmpdir(), "pi-task-graph-viewer-"));
const findSource = path => [path, `${path}.ts`, `${path}.tsx`, `${path}.css`, path.replace(/\.js$/, ".ts"), path.replace(/\.js$/, ".tsx")].find(existsSync);
try {
  await build({ entryPoints: [join(overlayRoot, "scripts/e2e/task-graph-viewer.tsx")], bundle: true, format: "esm", platform: "browser", target: "es2022", jsx: "automatic", outfile: join(scratch, "fixture.js"),
    nodePaths: [join(sourceRoot, "node_modules"), join(sourceRoot, "apps/desktop/node_modules")],
    alias: { "@pi-desktop/shared": join(sourceRoot, "packages/shared/src/index.ts"), "@pi-desktop/i18n": join(sourceRoot, "packages/i18n/src/index.ts") },
    plugins: [{ name: "review-overlay", setup(builder) {
      builder.onResolve({ filter: /^\./ }, args => {
        const path = resolve(args.resolveDir, args.path);
        const normalized = path.replaceAll("\\", "/");
        const source = sourceRoot.replaceAll("\\", "/"), overlay = overlayRoot.replaceAll("\\", "/");
        if (normalized.startsWith(overlay)) { const found = findSource(path) ?? findSource(normalized.replace(overlay, source)); if (found) return { path: found }; }
        if (normalized.startsWith(source)) { const found = findSource(normalized.replace(source, overlay)); if (found) return { path: found }; }
      });
    } }],
  });
  await writeFile(join(scratch, "index.html"), '<div id="root"></div><script>window.piDesktop={platform:"win32",on:()=>()=>{},invoke:async()=>{throw Error("Unexpected Host request")}};</script><script type="module" src="./fixture.js"></script>');
  await writeFile(join(scratch, "main.cjs"), `const {app,BrowserWindow,session}=require('electron');
app.setPath('userData', ${JSON.stringify(join(scratch, "profile"))});
app.whenReady().then(async()=>{session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('data:')}));const window=new BrowserWindow({show:false,webPreferences:{contextIsolation:false,nodeIntegration:false,sandbox:true}});await window.loadFile(${JSON.stringify(join(scratch, "index.html"))});try{const result=await window.webContents.executeJavaScript(\`new Promise((resolve,reject)=>{const deadline=Date.now()+15000;const ready=()=>{if(window.taskGraphProbe)window.taskGraphProbe().then(resolve,reject);else if(Date.now()>deadline)reject(Error('Fixture did not mount'));else requestAnimationFrame(ready)};ready()})\`);console.log(JSON.stringify(result));app.exit(0);}catch(error){console.error(error.stack||String(error));app.exit(1);}}).catch(error=>{console.error(error);app.exit(1)});`);
  const electronDirectory = dirname(require.resolve("electron"));
  const binary = join(electronDirectory, "dist", (await readFile(join(electronDirectory, "path.txt"), "utf8")).trim());
  if (!existsSync(binary)) throw new Error("Existing Electron binary unavailable");
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
  const child = spawn(binary, [join(scratch, "main.cjs")], { env: environment, windowsHide: true, stdio: "inherit" });
  const timeout = setTimeout(() => child.kill(), 30_000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(timeout);
  if (code !== 0) throw new Error(`Task graph interaction fixture failed: ${code}`);
} finally {
  if (!resolve(scratch).startsWith(resolve(tmpdir()) + "/") && !resolve(scratch).startsWith(resolve(tmpdir()) + "\\")) throw new Error("Scratch directory outside temporary root");
  await rm(scratch, { recursive: true, force: true });
}
