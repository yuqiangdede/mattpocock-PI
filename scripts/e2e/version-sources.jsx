import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { IPC } from "@pi-desktop/shared";
import { VersionSourcesSection } from "../../apps/desktop/src/features/settings/VersionSourcesSection";

const ids = ["pi-desktop", "mattpocock-skills", "mattpocock-pi"];
const calls = [];
let failure = true;
window.piDesktop = {
  platform: "win32", on: () => () => {},
  async invoke(channel, id) {
    calls.push({channel, id});
    let data;
    if (channel === IPC.invoke.versionSourcesList) data = ids.map((id) => ({id, currentVersion: "0.16.0-beta.1", latestVersion: null, status: "idle", checkedAt: null, url: "https://github.com"}));
    else if (channel === IPC.invoke.versionSourcesCheck) {
      data = {id, currentVersion: "0.16.0-beta.1", latestVersion: "0.17.0", status: id === "mattpocock-skills" && failure ? "error" : "available", checkedAt: new Date().toISOString()};
      if (data.status === "error") data.error = "模拟离线";
    } else if (channel === IPC.invoke.versionSourcesOpen) data = {ok: true};
    else throw new Error(`Unexpected IPC ${channel}`);
    return {ok: true, data};
  },
};
const root = createRoot(document.getElementById("root"));
flushSync(() => root.render(<div className="settings-content"><VersionSourcesSection /></div>));
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
function assert(value, message) { if (!value) throw new Error(message); }
const buttons = (label) => [...document.querySelectorAll("button")].filter((button) => button.textContent.trim() === label);
window.settingsScrollProbe = async () => {
  await settle();
  assert(ids.every((id) => document.body.textContent.includes(id === "pi-desktop" ? "PI-Desktop 原版" : id === "mattpocock-skills" ? "Matt Pocock 技能包" : "mattpocock-PI")), "三项来源必须显示");
  assert(calls.length === 1, "打开设置不能自动联网");
  buttons("检查全部更新")[0].click();
  await settle();
  assert(calls.filter((call) => call.channel === IPC.invoke.versionSourcesCheck).length === 3, "检查全部必须覆盖三项");
  assert(buttons("重试").length === 1, "失败项应显示重试");
  failure = false;
  buttons("重试")[0].click();
  await settle();
  assert(buttons("重试").length === 0, "重试成功应清除错误");
  for (const button of buttons("查看更新")) button.click();
  await settle();
  assert(calls.filter((call) => call.channel === IPC.invoke.versionSourcesOpen).map((call) => call.id).join() === ids.join(), "更新入口必须区分来源");
  assert(!document.body.textContent.includes("\ufffd"), "中文不能含乱码");
  return {ok: true, checks: ["三项展示", "手动检测全部", "单项失败重试", "独立更新入口", "中文可读"]};
};
