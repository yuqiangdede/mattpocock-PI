import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { createVersionSourceChecker, compareReleaseVersions } = await import("../electron/main/version-sources.ts");
const sha = "a".repeat(40);
const release = (tag_name, prerelease = false) => ({tag_name, prerelease, draft: false});

test("版本比较支持预发布与旧版本，避免降级提示", () => {
  assert.equal(compareReleaseVersions("v0.16.0", "0.16.0-beta.1"), 1);
  assert.equal(compareReleaseVersions("0.15.9", "0.16.0-beta.1"), -1);
  assert.equal(compareReleaseVersions("1.0.0-beta.10", "1.0.0-beta.2"), 1);
  assert.equal(compareReleaseVersions("custom", "0.16.0"), null);
});
test("三个来源独立查询，只读取已安装技能版本，并缓存检测结果", async () => {
  const urls = [];
  const checker = createVersionSourceChecker({appVersion: "0.16.0-beta.1", skillVersion: async () => sha, request: async (url) => {
    urls.push(url);
    if (url.includes("mattpocock/skills")) return {sha};
    if (url.includes("yuqiangdede")) return [release("0.17.0-beta.1", true)];
    return [release("0.17.0-beta.1", true), release("0.15.0")];
  }});
  const initial = await checker.list();
  assert.equal(urls.length, 0);
  assert.equal(initial[1].currentVersion, sha);
  const results = await Promise.all(initial.map((row) => checker.check(row.id)));
  assert.deepEqual(results.map((row) => row.status), ["current", "current", "available"]);
  assert.equal(urls.length, 3);
  assert.deepEqual((await checker.list()).map((row) => row.status), ["current", "current", "available"]);
  assert.ok(urls.every((url) => !url.includes("trees") && !url.includes("raw.githubusercontent")));
});
test("失败可重试，单项失败不影响其他来源，空发布不冒充最新版", async () => {
  let offline = true;
  const checker = createVersionSourceChecker({appVersion: "0.16.0", skillVersion: async () => sha, request: async (url) => {
    if (url.includes("skills")) { if (offline) throw new Error("offline"); return {sha}; }
    return [];
  }});
  assert.equal((await checker.check("mattpocock-skills")).status, "error");
  assert.equal((await checker.check("mattpocock-pi")).status, "no-release");
  offline = false;
  assert.equal((await checker.check("mattpocock-skills")).status, "current");
  await assert.rejects(checker.check("other"), /Invalid version source/);
});
test("同一来源并发检测只发起一个请求", async () => {
  let resolve;
  let count = 0;
  const response = new Promise((done) => { resolve = done; });
  const checker = createVersionSourceChecker({appVersion: "0.16.0", skillVersion: async () => sha, request: async () => { count++; return response; }});
  const first = checker.check("pi-desktop");
  const second = checker.check("pi-desktop");
  assert.equal(first, second);
  resolve([release("0.17.0")]);
  assert.equal((await first).status, "available");
  assert.equal(count, 1);
});
