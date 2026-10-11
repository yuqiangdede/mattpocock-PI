import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("policy gate rejects loss of extension-first policy in either mirror", () => {
  const root = mkdtempSync(path.join(tmpdir(), "pi-policy-sync-"));
  try {
    mkdirSync(path.join(root, "scripts"));
    copyFileSync(new URL("./check-agent-policy-sync.mjs", import.meta.url), path.join(root, "scripts/check-agent-policy-sync.mjs"));
    const originals = new Map(["AGENTS.md", "CLAUDE.md"].map((name) => [name, readFileSync(new URL(`../${name}`, import.meta.url), "utf8")]));
    const run = () => spawnSync(process.execPath, [path.join(root, "scripts/check-agent-policy-sync.mjs")], { encoding: "utf8" });
    for (const [name, content] of originals) writeFileSync(path.join(root, name), content);
    assert.equal(run().status, 0);
    for (const [name, content] of originals) {
      const weakened = content.replace("Fork extension-first policy (mattpocock-PI; mandatory)", "Removed policy");
      assert.notEqual(weakened, content);
      writeFileSync(path.join(root, name), weakened);
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /fork-extension-first/);
      writeFileSync(path.join(root, name), content);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
