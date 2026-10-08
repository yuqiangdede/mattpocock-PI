#!/usr/bin/env node
/** Exercise default and explicit permission choices through a real Host process. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { repositoryRoot } from "./e2e/boot.mjs";
import { Host, resolveHostBinary } from "./e2e/host.mjs";

const cache = join(repositoryRoot(), "cache");
await mkdir(cache, { recursive: true });
const scratch = await mkdtemp(join(cache, "agent-permissions-"));
const project = join(scratch, "project");
await mkdir(project);
const host = new Host(resolveHostBinary(), join(scratch, "data"));
try {
  await host.start();
  await host.call("workspace.set", { path: project });
  const { session } = await host.call("session.create", { mode: "agent", projectPath: project });
  assert.equal(session.permissionMode, "inherit");
  const params = { sessionId: session.id, toolName: "Write",
    args: { path: join(project, "auto.txt"), content: "default auto" } };
  assert.equal((await host.call("permissions.evaluate", params)).decision, "allow-once");
  const result = await host.call("tools.execute", {
    ...params, toolCallId: "default-auto", mode: "agent",
  }, 5000);
  assert.equal(result.errorCode, undefined);
  assert.equal(await readFile(join(project, "auto.txt"), "utf8"), "default auto");
  assert.ok(!host.notifications.some(message => message.method === "permissions.request"));
  for (const mode of ["ask", "accept-edits", "auto"]) {
    await host.call("settings.set", { defaultPermissionMode: mode });
    const { session: inherited } = await host.call("session.create", { mode: "agent", projectPath: project });
    const { decision } = await host.call("permissions.evaluate", { ...params, sessionId: inherited.id });
    assert.equal(decision, mode === "ask" ? null : "allow-once");
  }
  const { session: explicit } = await host.call("session.create", { mode: "agent", permissionMode: "ask", projectPath: project });
  await host.call("session.configure", { id: explicit.id, mode: "agent", permissionMode: "ask" });
  assert.equal((await host.call("permissions.evaluate", { ...params, sessionId: explicit.id })).decision, null);
  const { session: plan } = await host.call("session.create", { mode: "plan", projectPath: project });
  assert.equal((await host.call("permissions.evaluate", { ...params, sessionId: plan.id })).decision, "deny");
  console.log("Agent permission E2E passed: default auto, explicit global/session choices, Plan hard deny");
} finally {
  await host.stop();
  await rm(scratch, { recursive: true, force: true });
}
