import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { fetchEngineeringSkillBundle, createEngineeringSkillUpdater } = await import("../electron/main/engineering-skill-update.ts");
const ids = ["grill-with-docs", "to-spec", "to-tickets", "implement", "code-review", "retro", "tdd"];
const sha = "a".repeat(40);
const tree = () => ({ truncated: false, tree: ids.map((id) => ({ path: `skills/engineering/${id}/SKILL.md`, type: "blob", mode: "100644", size: 100 })) });

test("manual update pins one revision and retains auxiliary resources with the local terminology", async () => {
  const calls = [];
  const value = tree(); value.tree.push({ path: "skills/engineering/tdd/GLOSSARY-FORMAT.md", type: "blob", mode: "100644", size: 10 });
  const result = await fetchEngineeringSkillBundle(async (url, kind) => {
    calls.push(url);
    if (url.endsWith("/commits/main")) return { sha };
    if (kind === "json") return value;
    assert.ok(url.includes(`/${sha}/`)); return "Use GLOSSARY.md";
  });
  assert.equal(result.revision, sha);
  assert.equal(result.packages.length, 7);
  assert.deepEqual(result.packages.find((item) => item.id === "tdd").files.find((file) => file.path === "CONTEXT-FORMAT.md"), { path: "CONTEXT-FORMAT.md", content: "Use CONTEXT.md" });
});

test("invalid or incomplete upstream content fails before publishing an update bundle", async () => {
  for (const mutate of [
    (value) => { value.truncated = true; },
    (value) => { value.tree.pop(); value.tree.pop(); },
    (value) => { value.tree[0].mode = "120000"; },
    (value) => { value.tree[0].path = "skills/engineering/retro/../escape.md"; },
  ]) {
    const value = tree(); mutate(value);
    await assert.rejects(fetchEngineeringSkillBundle(async (url) => url.endsWith("/commits/main") ? { sha } : value));
  }
  await assert.rejects(fetchEngineeringSkillBundle(async (url, kind) => url.endsWith("/commits/main") ? { sha } : kind === "json" ? tree() : Promise.reject(new Error("offline"))), /offline/);
});

test("concurrent updates settle once and a Host restart during download cannot install stale content", async () => {
  let release;
  const bundle = { revision: sha, packages: [] };
  let held = new Promise((resolve) => { release = resolve; });
  const installed = [];
  const owner = { generation: 1, call: async (method, input) => { installed.push({method,input}); return {revision:sha}; } };
  let notifications = 0;
  const update = createEngineeringSkillUpdater({getHost:()=>owner,fetchBundle:()=>held,notify:()=>{notifications++;}});
  const first = update(); const second = update();
  release(bundle); await Promise.all([first, second]);
  assert.equal(installed.length, 1); assert.equal(notifications, 1);
  held = new Promise((resolve) => { release = resolve; });
  const stale = update(); const refused = assert.rejects(stale, /host changed/);
  owner.generation++; release(bundle); await refused;
  assert.equal(installed.length, 1);
});
