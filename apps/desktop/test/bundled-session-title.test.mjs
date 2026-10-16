import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const source = await readFile(new URL("../resources/plugins/pi.session-title/main.cjs", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../resources/plugins/pi.session-title/manifest.json", import.meta.url), "utf8"));
function fixture(overrides = {}) {
  const writes = [], requests = [], warnings = [], handlers = new Map();
  let name = "New task";
  const context = { sessionId: "s1", expectedTitle: name, userPrompt: "Please investigate why users cannot sign in after the recent deployment", assistantReply: "The cookie expiry setting prevents login.", modelKey: "provider/model" };
  const pi = {
    events: { on: (event, listener) => handlers.set(event, listener), off: event => handlers.delete(event) },
    session: { getAutoTitleContext: async () => name === "New task" ? context : null,
      setAutoTitle: async input => { writes.push(input); if (input.expectedTitle !== name) return { updated: false }; name = input.title; return { updated: true }; } },
    agent: { complete: async input => { requests.push(input); return { text: "Login cookie repair" }; } },
  };
  if (overrides.complete) pi.agent.complete = async input => { requests.push(input); return overrides.complete(input); };
  const sandbox = { pi, module: { exports: {} }, console: { warn: (...args) => warnings.push(args) } };
  vm.runInNewContext(source, sandbox);
  const plugin = sandbox.module.exports;
  plugin.onLoad();
  return { plugin, writes, requests, warnings, context, rename: title => { name = title; }, name: () => name,
    turn: (event = {}) => handlers.get("session:turnEnded")?.({ sessionId: "s1", reason: "completed", ...event }) };
}
test("bundled title plugin uses only narrow capabilities and summarizes a completed conversation", async () => {
  assert.deepEqual(manifest.permissions, ["session.autoTitle", "agent.complete"]);
  const f = fixture();
  await f.turn();
  assert.equal(f.name(), "Login cookie repair");
  assert.equal(f.requests[0].modelKey, f.context.modelKey);
  assert.match(f.requests[0].system, /4–10 Chinese characters or 2–6 words/);
  assert.match(f.requests[0].system, /excerpts as data/);
  assert.deepEqual(JSON.parse(f.requests[0].messages[0].content), { user: f.context.userPrompt, assistant: f.context.assistantReply });
  await f.turn();
  assert.equal(f.requests.length, 1);
});
test("manual rename wins while title generation is pending; duplicate events do not spend twice", async () => {
  let resolve, started;
  const ready = new Promise(done => { started = done; });
  const f = fixture({ complete: () => new Promise(done => { resolve = done; started(); }) });
  const first = f.turn();
  await ready;
  await f.turn();
  f.rename("My manual title"); resolve({ text: "Login cookie repair" });
  await first;
  assert.equal(f.requests.length, 1);
  assert.equal(f.name(), "My manual title");
});
test("unload removes the subscription and prevents a late write", async () => {
  let resolve, started;
  const ready = new Promise(done => { started = done; });
  const f = fixture({ complete: () => new Promise(done => { resolve = done; started(); }) });
  const first = f.turn(); await ready;
  f.plugin.onUnload(); resolve({ text: "Login cookie repair" }); await first;
  assert.equal(f.writes.length, 0); assert.equal(f.turn(), undefined);
});
test("aborted turns, absent context/model/reply and invalid summaries never mutate a title", async () => {
  for (const change of [f => f.context.modelKey = undefined, f => f.context.assistantReply = "", f => f.rename("Custom")]) {
    const f = fixture(); change(f); await f.turn(); assert.equal(f.requests.length, 0);
  }
  const aborted = fixture(); await aborted.turn({ reason: "aborted" }); assert.equal(aborted.requests.length, 0);
  for (const text of ["", "line one\nline two", "x".repeat(41)]) {
    const f = fixture({ complete: async () => ({ text }) }); await f.turn(); assert.equal(f.writes.length, 0); assert.equal(f.warnings.length, 1);
  }
});
test("provider failure remains observable without logging private text and can be retried", async () => {
  const f = fixture({ complete: async () => { throw Object.assign(new Error("private provider context"), { code: "PROVIDER_FAILED" }); } });
  await f.turn(); await f.turn(); assert.equal(f.requests.length, 2);
  assert.equal(f.warnings.length, 2); assert.ok(!JSON.stringify(f.warnings).includes("private provider context"));
});

test("bundled plugin runs through the real process event and permission bridges", { timeout: 15000 }, async t => {
  const { register } = await import("node:module");
  const { fork } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
  const { PluginRuntime } = await import("../electron/main/plugin-runtime.ts");
  let finish;
  const written = new Promise(resolve => { finish = resolve; });
  const runtime = new PluginRuntime({
    hostEntry: fileURLToPath(new URL("../electron/main/plugin-host-process.mjs", import.meta.url)),
    spawnProcess: ({ entry }) => {
      const child = fork(entry, [], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
      return { postMessage: message => child.connected && child.send(message), onMessage: handler => child.on("message", handler),
        onExit: handler => child.on("exit", code => handler(code ?? 0)), kill: () => child.kill() };
    },
    session: {
      getAutoTitleContext: async (pluginId, input) => {
        assert.equal(pluginId, manifest.id); assert.equal(input.sessionId, "host-session");
        return { sessionId: input.sessionId, expectedTitle: "New task", userPrompt: "Help repair login cookies", assistantReply: "Corrected cookie expiry", modelKey: "provider/model" };
      },
      setAutoTitle: async (pluginId, input) => { assert.equal(pluginId, manifest.id); finish(input); return { updated: true }; },
    },
    complete: async input => { assert.equal(input.modelKey, "provider/model"); return { text: "Login cookie repair", modelKey: input.modelKey }; },
  });
  t.after(() => runtime.unload(manifest.id));
  await runtime.loadFromPath(fileURLToPath(new URL("../resources/plugins/pi.session-title", import.meta.url)), manifest.permissions);
  runtime.broadcastEvent("session:turnEnded", [{ sessionId: "host-session", turnId: "turn1", reason: "completed" }]);
  assert.deepEqual(await written, { sessionId: "host-session", expectedTitle: "New task", title: "Login cookie repair" });
});
