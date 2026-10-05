import { EventEmitter } from "node:events";

export const fixture = {
  nextVersion: "0.17.0-beta.1", profile: "", downloads: 0, installs: 0, installFailure: false,
  revealed: [], fetch: async () => { throw new Error("Unexpected external network"); },
};
class FixtureUpdater extends EventEmitter {
  setFeedURL(feed) { this.feed = feed; }
  async checkForUpdates() {
    this.emit("checking-for-update");
    this.emit("update-available", { version: fixture.nextVersion });
  }
  async downloadUpdate() {
    fixture.downloads++;
    this.emit("download-progress", { percent: 50 });
    this.emit("update-downloaded", { version: fixture.nextVersion });
  }
  quitAndInstall() {
    if (fixture.installFailure) {
      this.emit("error", new Error("fixture installer refused"));
      return;
    }
    fixture.installs++;
  }
}
export const updater = new FixtureUpdater();
export const app = { isPackaged: false, getAppPath: () => process.cwd(), getPath: () => fixture.profile };
export const shell = { showItemInFolder: path => fixture.revealed.push(path), openExternal: async () => {} };
export const net = { fetch: (...args) => fixture.fetch(...args) };
export const session = { defaultSession: { resolveProxy: async () => "PROXY fixture:80" } };
export const lookup = async () => [{ address: "93.184.216.34" }];
export default { autoUpdater: updater, NsisUpdater: FixtureUpdater };
