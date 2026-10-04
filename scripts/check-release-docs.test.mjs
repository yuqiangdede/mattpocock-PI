import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));

test("release preflight works without installed dependencies and still rejects drift", (t) => {
  const cache = path.join(root, "cache");
  mkdirSync(cache, { recursive: true });
  const fixture = mkdtempSync(path.join(cache, "release-docs-test-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const files = [
    "package.json", "Cargo.toml", "Cargo.lock", "README.md", "README.zh-CN.md",
    "docs/package.json", "packages/shared/package.json", "packages/shared/src/protocol.ts",
    "packages/shared/src/changelog.test.ts", "scripts/check-release-docs.mjs",
    "scripts/release-version-check.mjs", "apps/desktop/package.json",
    "apps/desktop/electron/main/settings-operation-metadata.json",
    ...["", "-de", "-es", "-fr", "-ko", "-pt-BR", "-tr"].map(
      (suffix) => `packages/shared/src/changelog${suffix}.ts`,
    ),
  ];
  for (const file of files) {
    const target = path.join(fixture, file);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, file), target);
  }
  const surfaceVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
  const documentVersion = surfaceVersion.split("-")[0];
  const releaseLine = documentVersion.split(".").slice(0, 2).join(".") + ".x";
  const driftVersion = "999.0.0";
  const run = (...args) => spawnSync(process.execPath, ["scripts/check-release-docs.mjs", ...args], {
    cwd: fixture, encoding: "utf8", timeout: 30_000,
  });
  for (const args of [[], [documentVersion]]) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`aligned with ${documentVersion}`), result.stdout);
  }
  const mismatch = run(driftVersion);
  assert.equal(mismatch.status, 1, mismatch.stderr);
  assert.ok(mismatch.stderr.includes(`package.json: version is ${surfaceVersion}, expected ${driftVersion}`), mismatch.stderr);

  const regressions = [
    ["docs/package.json", (source) => source.replace(surfaceVersion, driftVersion), /docs.*package\.json: version is/],
    ["packages/shared/src/changelog.ts", (source) => source.replace(`version: "${documentVersion}"`, `version: "${driftVersion}"`), /en has no entry for/],
    ["packages/shared/src/changelog-de.ts", (source) => source.replace(`"version": "${documentVersion}"`, `"version": "${driftVersion}"`), /de has no entry for/],
    ["packages/shared/src/changelog-de.ts", (source) => source.replace('"highlights": [', '"highlights": ["Extra highlight",'), /de highlight count differs/],
    ["packages/shared/src/changelog.test.ts", (source) => source.replaceAll(`"${documentVersion}"`, `"${driftVersion}"`), /expected version list does not contain/],
    ["README.zh-CN.md", (source) => source.replaceAll(releaseLine, "999.0.x"), /README\.zh-CN\.md: status section/],
  ];
  for (const [file, regress, message] of regressions) {
    const target = path.join(fixture, file);
    const original = readFileSync(target, "utf8");
    try {
      const regressed = regress(original);
      assert.notEqual(regressed, original, `${file}: regression must change the fixture`);
      writeFileSync(target, regressed, "utf8");
      const result = run();
      assert.equal(result.status, 1, `${file}: ${result.stderr}`);
      assert.match(result.stderr, message);
    } finally {
      writeFileSync(target, original, "utf8");
    }
  }
});
