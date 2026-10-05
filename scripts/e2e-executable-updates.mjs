import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createServer as createPortProbe, connect } from "node:net";
import { Host, resolveHostBinary } from "./e2e/host.mjs";
import { waitFor } from "./e2e/wait.mjs";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(join(root,"apps/desktop/package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const assetDirectory = join(root,"apps/desktop/out/renderer/assets");
const styleAsset = (await readdir(assetDirectory)).find(name => /^index-.*\.css$/.test(name));
if (!styleAsset) throw new Error("Build Desktop before the update UI E2E");
const stylesheet = await readFile(join(assetDirectory,styleAsset),"utf8");
const styleUrl = "/out/renderer/assets/"+styleAsset;
const base = join(root,".pi-desktop-test");
await mkdir(base,{recursive:true});
const artifacts = await mkdtemp(join(base,"executable-updates-"));
const dataDir = join(artifacts,"host-profile"), agents = join(artifacts,"empty-agents");
await mkdir(dataDir); await mkdir(agents);
const previousAgents = process.env.PI_DESKTOP_AGENTS_DIR;
process.env.PI_DESKTOP_AGENTS_DIR = agents;
const host = new Host(resolveHostBinary(),dataDir);
let server, child, socket;
let sequence=0;
const pending=new Map();
let output="";
const send=(method,params={})=>new Promise((resolveResult,reject)=>{
  const id=++sequence;
  const timer=setTimeout(()=>{pending.delete(id);reject(new Error("CDP timed out: "+method));},20000);
  pending.set(id,{resolve:resolveResult,reject,timer});socket.send(JSON.stringify({id,method,params}));
});
const evaluate=async expression=>{
  const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||JSON.stringify(result.exceptionDetails));
  return result.result.value;
};
const button=(text)=>`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)})`;
const click=async text=>evaluate(`${button(text)}.click()`);
const disabled=async text=>evaluate(`${button(text)}?.disabled`);
const textIncludes=async text=>evaluate(`Boolean(document.body?.textContent.includes(${JSON.stringify(text)}))`);
const noListener=port=>new Promise(resolveResult=>{
  const probe=connect({host:"127.0.0.1",port});
  probe.once("connect",()=>{probe.destroy();resolveResult(false);});
  probe.once("error",()=>resolveResult(true));
});
let debugPort, vitePort;
try {
  await host.start();
  const original=await host.call("skills.ensureBundled");
  const bundle=JSON.parse(await readFile(join(root,"crates/host-core/resources/workflow-skills.json"),"utf8"));
  bundle.revision="c".repeat(40);
  bundle.packages[0].files.find(f=>f.path==="SKILL.md").content+="\nUpdate E2E fixture.";
  const {session}=await host.call("session.create",{title:"Update gate fixture",mode:"agent"});
  const {turnId}=await host.call("session.beginTurn",{sessionId:session.id});
  for(const method of ["skills.updateBundled","skills.restoreBundled","updates.prepareInstall"]) {
    await assert.rejects(host.call(method,method==="skills.updateBundled"?bundle:{}),error=>error.errorCode==="TASKS_RUNNING");
  }
  await host.call("session.endTurn",{turnId,status:"completed",createNotification:false});
  await host.call("skills.updateBundled",bundle);
  assert.equal((await host.call("skills.getBundledVersion")).hasBackup,true);
  const restored=await host.call("skills.restoreBundled");
  assert.equal(restored.revision,original.revision);
  await host.call("settings.set",{updateChannel:"stable"});
  assert.equal((await host.call("settings.get")).updateChannel,"stable");
  await assert.rejects(host.call("settings.set",{updateChannel:"invalid"}));
  await host.call("updates.prepareInstall");
  await assert.rejects(host.call("session.beginTurn",{sessionId:session.id}),error=>error.errorCode==="UPDATE_INSTALLING");
  await host.call("updates.cancelInstall");
  const resumed=await host.call("session.beginTurn",{sessionId:session.id});
  await host.call("session.endTurn",{turnId:resumed.turnId,status:"completed",createNotification:false});
  await host.stop();
  console.log("Host update/restore, task gates, installer admission fence and channel persistence: PASS");

  server=await createServer({
    root:join(root,"apps/desktop"),configFile:false,logLevel:"error",plugins:[{
      name:"built-update-fixture-styles",
      transformIndexHtml: html => html.replace("</head>",`<link rel="stylesheet" href="${styleUrl}"></head>`),
      configureServer: instance => { instance.middlewares.use((request,response,next) => {
        if (request.url !== styleUrl) return next();
        response.setHeader("Content-Type","text/css");response.end(stylesheet);
      }); },
    }],
    esbuild:{jsx:"automatic"},resolve:{alias:{
      "@pi-desktop/shared":join(root,"packages/shared/src/index.ts"),
      "@pi-desktop/i18n":join(root,"packages/i18n/src/index.ts"),
    }},
    server:{host:"127.0.0.1",port:0,strictPort:true},
  });
  await server.listen(); vitePort=server.httpServer.address().port;
  const probe=createPortProbe();probe.listen(0,"127.0.0.1");await once(probe,"listening");
  debugPort=probe.address().port;await new Promise(resolveClose=>probe.close(resolveClose));
  const launcher=join(artifacts,"electron.cjs");
  await writeFile(launcher,`const {app,BrowserWindow}=require("electron");
app.whenReady().then(()=>{const window=new BrowserWindow({show:false,width:1280,height:850,webPreferences:{contextIsolation:true,sandbox:true,backgroundThrottling:false}});window.loadURL(${JSON.stringify(`http://127.0.0.1:${vitePort}/test/fixtures/updates-ui.html`)});});
app.on('window-all-closed',()=>app.quit());`,"utf8");
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  child=spawn(require("electron"),[launcher,`--remote-debugging-port=${debugPort}`,`--user-data-dir=${join(artifacts,"electron-profile")}`],{env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  for(const stream of [child.stdout,child.stderr])stream.on("data",chunk=>{output=(output+chunk).slice(-5000);});
  let target;
  await waitFor(async()=>{
    if(child.exitCode!==null)throw new Error(output);
    try {target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item=>item.type==="page");return !!target;}catch{return false;}
  },30000,"isolated Electron fixture");
  socket=new WebSocket(target.webSocketDebuggerUrl);await once(socket,"open");
  socket.onmessage=({data})=>{const message=JSON.parse(data),entry=pending.get(message.id);if(!entry)return;pending.delete(message.id);clearTimeout(entry.timer);if(message.error)entry.reject(new Error(JSON.stringify(message.error)));else entry.resolve(message.result);};
  await waitFor(()=>textIncludes("Matt Pocock 技能包"),30000,"production update component");
  await evaluate("document.fonts.ready.then(()=>true)");
  assert.equal(await textIncludes("PI-Desktop 原版"),false);
  await click("预发布版");
  await click("稳定版");
  await waitFor(()=>textIncludes("稳定版"),5000,"channel selection");
  assert.equal(await evaluate("window.fixture.calls.some(c=>c.endsWith('/updates/setChannel'))"),true);
  await click("检查全部更新");
  await waitFor(async()=>!await disabled("更新技能包")&&!await disabled("下载新版"),5000,"available updates");
  await click("更新技能包");
  await waitFor(async()=>!await disabled("恢复上次备份"),5000,"skill backup action");
  assert.equal(await textIncludes("retro"),true);
  await click("恢复上次备份");
  await waitFor(()=>disabled("恢复上次备份"),5000,"restore settled");
  await evaluate("window.fixture.running(true)");
  await waitFor(()=>disabled("更新技能包"),5000,"running task blocks skills");
  await evaluate("window.fixture.running(false)");
  await waitFor(async()=>!await disabled("更新技能包"),5000,"task completion unblocks skills");
  await click("下载新版");
  await waitFor(()=>textIncludes("50%"),5000,"download progress");
  await evaluate("window.fixture.finishDownload()");
  await waitFor(()=>textIncludes("重启并更新"),5000,"explicit installer action");
  await evaluate("window.fixture.running(true)");
  await waitFor(()=>disabled("重启并更新"),5000,"running task blocks restart");
  await evaluate("window.fixture.running(false)");
  await waitFor(async()=>!await disabled("重启并更新"),5000,"restart unblocked");
  const installedState = await evaluate(`({
    text: document.body.textContent,
    buttons: [...document.querySelectorAll('button')].map(button => {
      const rect = button.getBoundingClientRect();
      return {text:button.textContent.trim(),disabled:button.disabled,width:rect.width,height:rect.height,
        insideViewport:rect.left>=0&&rect.top>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight};
    })
  })`);
  const restartButton = installedState.buttons.find(button => button.text === "重启并更新");
  assert.ok(restartButton.width > 0 && restartButton.height > 0 && restartButton.insideViewport);
  await writeFile(join(artifacts,"updates-installed-state.json"),JSON.stringify(installedState,null,2),"utf8");
  await click("重启并更新");
  assert.equal(await evaluate("window.fixture.calls.filter(c=>c.endsWith('/updates/install')).length"),1);
  await evaluate("window.fixture.manual()");
  await click("检查全部更新");
  await waitFor(async()=>!await disabled("下载新版"),5000,"portable update");
  await click("下载新版");await evaluate("window.fixture.finishDownload()");
  await waitFor(()=>textIncludes("手动替换"),5000,"portable replacement guidance");
  assert.equal(await textIncludes("重启并更新"),false);
  await writeFile(join(artifacts,"updates-portable-state.txt"),await evaluate("document.body.textContent"),"utf8");
  console.log("Electron component user path, local conflict display, running-task blocks and Portable controls: PASS");
  console.log("Artifacts: "+artifacts);
} finally {
  for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(new Error("fixture disposed"));}
  pending.clear();socket?.close();
  if(child&&child.exitCode===null){child.kill();await once(child,"exit");}
  await server?.close();await host.stop();
  if(previousAgents===undefined)delete process.env.PI_DESKTOP_AGENTS_DIR;else process.env.PI_DESKTOP_AGENTS_DIR=previousAgents;
  if(debugPort)assert.equal(await noListener(debugPort),true,"debug port released");
  if(vitePort)assert.equal(await noListener(vitePort),true,"fixture server port released");
}
