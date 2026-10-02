import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Host } from "./e2e/host.mjs";
import { waitFor } from "./e2e/wait.mjs";

const root = resolve(import.meta.dirname, "..");
const packageDir = resolve(process.env.PI_SKILLS_PACKAGE_DIR || join(root, "apps/desktop/release/win-unpacked"));
const scratch = join(root, ".pi-desktop-test");
await mkdir(scratch, { recursive: true });
const artifacts = await mkdtemp(join(scratch, "packaged-skills-"));
const dataDir = join(artifacts, "data");
const project = join(artifacts, "project");
const agents = join(artifacts, "empty-agents");
await Promise.all([mkdir(dataDir), mkdir(project), mkdir(agents)]);
const previousAgents = process.env.PI_DESKTOP_AGENTS_DIR;
process.env.PI_DESKTOP_AGENTS_DIR = agents;
const host = new Host(join(packageDir, "resources/bin/pi-desktop-host-core.exe"), dataDir);
let app;
let ws;
let evaluate;
let send;
let output = "";
let round = 0;
let skillSequence = ["grill-with-docs", "grilling", "domain-modeling"];
const requests = [];
const provider = createServer(async (req, res) => {
  if (req.method !== "POST") { res.writeHead(200, {"Content-Type":"application/json"}); res.end(JSON.stringify({data:[{id:"skill-fixture"}]})); return; }
  let raw = ""; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body.messages);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({id:"fixture-skills",object:"chat.completion.chunk",created:1,model:"skill-fixture",choices:[{index:0,delta,finish_reason}]})}\n\n`);
  const id = skillSequence[round++];
  if (id) {
    chunk({role:"assistant",tool_calls:[{index:0,id:`skill-${requests.length}-${round}`,type:"function",function:{name:"Skill",arguments:JSON.stringify({id})}}]});
    chunk({}, "tool_calls");
  } else { chunk({role:"assistant",content:"PACKAGED_SKILL_SUCCESS"}); chunk({}, "stop"); }
  res.write("data: [DONE]\n\n"); res.end();
});

async function launch() {
  const probe = createPortProbe(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise((resolveClose) => probe.close(resolveClose));
  const env = {...process.env,PI_DESKTOP_DATA_DIR:dataDir,PI_DESKTOP_AGENTS_DIR:agents,PI_DESKTOP_UPDATE_CACHE_DIR:join(artifacts,"update-cache"),ELECTRON_RENDERER_URL:""};
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  env.PATH = [packageDir, join(process.env.SystemRoot || "C:/Windows", "System32"), process.env.SystemRoot || "C:/Windows"].join(";");
  app = spawn(join(packageDir, "PI-Desktop.exe"), [`--remote-debugging-port=${port}`], {cwd:packageDir,env,stdio:["ignore","pipe","pipe"],windowsHide:true});
  for (const stream of [app.stdout, app.stderr]) stream.on("data", (chunk) => { output = (output + chunk).slice(-6000); });
  let target;
  await waitFor(async () => {
    if (app.exitCode !== null) throw new Error(output);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((item) => item.type === "page" && item.url.includes("index.html") && !item.url.includes("plugin-launcher")); return !!target; } catch { return false; }
  }, 45000, "packaged Desktop");
  ws = new WebSocket(target.webSocketDebuggerUrl); await once(ws, "open");
  let next = 0; const pending = new Map();
  ws.onmessage = ({data}) => { const message = JSON.parse(data); const waiting = pending.get(message.id); if (!waiting) return; pending.delete(message.id); clearTimeout(waiting.timer); if (message.error) waiting.reject(new Error(JSON.stringify(message.error))); else waiting.resolve(message.result); };
  send = (method, params = {}) => new Promise((resolveResult, reject) => {
    const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP ${method} timed out`)); }, 120000);
    pending.set(id, {resolve:resolveResult,reject,timer}); ws.send(JSON.stringify({id,method,params}));
  });
  evaluate = async (expression) => { const value = await send("Runtime.evaluate", {expression,awaitPromise:true,returnByValue:true}); if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || "renderer evaluation failed"); return value.result.value; };
  await waitFor(() => evaluate("!!window.__PI_DESKTOP__ && !document.querySelector('.startup-splash')"), 45000, "real AppShell ready");
}
async function stop() {
  if (evaluate && ws && app?.exitCode === null) {
    await evaluate("window.piDesktop.invoke(window.piDesktop.channels.invoke.appQuit)").catch(() => {});
  }
  if (ws) { ws.close(); ws = null; }
  if (app && app.exitCode === null) { app.kill(); await once(app, "exit"); }
  app = null;
}
async function ipc(name, ...args) {
  const value = await evaluate(`window.piDesktop.invoke(window.piDesktop.channels.invoke[${JSON.stringify(name)}], ...${JSON.stringify(args)})`);
  assert.equal(value.ok, true, `${name}: ${JSON.stringify(value)}`); return value.data;
}
async function clickText(text, selector = "button") {
  await waitFor(() => evaluate(`(() => { const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find((item) => item.textContent.trim() === ${JSON.stringify(text)}); if (!button || button.disabled) return false; button.click(); return true; })()`), 15000, `button ${text}`);
}
async function shot(name) { const image = await send("Page.captureScreenshot", {format:"png"}); await writeFile(join(artifacts, `${name}.png`), Buffer.from(image.data, "base64")); }
async function draft(value) { await evaluate(`(() => { const field = document.querySelector('.composer-input'); field.focus(); field.textContent = ${JSON.stringify(value)}; field.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertText',data:field.textContent})); })()`); }

