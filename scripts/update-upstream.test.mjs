import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { updateUpstream } from "./update-upstream.mjs";

const cache = new URL("../cache/upstream-tests/", import.meta.url);
mkdirSync(cache, { recursive: true });
function fixture({ conflict = false, baselineVersion = "0.16.1", targetVersion = "0.16.2" } = {}) {
  const root = mkdtempSync(resolve(fileURLToPath(cache), "repo-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-b", "update-test");
  git("config", "user.name", "upstream-test");
  git("config", "user.email", "test@example.invalid");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  writeFileSync(resolve(root, ".gitignore"), "cache/\n");
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ version: baselineVersion }) + "\n");
  writeFileSync(resolve(root, "core.txt"), "base\n");
  git("add", "."); git("commit", "-qm", "official baseline");
  const base = git("rev-parse", "HEAD");
  writeFileSync(resolve(root, "package.json"), JSON.stringify({ version: targetVersion }) + "\n");
  writeFileSync(resolve(root, "core.txt"), "official update\n");
  git("add", "."); git("commit", "-qm", "official update");
  git("tag", `upstream/v${targetVersion}`);
  git("switch", "-c", "fork-test", base);
  mkdirSync(resolve(root, "packages/shared/src"), { recursive: true });
  writeFileSync(resolve(root, "packages/shared/src/upstream.ts"), `export const UPSTREAM_BASELINE = { repository: "vastsa/PI-Desktop", version: "${baselineVersion}", commit: "${base}" };\n`);
  writeFileSync(resolve(root, "custom.txt"), "keep customization\n");
  if (conflict) writeFileSync(resolve(root, "core.txt"), "fork change\n");
  git("add", "."); git("commit", "-qm", "fork customization");
  return { root, git, options: { root, version: targetVersion, fetch: false } };
}
test("预览不修改源码或索引；应用仅更新官方增量并保留定制", () => {
  const { root, git, options } = fixture();
  const before = git("rev-parse", "HEAD");
  assert.equal(updateUpstream(options).conflicts.length, 0);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(git("rev-parse", "HEAD"), before);
  assert.equal(updateUpstream({ ...options, apply: true }).applied, true);
  assert.equal(readFileSync(resolve(root, "core.txt"), "utf8"), "official update\n");
  assert.equal(readFileSync(resolve(root, "custom.txt"), "utf8"), "keep customization\n");
  assert.match(readFileSync(resolve(root, "packages/shared/src/upstream.ts"), "utf8"), /version: "0.16.2"/);
  assert.equal(updateUpstream(options).current, true);
});
test("冲突时拒绝应用，源码、索引和基线保持原样", () => {
  const { root, git, options } = fixture({ conflict: true });
  assert.ok(updateUpstream(options).conflicts.length);
  assert.throws(() => updateUpstream({ ...options, apply: true }), /冲突/);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(readFileSync(resolve(root, "core.txt"), "utf8"), "fork change\n");
});
test("拒绝脏工作树、主分支、降级和参数注入", () => {
  const { root, git, options } = fixture();
  writeFileSync(resolve(root, "local.txt"), "user data");
  assert.throws(() => updateUpstream({ ...options, apply: true }), /干净工作树/);
  git("add", "local.txt"); git("commit", "-qm", "save user data");
  git("branch", "-m", "main");
  assert.throws(() => updateUpstream({ ...options, apply: true }), /专用更新分支/);
  assert.throws(() => updateUpstream({ ...options, version: "0.16.0" }), /降级/);
  assert.throws(() => updateUpstream({ ...options, version: "--upload-pack=evil" }), /版本/);
});

test("explicit prerelease preview and apply preserve fork changes and record the exact baseline", () => {
  const { root, git, options } = fixture({ baselineVersion: "0.20.1", targetVersion: "0.21.0-beta.3" });
  assert.equal(updateUpstream(options).conflicts.length, 0);
  assert.equal(git("status", "--porcelain"), "");
  assert.equal(updateUpstream({ ...options, apply: true }).applied, true);
  assert.equal(readFileSync(resolve(root, "custom.txt"), "utf8"), "keep customization\n");
  assert.match(readFileSync(resolve(root, "packages/shared/src/upstream.ts"), "utf8"), /version: "0.21.0-beta.3"/);
  assert.equal(updateUpstream(options).current, true);
});

test("prerelease ordering rejects downgrades, compares numeric identifiers and permits stable promotion", () => {
  const { options } = fixture({ baselineVersion: "0.21.0-beta.3", targetVersion: "0.21.0-beta.10" });
  assert.equal(updateUpstream(options).conflicts.length, 0);
  for (const version of ["0.20.9", "0.21.0-beta.2", "0.21.0-alpha.9"]) {
    assert.throws(() => updateUpstream({ ...options, version }), /降级/);
  }
  const stable = fixture({ baselineVersion: "0.21.0-beta.3", targetVersion: "0.21.0" });
  assert.equal(updateUpstream(stable.options).conflicts.length, 0);
  const released = fixture({ baselineVersion: "0.21.0", targetVersion: "0.21.1" });
  assert.throws(() => updateUpstream({ ...released.options, version: "0.21.0-rc.1" }), /降级/);
  for (const version of ["0.21.0-beta.03", "0.21.0-", "0.21.0-beta/evil", "0.21.0+local", "01.21.0"]) {
    assert.throws(() => updateUpstream({ ...options, version }), /版本/);
  }
});
