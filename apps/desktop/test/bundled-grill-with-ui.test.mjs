import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bundlePath = fileURLToPath(new URL("../../../crates/host-core/resources/grill-with-ui.json", import.meta.url));
const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));

test("the pinned grill-with-ui bundle is complete and serves a real offline conversation", async () => {
  assert.match(bundle.revision, /^grill-with-ui@[a-f0-9]{40}$/);
  assert.equal(bundle.packages.length, 1);
  const skill = bundle.packages[0];
  assert.equal(skill.id, "grill-with-ui");
  const paths = new Set(skill.files.map(file => file.path));
  for (const required of ["SKILL.md", "server.mjs", "page.html", "visual-brief.md", "LICENSE"]) {
    assert.ok(paths.has(required), `missing ${required}`);
  }
  assert.match(skill.files.find(file => file.path === "SKILL.md").content, /^---\s*\nname: grill-with-ui/m);
  const dir = mkdtempSync(path.join(os.tmpdir(), "bundled-grill-"));
  const skillDir = path.join(dir, "skill");
  const projectDir = path.join(dir, "project");
  const env = { ...process.env, GRILL_HOME: path.join(dir, "home") };
  mkdirSync(projectDir, { recursive: true });
  for (const file of skill.files) {
    const destination = path.join(skillDir, file.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, file.content);
  }
  const serverScript = path.join(skillDir, "server.mjs");
  const run = (args, input) => {
    const result = spawnSync(process.execPath, [serverScript, ...args], {
      cwd: projectDir, env, input, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 0, `${args[0]}: ${result.stderr || result.error}`);
    return result.stdout.trim();
  };
  let child;
  try {
    const session = JSON.parse(run(["new", "--topic", "Visual work-item design"])).session;
    assert.ok(session.startsWith(env.GRILL_HOME));
    const patched = JSON.parse(run(["patch", "--session", session],
      JSON.stringify({ agent: { status: "waiting" } })));
    assert.equal(patched.ok, true);

    child = spawn(process.execPath, [serverScript, "serve", "--session", session, "--port", "0"], {
      cwd: projectDir, env, stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    const url = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("bundled server did not become ready")), 8000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      child.once("error", fail);
      child.once("exit", code => fail(new Error(`bundled server exited: ${code}`)));
      child.stdout.on("data", chunk => {
        buffer += chunk.toString();
        const lineEnd = buffer.indexOf("\n");
        if (lineEnd < 0) return;
        const line = buffer.slice(0, lineEnd);
        try {
          const ready = JSON.parse(line);
          if (ready.type !== "ready") return;
          clearTimeout(timeout);
          resolve(ready.url);
        } catch (error) { fail(error); }
      });
    });
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const page = await fetch(url, { signal: AbortSignal.timeout(5000) });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Send to Agent/);
    const response = await fetch(new URL("/send", url), {
      method: "POST",
      headers: { "content-type": "application/json", origin: url.slice(0, -1) },
      body: JSON.stringify({ actions: [{ type: "thread", q: "q1", text: "Choose B" }] }),
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).seq, 1);
    const events = run(["pending", "--session", session]).split("\n").map(JSON.parse);
    assert.equal(events[0].type, "send");
    assert.equal(events[0].actions[0].text, "Choose B");
    run(["patch", "--session", session], JSON.stringify({ agent: { handled: 1, status: "waiting" } }));
    assert.equal(run(["pending", "--session", session]), "");
  } finally {
    if (child?.pid && child.exitCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 2000);
        child.once("close", () => { clearTimeout(timeout); resolve(); });
        child.kill();
      });
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
