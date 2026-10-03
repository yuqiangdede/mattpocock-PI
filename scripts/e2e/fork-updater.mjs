import assert from "node:assert/strict";
import { AppUpdaterController } from "../../apps/desktop/electron/main/updater";
import updaterPackage from "electron-updater";

export async function probe() {
  const updater = new AppUpdaterController({
    logger: {app: () => {}}, send: () => {}, currentVersion: "0.16.0-beta.1",
    platform: "win32", isPackaged: true, distribution: "installed",
    readUpdateSettings: async () => ({updatePreference: "automatic"}),
  });
  try {
    assert.equal(updater.getState().mode, "manual");
    assert.equal(updater.getState().automaticSupported, false);
    updater.setPreference("automatic");
    assert.equal(updater.getState().preference, "manual");
    updater.startAutoCheck();
    assert.equal(updater.initialTimer, null);
    assert.equal(updater.intervalTimer, null);
    await assert.rejects(updater.download(), /not supported/);
    assert.throws(() => updater.install(), /no downloaded/);
    const result = await updater.check({manual: true});
    assert.equal(result.status, "available");
    assert.equal(result.availableVersion, "v0.17.0");
    assert.equal(result.releaseNotes, undefined);
    assert.equal(updaterPackage.autoUpdater.autoDownload, false);
    assert.equal(updaterPackage.autoUpdater.autoInstallOnAppQuit, false);
    assert.deepEqual(updaterPackage.autoUpdater.feed, {provider: "github", owner: "yuqiangdede", repo: "mattpocock-PI"});
    return {ok: true, historicalAutomaticPreference: "manual", installBlocked: true, forkReleaseDetected: true};
  } finally { updater.dispose(); }
}
