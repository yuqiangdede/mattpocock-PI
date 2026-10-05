import React from "react";
import { createRoot } from "react-dom/client";
import i18n from "i18next";
import { I18nextProvider } from "react-i18next";
import { catalogs } from "@pi-desktop/i18n";
import { IPC } from "@pi-desktop/shared";
import { VersionSourcesSection } from "../../src/features/settings/VersionSourcesSection";
import { useAppStore } from "../../src/stores/app-store";

const subscriptions = new Map();
const skillRevision = "a".repeat(40);
let skills = { revision: skillRevision, attemptedAt: 0, checking: false, updating: false, hasBackup: false, tasksRunning: false };
let app = { mode: "in-app", channel: "prerelease", preference: "automatic", defaultPreference: "automatic",
  automaticSupported: true, status: "idle", currentVersion: "0.16.0-beta.2", releasesUrl: "https://github.com/yuqiangdede/mattpocock-PI/releases" };
const emit = (channel, data) => subscriptions.get(channel)?.forEach(listener => listener(structuredClone(data)));
window.fixture = {
  calls: [],
  running(value) {
    skills.tasksRunning = value;
    useAppStore.setState({ runningSessions: value ? { fixture: true } : {} });
  },
  manual() {
    app = { ...app, mode: "manual", automaticSupported: false, manualDownloadSupported: true, status: "idle", availableVersion: undefined };
    emit(IPC.event.updatesState, app);
  },
  finishDownload() { app.status = "downloaded"; app.progressPercent = 100; emit(IPC.event.updatesState, app); },
};
window.piDesktop = {
  platform: "win32",
  on(channel, listener) {
    const listeners = subscriptions.get(channel) ?? new Set();
    listeners.add(listener); subscriptions.set(channel, listeners);
    return () => listeners.delete(listener);
  },
  async invoke(channel, value) {
    window.fixture.calls.push(channel);
    let data = { ok: true };
    if (channel === IPC.invoke.skillBundleStatus) data = skills;
    else if (channel === IPC.invoke.skillBundleCheck) { skills = { ...skills, latestRevision: "b".repeat(40) }; data = skills; }
    else if (channel === IPC.invoke.skillBundleUpdate || channel === IPC.invoke.skillBundleRestore) {
      const restore = channel === IPC.invoke.skillBundleRestore;
      skills = { ...skills, revision: restore ? skillRevision : "b".repeat(40), hasBackup: !restore, preserved: ["retro"] };
      data = { revision: skills.revision, updated: ["implement"], preserved: ["retro"], removed: [] };
      emit(IPC.event.pluginChanged, {reason:"skill"});
    } else if (channel === IPC.invoke.updatesGetState) data = app;
    else if (channel === IPC.invoke.updatesCheck) { app = { ...app, status:"available", availableVersion:app.channel==="stable"?"0.17.0":"0.17.0-beta.1" }; emit(IPC.event.updatesState,app); data=app; }
    else if (channel === IPC.invoke.updatesSetChannel) { app = {...app, channel:value,status:"idle",availableVersion:undefined}; emit(IPC.event.updatesState,app);data=app; }
    else if (channel === IPC.invoke.updatesDownload) { app = {...app,status:"downloading",progressPercent:50};emit(IPC.event.updatesState,app);data=app; }
    return {ok:true,data:structuredClone(data)};
  },
};
await i18n.init({ lng:"zh-CN", resources:{"zh-CN":{translation:catalogs["zh-CN"]}}, interpolation:{escapeValue:false} });
createRoot(document.getElementById("root")).render(
  <I18nextProvider i18n={i18n}><main style={{padding:24}}><VersionSourcesSection /></main></I18nextProvider>,
);
