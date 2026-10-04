import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
register(new URL("./helpers/update-controller-imports.mjs", import.meta.url));
const { AppUpdaterController } = await import("../electron/main/updater.ts");
const { selectManualUpdateArtifact, downloadManualUpdate } = await import("../electron/main/manual-update-download.ts");
const { fixture, updater } = await import("./helpers/update-controller-fixture.mjs");
const data = Buffer.from("verified fixture archive");
const checksum = createHash("sha256").update(data).digest("hex");
const release = { tag_name: "v0.17.0-beta.1", draft: false, prerelease: true, assets: [{
  name: "PI-Desktop-Portable-0.17.0-beta.1.zip", size: data.length, digest: "sha256:" + checksum,
  browser_download_url: "https://github.com/yuqiangdede/mattpocock-PI/releases/download/v0.17.0-beta.1/PI-Desktop-Portable-0.17.0-beta.1.zip",
}] };
async function directory() {
  const base = resolve(import.meta.dirname, "../../../.pi-desktop-test/executable-updates");
  await mkdir(base, { recursive: true });
  return mkdtemp(join(base, "case-"));
}
function controller(t, options = {}) {
  updater.removeAllListeners();
  fixture.downloads = 0; fixture.installs = 0; fixture.revealed = [];
  fixture.installFailure = false;
  const writes = [], events = [];
  const value = new AppUpdaterController({
    logger: { app() {} }, send: (_channel, state) => events.push(state),
    currentVersion: "0.16.0-beta.2", platform: "win32", isPackaged: true,
    distribution: "installed", persistChannel: async channel => writes.push(channel), ...options,
  });
  t.after(() => value.dispose());
  return { value, writes, events };
}

test("installed user path: check, explicitly download, then explicitly restart", async t => {
  const { value, writes } = controller(t);
  await value.readyState();
  assert.equal(value.getState().channel, "prerelease");
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  await value.check({ manual: true });
  assert.equal(value.getState().status, "available");
  assert.equal(fixture.downloads, 0);
  assert.equal(fixture.installs, 0);
  await value.download();
  assert.equal(value.getState().status, "downloaded");
  assert.equal(fixture.downloads, 1);
  assert.equal(fixture.installs, 0);
  await assert.rejects(value.setChannel("stable"), /Finish/);
  value.install();
  assert.equal(value.isInstallingUpdate(), true);
  assert.equal(fixture.installs, 1);
  assert.deepEqual(writes, []);
  const priorEvents = updater.listenerCount("update-available");
  value.dispose();
  assert.equal(updater.listenerCount("update-available"), priorEvents - 1);
});

test("channel persists, invalidates old candidates, and prevents downgrade", async t => {
  const { value, writes } = controller(t, {readUpdateSettings: async () => ({updateChannel: "stable"})});
  await value.readyState();
  assert.equal(value.getState().channel, "stable");
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.allowDowngrade, false);
  await value.check({manual:true});
  await value.setChannel("prerelease");
  assert.deepEqual(writes, ["prerelease"]);
  assert.equal(value.getState().status, "idle");
  assert.equal(value.getState().availableVersion, undefined);
  await assert.rejects(value.download(), /Check/);
  const previous = fixture.nextVersion;
  fixture.nextVersion = "0.15.0";
  try {
    await value.check({manual:true});
    assert.equal(value.getState().status, "up-to-date");
    await assert.rejects(value.download(), /Check/);
  } finally { fixture.nextVersion = previous; }
});

test("an installer error event releases the installation latch instead of reporting success", async t => {
  const { value } = controller(t);
  await value.check({manual:true});
  await value.download();
  fixture.installFailure = true;
  assert.throws(() => value.install(), /fixture installer refused/);
  assert.equal(value.isInstallingUpdate(), false);
  assert.equal(value.getState().status, "error");
  assert.equal(fixture.installs, 0);
});

test("legacy manual preference checks the same installer feed used for explicit download", async t => {
  fixture.fetch = async () => { throw new Error("Unexpected API discovery"); };
  const { value } = controller(t, {readUpdateSettings:async()=>({updatePreference:"manual"})});
  await value.check({manual:true});
  assert.equal(value.getState().mode, "manual");
  assert.equal(value.getState().status, "available");
  await value.download();
  assert.equal(value.getState().mode, "in-app");
  assert.equal(value.getState().status, "downloaded");
  assert.equal(fixture.downloads, 1);
});

test("ZIP user path downloads and reveals a verified archive, never an installer", async t => {
  fixture.profile = await directory();
  let finishDownload, markReady;
  const ready = new Promise(resolveReady => { markReady = resolveReady; });
  fixture.fetch = async url => {
    if (url.includes("api.github.com")) return Response.json([release]);
    return new Response(new ReadableStream({start(stream) {
      finishDownload = () => { stream.enqueue(data); stream.close(); };
      markReady();
    }}));
  };
  const { value } = controller(t, {distribution:"zip", readUpdateSettings: async () => ({updatePreference:"automatic"})});
  await value.check({manual:true});
  assert.equal(value.getState().mode, "manual");
  const download = value.download();
  await ready;
  await value.check({manual:true});
  assert.equal(value.getState().status, "downloading");
  finishDownload();
  await download;
  assert.equal(value.getState().status, "downloaded");
  assert.equal(fixture.revealed.length, 1);
  assert.deepEqual(await readFile(fixture.revealed[0]), data);
  assert.equal(fixture.downloads, 0);
  assert.throws(() => value.install(), /no downloaded/);
  assert.equal(fixture.installs, 0);
});

test("archive checksums, redirect guards, and partial cleanup fail closed", async () => {
  const artifact = selectManualUpdateArtifact(release, release.tag_name, "zip");
  assert.throws(() => selectManualUpdateArtifact(release, release.tag_name, "portable"), /matching/);
  assert.throws(() => selectManualUpdateArtifact({...release,assets:[{...release.assets[0],digest:null}]}, release.tag_name, "zip"), /checksum/);
  const destination = await directory();
  await assert.rejects(downloadManualUpdate({
    artifact, directory:destination, fetch:async()=>new Response(Buffer.alloc(data.length)),
    assertPublicUrl:async()=>{}, progress:()=>{}, signal:new AbortController().signal,
  }), /checksum/);
  assert.deepEqual(await readdir(destination), []);
  const guarded = [];
  await assert.rejects(downloadManualUpdate({
    artifact, directory:destination, fetch:async()=>new Response(null,{status:302,headers:{location:"http://127.0.0.1/internal"}}),
    assertPublicUrl:async url=>{guarded.push(url);if(url.startsWith("http:"))throw new Error("blocked redirect");},
    progress:()=>{}, signal:new AbortController().signal,
  }), /blocked redirect/);
  assert.equal(guarded.length, 2);
  assert.deepEqual(await readdir(destination), []);
});

test("unidentified Windows distributions never qualify for installer execution", async t => {
  const { value } = controller(t, {distribution:undefined,readUpdateSettings:async()=>({updatePreference:"automatic"})});
  await value.readyState();
  assert.equal(value.getState().mode, "manual");
  assert.equal(value.getState().automaticSupported, false);
  assert.equal(value.getState().manualDownloadSupported, false);
});

test("development builds retain read-only version detection without installation", async t => {
  fixture.fetch = async () => Response.json([release]);
  const { value } = controller(t, {isPackaged:false});
  await value.check({manual:true});
  assert.equal(value.getState().mode, "disabled");
  assert.equal(value.getState().status, "available");
  await assert.rejects(value.download(), /not supported/);
  assert.throws(()=>value.install(), /no downloaded/);
});
