import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readMattSkillBundle } from "../../../scripts/lib/matt-skills.mjs";
import { updateMattSkills } from "../../../scripts/update-matt-skills.mjs";

const ids = ["grill-with-docs", "to-spec", "to-tickets", "implement", "code-review", "retro"];
const sha = "a".repeat(40);
const document = id => `---\nname: ${id}\ndescription: Test fixture\n---\nRead GLOSSARY.md.\n`;
function upstream(fail = false) {
  return async (url, kind) => {
    if (url.endsWith("/commits/main")) return { sha };
    if (kind === "json") return { truncated: false, tree: [
      ...ids.map(id => ({ path: `skills/engineering/${id}/SKILL.md`, type: "blob", mode: "100644", size: 100 })),
      { path: "skills/engineering/retro/GLOSSARY.md", type: "blob", mode: "100644", size: 20 },
    ] };
    assert.ok(url.includes(`/${sha}/`));
    if (url.endsWith("/LICENSE")) return "MIT License\nFixture";
    if (url.endsWith("/GLOSSARY.md")) { if (fail) throw new Error("offline"); return "GLOSSARY resource"; }
    return document(url.split("/").at(-2));
  };
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "matt-source-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root, "matt");
  await mkdir(join(directory, "retro"), { recursive: true });
  await writeFile(join(directory, "retro/SKILL.md"), document("retro") + "Local variant");
  await writeFile(join(directory, "REVISION"), "old\n");
  return directory;
}

test("source update pins upstream, includes companions, retains previous edits, and is readable by consumers", async t => {
  const directory = await fixture(t);
  const before = readMattSkillBundle(directory);
  const result = await updateMattSkills(directory, upstream());
  const next = readMattSkillBundle(directory);
  assert.equal(next.revision, sha);
  assert.deepEqual(next.packages.map(pkg => pkg.id), [...ids].sort());
  assert.equal(next.packages.find(pkg => pkg.id === "retro").files.find(file => file.path === "CONTEXT.md").content, "CONTEXT resource");
  assert.deepEqual(readMattSkillBundle(result.backup), before);
  assert.match(await readFile(join(directory, "LICENSE"), "utf8"), /MIT License/);
});

test("partial upstream download leaves source and local variants intact", async t => {
  const directory = await fixture(t);
  const before = readMattSkillBundle(directory);
  await assert.rejects(updateMattSkills(directory, upstream(true)), /offline/);
  assert.deepEqual(readMattSkillBundle(directory), before);
});

test("invalid upstream skill metadata fails before replacing the source", async t => {
  const directory = await fixture(t);
  const before = readMattSkillBundle(directory);
  const request = upstream();
  await assert.rejects(updateMattSkills(directory, async (url, kind) => {
    if (url.endsWith("/retro/SKILL.md")) return document("wrong-name");
    return request(url, kind);
  }), /Invalid Matt skill document/);
  assert.deepEqual(readMattSkillBundle(directory), before);
});

test("source edits during download are preserved and concurrent source updates are rejected", async t => {
  const directory = await fixture(t);
  const request = upstream();
  let edited = false;
  await assert.rejects(updateMattSkills(directory, async (url, kind) => {
    if (!edited) {
      edited = true;
      await assert.rejects(updateMattSkills(directory, request), { code: "EEXIST" });
      await writeFile(join(directory, "retro/SKILL.md"), document("retro") + "Concurrent edit");
    }
    return request(url, kind);
  }), /source changed during download/);
  assert.match(await readFile(join(directory, "retro/SKILL.md"), "utf8"), /Concurrent edit/);
  // Failure releases the lock so a later explicit update can proceed.
  await updateMattSkills(directory, request);
  assert.equal(readMattSkillBundle(directory).revision, sha);
});

test("shipped source contains complete readable skills without the old JSON asset", () => {
  const bundle = readMattSkillBundle(new URL("../resources/skills/matt", import.meta.url));
  assert.ok(bundle.packages.length >= 39);
  for (const pkg of bundle.packages) {
    assert.match(pkg.id, /^[a-z0-9][a-z0-9-]*$/);
    const doc = pkg.files.find(file => file.path === "SKILL.md");
    assert.ok(doc?.content.trim());
    assert.ok(pkg.files.every(file => !file.content.includes("\ufffd")));
  }
});
