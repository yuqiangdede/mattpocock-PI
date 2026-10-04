import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/engineering-settings-imports.mjs", import.meta.url));
const { createEngineeringSkillChecks } = await import("../electron/main/engineering-skill-checks.ts");
const { validateEngineeringSettings, engineeringSettingsForWrite, resolveShortcutInstruction, ENGINEERING_CHECK_INTERVAL } = await import("@pi-desktop/shared");
const sha = "b".repeat(40);
function fixture(initial = {}) {
  let settings = structuredClone(initial), revision = "a".repeat(40) + "-desktop.1", clock = 100000;
  let tick, disposed = false, fetches = 0, installs = 0;
  const errors = [];
  const host = { generation: 1, call: async (method, value) => {
    if (method === "settings.get") return structuredClone(settings);
    if (method === "settings.set") { validateEngineeringSettings(value); settings = { ...settings, ...structuredClone(value) }; return { ok: true }; }
    if (method === "skills.ensureBundled") return { revision };
    if (method === "skills.getBundledVersion") return { revision, hasBackup: installs > 0, tasksRunning: false };
    throw new Error(method);
  } };
  let fetchRevision = async () => { fetches++; return sha; };
  const service = createEngineeringSkillChecks({ getHost: () => host, now: () => clock,
    fetchRevision: () => fetchRevision(), update: async () => { installs++; revision = sha; return { revision, updated: ["implement"], preserved: ["retro"] }; },
    report: error => errors.push(error), schedule: callback => { tick = callback; return () => { disposed = true; }; } });
  return { service, host, errors, tick: () => tick(), advance: () => { clock += ENGINEERING_CHECK_INTERVAL; }, replaceFetch: fn => { fetchRevision = fn; }, settings: () => settings, counters: () => ({ fetches, installs, disposed }) };
}

test("global instructions survive writes, explicit empty and restore have distinct behavior", async () => {
  const f = fixture({ engineeringShortcutPrompts: { ask: "My instruction", implement: "" } });
  assert.equal(resolveShortcutInstruction("ask", "Default", f.settings().engineeringShortcutPrompts), "My instruction");
  assert.equal(resolveShortcutInstruction("implement", "Default", f.settings().engineeringShortcutPrompts), "");
  await f.service.check(); await f.service.update();
  assert.equal(f.settings().engineeringShortcutPrompts.ask, "My instruction");
  await f.host.call("settings.set", { engineeringShortcutPrompts: { ask: null } });
  assert.equal(resolveShortcutInstruction("ask", "New localized default", f.settings().engineeringShortcutPrompts), "New localized default");
});

test("manual mode never polls upstream; explicit check detects without installing", async () => {
  const f = fixture({ engineeringSkillUpdateMode: "manual" }); f.service.start();
  await f.service.check({ automatic: true });
  assert.equal(f.counters().fetches, 0);
  const result = await f.service.check();
  assert.equal(result.latestRevision, sha); assert.equal(f.counters().fetches, 1); assert.equal(f.counters().installs, 0);
  f.service.stop(); assert.equal(f.counters().disposed, true);
});

test("automatic detection is startup plus daily, failure does not retry each tick", async () => {
  const f = fixture(); f.service.start(); await f.service.check({ automatic: true });
  assert.equal(f.counters().fetches, 1); f.tick(); await f.service.check({ automatic: true }); assert.equal(f.counters().fetches, 1);
  f.advance(); f.replaceFetch(async () => { throw new Error("offline"); }); f.tick(); await f.service.check({ automatic: true });
  assert.ok(f.settings().engineeringSkillCheck.error); assert.equal(f.errors.length, 1);
  f.tick(); await f.service.check({ automatic: true }); assert.equal(f.errors.length, 1);
  assert.equal(f.counters().installs, 0); f.service.stop();
});

test("update waits for detection, concurrent clicks install once and retain preservation report", async () => {
  const f = fixture(); let release;
  f.replaceFetch(() => new Promise(resolve => { release = resolve; }));
  const checked = f.service.check();
  while (!release) await new Promise(resolve => setImmediate(resolve));
  const first = f.service.update(), second = f.service.update(); release(sha);
  await Promise.all([checked, first, second]);
  assert.equal(f.counters().installs, 1);
  assert.deepEqual((await f.service.status()).preserved, ["retro"]);
});

test("Host restart or disposal while checking cannot publish stale revision", async () => {
  for (const stop of [false, true]) {
    const f = fixture(); let release;
    f.replaceFetch(() => new Promise(resolve => { release = resolve; }));
    const pending = f.service.check();
    while (!release) await new Promise(resolve => setImmediate(resolve));
    const rejected = assert.rejects(pending, /host changed/);
    if (stop) f.service.stop(); else f.host.generation++;
    release(sha); await rejected;
    assert.equal(f.settings().engineeringSkillCheck.latestRevision, undefined);
  }
});

test("settings boundaries reject unknown shortcuts, unsafe or oversized values and auto-install", () => {
  for (const value of [{ engineeringShortcutPrompts: { unknown: "x" } }, { engineeringShortcutPrompts: { ask: "x".repeat(16001) } }, { engineeringShortcutPrompts: { ask: false } }, { engineeringSkillUpdateMode: "auto-install" }, { engineeringSkillUpdateMode: ["manual"] }, { engineeringSkillCheck: { attemptedAt: -1 } }]) assert.throws(() => validateEngineeringSettings(value));
});


test("ordinary settings saves cannot rewind Main-owned daily detection metadata", () => {
  const source = { engineeringShortcutPrompts: { ask: "custom" }, engineeringSkillCheck: { attemptedAt: 1 }, theme: "dark" };
  const writable = engineeringSettingsForWrite(source);
  assert.equal(writable.engineeringSkillCheck, undefined);
  assert.equal(writable.engineeringShortcutPrompts.ask, "custom");
  assert.equal(source.engineeringSkillCheck.attemptedAt, 1);
});


test("explicit detection is not swallowed by a concurrent skipped automatic tick", async () => {
  const f = fixture({ engineeringSkillUpdateMode: "manual" });
  f.service.start();
  const result = await f.service.check();
  assert.equal(result.latestRevision, sha);
  assert.equal(f.counters().fetches, 1);
  for (const input of [null, true, [], { automatic: 1 }]) await assert.rejects(f.service.check(input), /Invalid/);
  f.service.stop();
});
