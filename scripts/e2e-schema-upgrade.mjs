#!/usr/bin/env node
/** Isolated real-Host upgrade/restart probe; never reads an installed profile. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { PROTOCOL_VERSION } from "../packages/shared/dist/protocol.js";
import { Host, resolveHostBinary } from "./e2e/host.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cache = join(root, "cache", "schema-upgrade");
mkdirSync(cache, { recursive: true });
const scratch = mkdtempSync(join(cache, "profile-"));
const binary = resolveHostBinary();
const previousBinary = process.env.PI_DESKTOP_PREVIOUS_HOST_BIN;
const data = join(scratch, "data");
const database = join(data, "pi.sqlite");
const text = "Schema upgrade preserves 中文会话 😀";
let host;
let sessionId;
function schemaVersion() {
  const db = new DatabaseSync(database, { readOnly: true });
  try { return db.prepare("PRAGMA user_version").get().user_version; }
  finally { db.close(); }
}
async function start(executable = binary) {
  host = new Host(executable, data);
  return host.start(PROTOCOL_VERSION);
}
async function stop() { await host?.stop(); host = undefined; }
async function readSession() {
  const result = await host.call("session.get", { id: sessionId });
  assert.equal(result.session.messages[0].content, text);
}
try {
  await start(previousBinary ?? binary);
  const created = await host.call("session.create", { title: "Upgrade fixture", mode: "agent", projectPath: scratch });
  sessionId = created.session.id;
  await host.call("session.appendMessage", {
    sessionId,
    message: { id: "kept-message", role: "user", content: text, createdAt: "2026-10-18T00:00:00Z", status: "complete" },
  });
  await stop();
  if (!previousBinary) {
    const db = new DatabaseSync(database);
    try {
      // Build the historical table only in this throwaway fixture. Node's
      // SQLite can reject DROP COLUMN when the last column has a SQL comment.
      db.exec(`
        PRAGMA foreign_keys=OFF;
        BEGIN;
        DROP TABLE worktrees;
        CREATE TABLE projects_v23 (
          id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
          last_opened_at INTEGER NOT NULL
        );
        INSERT INTO projects_v23 SELECT id, path, name, pinned, created_at, last_opened_at FROM projects;
        DROP TABLE projects;
        ALTER TABLE projects_v23 RENAME TO projects;
        PRAGMA user_version=23;
        COMMIT;
        PRAGMA foreign_keys=ON;
      `);
    } finally { db.close(); }
  }
  assert.equal(schemaVersion(), 23, "fixture must start at the previous schema");
  await start();
  await readSession();
  await stop();
  assert.equal(schemaVersion(), 24);
  assert.ok(readdirSync(data).some((name) => /v23.*\.bak$/.test(name)), "upgrade must retain a v23 backup");
  const transcript = join(data, "sessions", `${sessionId}.jsonl`);
  assert.ok(existsSync(transcript));
  const bytes = readFileSync(transcript);
  if (previousBinary) {
    await assert.rejects(start(previousBinary), /database schema version 24 is newer than supported 23/);
    await stop();
    assert.equal(schemaVersion(), 24, "old Host must not downgrade existing data");
    assert.deepEqual(readFileSync(transcript), bytes);
    console.log("PASS original ZIP Host reproduces schema 24 / supported 23 refusal");
  }
  await start();
  await readSession();
  await stop();
  assert.equal(schemaVersion(), 24);
  assert.deepEqual(readFileSync(transcript), bytes);
  console.log(JSON.stringify({
    ok: true,
    candidate: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    base: execFileSync("git", ["rev-parse", "origin/main"], { cwd: root, encoding: "utf8" }).trim(),
    hostSha256: createHash("sha256").update(readFileSync(binary)).digest("hex"),
    scenarios: ["v23 migration with backup", "existing v24 restart", "Unicode transcript preservation"],
  }));
} finally {
  await stop();
  rmSync(scratch, { recursive: true, force: true });
}
