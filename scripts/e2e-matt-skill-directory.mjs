import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Host, resolveHostBinary } from "./e2e/host.mjs";
import { readMattSkillBundle } from "./lib/matt-skills.mjs";

const root = resolve(import.meta.dirname, "..");
const scratch = join(root, ".pi-desktop-test");
await mkdir(scratch, { recursive: true });
const artifacts = await mkdtemp(join(scratch, "matt-directory-"));
const data = join(artifacts, "profile"), agents = join(artifacts, "agents");
await mkdir(data); await mkdir(agents);
const previousAgents = process.env.PI_DESKTOP_AGENTS_DIR;
process.env.PI_DESKTOP_AGENTS_DIR = agents;
const host = new Host(resolveHostBinary(), data);
const bundle = readMattSkillBundle(join(root, "apps/desktop/resources/skills/matt"));
try {
  await host.start();
  const initial = await host.call("skills.ensureBundled");
  assert.equal(initial.revision, bundle.revision);
  const list = (await host.call("skills.list", { level: "global" })).skills;
  assert.deepEqual(list.map(skill => skill.id).sort(), bundle.packages.map(pkg => pkg.id).sort());
  for (const pkg of bundle.packages) {
    const record = list.find(skill => skill.id === pkg.id);
    assert.equal(record.source, "bundled");
    for (const file of pkg.files) {
      assert.equal(await readFile(join(dirname(record.path), file.path), "utf8"), file.content);
    }
  }
  await host.call("skills.setEnabled", { id: "retro", level: "global", enabled: false });
  const grilling = list.find(skill => skill.id === "grilling");
  const edited = await readFile(grilling.path, "utf8") + "\nDirectory E2E local edit.\n";
  await writeFile(grilling.path, edited);
  await host.call("skills.remove", { id: "teach", level: "global" });
  await host.stop(); await host.start();
  assert.deepEqual((await host.call("skills.ensureBundled")).updated, []);
  const restarted = (await host.call("skills.list", { level: "global" })).skills;
  assert.equal(restarted.find(skill => skill.id === "retro").enabled, false);
  assert.ok(!restarted.some(skill => skill.id === "teach"));
  assert.match((await host.call("skills.read", { id: "grilling", level: "global" })).body, /Directory E2E local edit/);
  const next = structuredClone(bundle);
  next.revision = "directory-e2e-update";
  next.packages.find(pkg => pkg.id === "tdd").files.find(file => file.path === "SKILL.md").content += "\nDirectory E2E upstream update.\n";
  const result = await host.call("skills.updateBundled", next);
  assert.ok(result.preserved.includes("grilling"));
  assert.ok(result.preserved.includes("teach"));
  assert.match((await host.call("skills.read", { id: "tdd", level: "global" })).body, /Directory E2E upstream update/);
  assert.equal((await host.call("skills.getBundledVersion")).hasBackup, true);
  await host.call("skills.restoreBundled");
  assert.equal((await host.call("skills.getBundledVersion")).revision, bundle.revision);
  assert.ok(!(await host.call("skills.read", { id: "tdd", level: "global" })).body.includes("Directory E2E upstream update"));
  assert.equal(await readFile(grilling.path, "utf8"), edited);
  console.log(JSON.stringify({ ok: true, packages: bundle.packages.length, files: bundle.packages.reduce((n, pkg) => n + pkg.files.length, 0), artifacts }));
} finally {
  await host.stop();
  if (previousAgents === undefined) delete process.env.PI_DESKTOP_AGENTS_DIR;
  else process.env.PI_DESKTOP_AGENTS_DIR = previousAgents;
}
