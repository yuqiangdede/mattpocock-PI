#!/usr/bin/env node
/** Real Host RPC + isolated transcript/cache fixtures; no provider calls. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Host, resolveHostBinary } from "./e2e/host.mjs";

const dataDir = mkdtempSync(join(tmpdir(), "pi-transcript-utf8-"));
const host = new Host(resolveHostBinary(), dataDir);
const createdAt = "2026-10-14T00:00:00.000Z";
const reviewText = `你好😀\uFFFD${"a".repeat(2 * 1024 * 1024)}`;
let sessionId;
async function append(id, role, content) {
  await host.call("session.appendMessage", {
    sessionId, message: { id, role, content, createdAt, status: "complete" },
  });
}
async function read(expectedIds) {
  const result = await host.call("session.get", { id: sessionId });
  assert.deepEqual(result.session.messages.map((message) => message.id), expectedIds);
  assert.equal(result.session.messages.find((message) => message.id === "review").content, reviewText);
}
try {
  await host.start();
  sessionId = (await host.call("session.create", {
    title: "Review UTF-8 recovery", mode: "agent", projectPath: dataDir,
  })).session.id;
  await append("user", "user", "Review this code");
  await append("review", "assistant", reviewText);
  await append("summary", "assistant", "Review complete");
  await host.stop();

  const path = join(dataDir, "sessions", `${sessionId}.jsonl`);
  const original = readFileSync(path);
  const offsets = [];
  let offset = 0;
  for (const line of original.toString("utf8").split("\n")) {
    if (!line) continue;
    if (JSON.parse(line).type === "message") offsets.push(offset);
    offset += Buffer.byteLength(line) + 1;
  }
  assert.equal(offsets.length, 3);
  // A legacy Windows cache can retain the first offset after later rows move.
  writeFileSync(`${path}.layout`, `0 ${original.length}\n3 0\n${offsets.join("\n")}\n`);
  const marker = Buffer.from("好");
  const position = original.indexOf(marker);
  assert.ok(position >= 0);
  const corrupted = Buffer.concat([
    original.subarray(0, position), Buffer.from([0xff, 0xe2, 0x82]), original.subarray(position),
  ]);
  writeFileSync(path, corrupted);

  await host.start();
  await read(["user", "review", "summary"]);
  assert.deepEqual(readFileSync(path), corrupted, "reading must not rewrite user data");
  await append("user", "user", "Review again");
  assert.ok(readFileSync(path).includes(Buffer.from([0xff, 0xe2, 0x82])), "unrelated invalid bytes survive a message update");
  await append("followup", "user", "Fix the findings");
  await read(["user", "review", "summary", "followup"]);
  await host.restart();
  await read(["user", "review", "summary", "followup"]);
  console.log("PASS E2E-SESSION-review-followup-layout-recovery: old cache, invalid UTF-8, update, follow-up and restart");
} finally {
  await host.stop();
  rmSync(dataDir, { recursive: true, force: true });
}
