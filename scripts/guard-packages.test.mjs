import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "pi-packages-guard-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "packages"));
  copyFileSync(new URL("./guard-packages.mjs", import.meta.url), join(root, "scripts/guard-packages.mjs"));
  writeFileSync(join(root, "packages/source.txt"), "original\n");
  const run = (...args) => spawnSync(process.execPath, [join(root, "scripts/guard-packages.mjs"), ...args], { cwd: root, encoding: "utf8" });
  return { root, run };
}

test("first-run predev warns without blocking or creating a snapshot", (t) => {
  const { root, run } = fixture(t);
  const result = run("verify", "--warn-only");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout + result.stderr, /guard:snapshot/);
  assert.equal(existsSync(join(root, "cache/packages-guard")), false);
});

test("strict verification and restore still reject missing snapshots", (t) => {
  const { run } = fixture(t);
  for (const command of ["verify", "restore"]) {
    assert.equal(run(command).status, 1);
  }
});

test("snapshot then verify detects changes while predev remains non-blocking", (t) => {
  const { root, run } = fixture(t);
  assert.equal(run("snapshot").status, 0);
  assert.equal(run("verify").status, 0);
  writeFileSync(join(root, "packages/source.txt"), "changed\n");
  assert.equal(run("verify").status, 2);
  assert.equal(run("verify", "--warn-only").status, 0);
});