try {
  await host.start();
  assert.equal((await host.call("skills.list", {level:"global"})).skills.length, 0);
  await host.call("workspace.set", {path:project});
  await host.call("settings.set", {language:"en",autoGenerateTitle:false,updatePreference:"manual"});
  await host.stop();
  provider.listen(0, "127.0.0.1"); await once(provider, "listening");
  await launch();
  const skills = (await ipc("skillList", {level:"global"})).skills;
  assert.equal(skills.length, 37); assert.ok(skills.every((skill) => skill.enabled && skill.source === "bundled" && skill.path.startsWith(dataDir)));
  const tdd = skills.find((skill) => skill.id === "tdd");
  assert.ok((await readFile(join(resolve(tdd.path, ".."), "mocking.md"), "utf8")).length > 0);
  await evaluate("window.__PI_DESKTOP__.setPage('settings'); window.__PI_DESKTOP__.setSettingsTab('skills')");
  await waitFor(() => evaluate("document.querySelectorAll('.agent-capability-row').length === 6"), 15000, "six default native entries");
  await shot("six-default-skills");
  await clickText("Show all skills");
  await waitFor(() => evaluate("document.querySelectorAll('.agent-capability-row').length === 37"), 10000, "all installed skills");
  await shot("all-installed-skills");
  const configured = await ipc("providersCreate", {name:"Offline skill fixture",vendorKey:"custom",type:"openai_compatible",protocol:"openai_compatible",baseUrl:`http://127.0.0.1:${provider.address().port}/v1`,authKind:"api_key_and_base_url",secretValue:"local-fixture-only",defaultModelId:"skill-fixture",apiStyle:"chat_completions",supportsReasoning:false,contextWindow:128000,maxOutputTokens:4096});
  const {session} = await ipc("sessionCreate", {title:"Packaged engineering skills",mode:"agent",projectPath:project,providerId:configured.provider.id,modelId:"skill-fixture",thinkingLevel:"off"});
  await evaluate(`window.__PI_DESKTOP__.refreshProviders(); window.__PI_DESKTOP__.setPage('chat'); window.__PI_DESKTOP__.selectSession(${JSON.stringify(session.id)})`);
  await waitFor(() => evaluate("!!document.querySelector('.composer-input')"), 15000, "chat composer");
  await send("Input.dispatchKeyEvent", {type:"keyDown",key:"j",code:"KeyJ",modifiers:2,windowsVirtualKeyCode:74});
  await send("Input.dispatchKeyEvent", {type:"keyUp",key:"j",code:"KeyJ",modifiers:2,windowsVirtualKeyCode:74});
  await waitFor(() => evaluate("!!document.querySelector('.work-panel-new-tab')"), 10000, "work panel");
  await evaluate("document.querySelector('.work-panel-new-tab').click()");
  await clickText("Workflow");
  await waitFor(() => evaluate("!!document.querySelector('input[aria-label=\"Run title\"]')"), 10000, "Workflow run form");
  await evaluate("(() => { const input = document.querySelector('input[aria-label=\"Run title\"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Packaged effort'); input.dispatchEvent(new Event('input', {bubbles:true})); })()");
  await clickText("Create run"); await clickText("Start Discovery");
  const groups = (await ipc("projectGroupList")).groups; const group = groups.find((item) => item.primaryPath === project.replaceAll('\\','/')) ?? groups[0];
  await waitFor(async () => (await ipc("workflowHistoryRead", {projectGroupId:group.id})).history.runs[0]?.executions[0]?.phase === "normal", 60000, "real packaged Skill execution");
  const history = (await ipc("workflowHistoryRead", {projectGroupId:group.id})).history;
  assert.equal(history.runs[0].stages[0].acceptance, null);
  assert.ok(requests.flat().some((message) => message.role === "tool" && String(message.content).includes("# Skill: grill-with-docs")));
  assert.ok(requests.flat().some((message) => message.role === "tool" && String(message.content).includes("# Skill: grilling")));
  await shot("discovery-awaiting-acceptance");
  round = 0; skillSequence = ["tdd"];
  await draft("/tdd Verify that an auxiliary skill is callable.");
  await waitFor(() => evaluate("!!document.querySelector('.composer-shell .send-btn:not(:disabled)')"), 10000, "slash send");
  await evaluate("document.querySelector('.composer-shell .send-btn').click()");
  await waitFor(() => requests.flat().some((message) => message.role === "tool" && String(message.content).includes("# Skill: tdd")), 60000, "auxiliary slash Skill invocation");
  await waitFor(() => evaluate("[...document.querySelectorAll('.markdown')].filter((node) => node.textContent.includes('PACKAGED_SKILL_SUCCESS')).length >= 2 || document.body.innerText.split('PACKAGED_SKILL_SUCCESS').length >= 3"), 15000, "auxiliary turn finished");
  await ipc("skillSetEnabled", {id:"retro",level:"global",enabled:false});
  const original = await ipc("skillRead", {id:"grilling",level:"global"});
  await ipc("skillUpdate", {id:"grilling",level:"global",body:original.body + "\nPackaged local edit."});
  await stop(); await launch();
  assert.equal((await ipc("skillList", {level:"global"})).skills.find((skill) => skill.id === "retro").enabled, false);
  assert.ok((await ipc("skillRead", {id:"grilling",level:"global"})).body.includes("Packaged local edit."));
  if (process.env.PI_SKILLS_VERIFY_UPSTREAM === "1") {
    if (process.env.PI_SKILLS_TEST_PROXY) {
      const {settings} = await ipc("settingsGet");
      await ipc("settingsSet", {...settings,networkProxy:{mode:"custom",url:process.env.PI_SKILLS_TEST_PROXY}});
    }
    const result = await ipc("skillBundleUpdate");
    assert.ok(result.preserved.includes("grilling"));
    assert.equal((await ipc("skillList", {level:"global"})).skills.find((skill) => skill.id === "retro").enabled, false);
    assert.ok((await ipc("skillRead", {id:"grilling",level:"global"})).body.includes("Packaged local edit."));
    console.log("UPSTREAM_SKILL_UPDATE", JSON.stringify({revision:result.revision,updated:result.updated.length,preserved:result.preserved.length}));
  }
  await writeFile(join(artifacts, "result.json"), JSON.stringify({ok:true,skills:37,defaultEntries:6,workflowSkillLoaded:true,auxiliarySlashLoaded:true,restartPreserved:true}, null, 2));
  console.log("PACKAGED_ENGINEERING_SKILLS", JSON.stringify({ok:true,artifacts}));
} catch (error) {
  if (send && ws) await shot("failure").catch(() => {});
  await writeFile(join(artifacts, "failure.log"), String(error.stack) + "\n" + output);
  await writeFile(join(artifacts, "requests.json"), JSON.stringify(requests, null, 2));
  throw error;
} finally {
  await stop(); await host.stop(); await new Promise((resolveClose) => provider.close(resolveClose));
  if (previousAgents === undefined) delete process.env.PI_DESKTOP_AGENTS_DIR; else process.env.PI_DESKTOP_AGENTS_DIR = previousAgents;
}
