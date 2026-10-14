import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build } = createRequire(new URL("../../../packages/agent-runtime/package.json", import.meta.url))("esbuild");

test("built Live Voice trusts only the main window's actual packaged renderer entry", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pi-live-owner-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "out/main/index.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../electron/main/live-voice/owner.ts", import.meta.url))],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { isTrustedRendererUrl, liveOwnerFromInvoke, liveOwnerFrame } = await import(pathToFileURL(output).href);
  const url = pathToFileURL(join(root, "out/renderer/index.html")).href;
  assert.equal(isTrustedRendererUrl(url), true);
  for (const other of [
    pathToFileURL(join(root, "renderer/index.html")).href,
    pathToFileURL(join(root, "out/renderer/other.html")).href,
    `${url}?debug=1`, `${url}#untrusted`, "https://example.test/index.html",
  ]) assert.equal(isTrustedRendererUrl(other), false, other);

  const frame = { url, processId: 5, routingId: 6 };
  const contents = { id: 4, mainFrame: frame, getURL: () => url, isDestroyed: () => false };
  const window = { webContents: contents, isDestroyed: () => false };
  const event = { sender: contents, senderFrame: frame };
  const owner = liveOwnerFromInvoke(event, window);
  assert.equal(liveOwnerFrame(window, owner), frame);
  assert.throws(() => liveOwnerFromInvoke({ ...event, senderFrame: { ...frame } }, window), { errorCode: "LIVE_INVALID_OWNER" });
  assert.throws(() => liveOwnerFromInvoke({ ...event, sender: { ...contents } }, window), { errorCode: "LIVE_INVALID_OWNER" });
  assert.throws(() => liveOwnerFromInvoke(event, null), { errorCode: "LIVE_INVALID_OWNER" });
  assert.equal(liveOwnerFrame(window, { ...owner, frameRoutingId: 99 }), null);
  contents.mainFrame = { ...frame, url: pathToFileURL(join(root, "out/renderer/other.html")).href };
  assert.equal(liveOwnerFrame(window, owner), null);
});

test("packaged main renderer can copy text without granting clipboard reads or media", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pi-copy-permission-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, "out/main/index.mjs");
  await build({
    entryPoints: [fileURLToPath(new URL("../electron/main/live-voice/microphone-permissions.ts", import.meta.url))],
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
  });
  const { installLiveMicrophonePermissionHandlers } = await import(pathToFileURL(output).href);
  const url = pathToFileURL(join(root, "out/renderer/index.html")).href;
  const contents = {
    id: 4, isDestroyed: () => false, getURL: () => url,
    mainFrame: { url, processId: 5, routingId: 6 },
  };
  const handlers = {};
  installLiveMicrophonePermissionHandlers({
    targetSession: {
      setPermissionRequestHandler: (handler) => { handlers.request = handler; },
      setPermissionCheckHandler: (handler) => { handlers.check = handler; },
    },
    getMainWindow: () => ({ isDestroyed: () => false, webContents: contents }),
    hasReservation: () => false,
  });
  const details = { requestingUrl: url, isMainFrame: true };
  let decision;
  handlers.request(contents, "clipboard-sanitized-write", (allowed) => { decision = allowed; }, details);
  assert.equal(decision, true);
  for (const origin of ["file://", "null"]) {
    assert.equal(handlers.check(contents, "clipboard-sanitized-write", origin, details), true);
    assert.equal(handlers.check(contents, "clipboard-read", origin, details), false);
    assert.equal(handlers.check(contents, "media", origin, { ...details, mediaType: "audio" }), false);
    assert.equal(handlers.check(contents, "clipboard-sanitized-write", origin, { ...details, isMainFrame: false }), false);
  }
  assert.equal(handlers.check(contents, "clipboard-sanitized-write", "https://outside.example", details), false);
});
