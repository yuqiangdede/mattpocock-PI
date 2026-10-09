import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { createVersionSourceChecker, compareReleaseVersions } = await import("../electron/main/version-sources.ts");
const sha = "a".repeat(40);
const release = (tag_name, prerelease = false) => ({tag_name, prerelease, draft: false});

test("官方源码基线独立于定制版版本，定制版版本较高也能发现官方更新", async () => {
  const checker = createVersionSourceChecker({ appVersion: "99.0.0", upstreamVersion: "0.16.1",
    skillVersion: async () => sha, request: async () => [release("0.16.2")] });
  const initial = await checker.list();
  assert.deepEqual(initial.map(row => row.id), ["mattpocock-skills", "mattpocock-pi"]);
  assert.equal(initial[1].currentVersion, "99.0.0");
  const upstream = await checker.check("pi-desktop");
  assert.equal(upstream.currentVersion, "0.16.1");
  assert.equal(upstream.status, "available");
  assert.equal((await checker.check("mattpocock-pi")).status, "current");
});

test("版本比较支持预发布与旧版本，避免降级提示", () => {
  assert.equal(compareReleaseVersions("v0.16.0", "0.16.0-beta.1"), 1);
  assert.equal(compareReleaseVersions("0.15.9", "0.16.0-beta.1"), -1);
  assert.equal(compareReleaseVersions("1.0.0-beta.10", "1.0.0-beta.2"), 1);
  assert.equal(compareReleaseVersions("custom", "0.16.0"), null);
});
test("only the two updatable sources are listed without network access", async () => {
  const urls = [];
  const checker = createVersionSourceChecker({appVersion: "0.16.0-beta.1", skillVersion: async () => sha, request: async (url) => {
    urls.push(url);
    if (url.includes("mattpocock/skills")) return {sha};
    if (url.includes("yuqiangdede")) return [release("0.17.0-beta.1", true)];
    return [release("0.17.0-beta.1", true), release("0.15.0")];
  }});
  const initial = await checker.list();
  assert.equal(urls.length, 0);
  assert.equal(initial[0].currentVersion, sha);
  assert.deepEqual(initial.map(row => row.id), ["mattpocock-skills", "mattpocock-pi"]);
  const results = await Promise.all(initial.map((row) => checker.check(row.id)));
  assert.deepEqual(results.map((row) => row.status), ["current", "available"]);
  assert.equal(urls.length, 2);
  assert.deepEqual((await checker.list()).map((row) => row.status), ["current", "available"]);
  assert.ok(urls.every((url) => !url.includes("trees") && !url.includes("raw.githubusercontent")));
});

test("release channel selects the highest valid version and never offers a downgrade", async () => {
  let channel = "stable";
  const checker = createVersionSourceChecker({ appVersion: "0.16.0-beta.2", skillVersion: async () => sha,
    getChannel: () => channel, request: async () => [
      release("0.15.0"), release("0.18.0-beta.1", true), release("0.17.0"), release("custom"),
      { ...release("9.0.0"), draft: true },
    ],
  });
  assert.equal((await checker.check("mattpocock-pi")).latestVersion, "0.17.0");
  channel = "prerelease";
  assert.equal((await checker.check("mattpocock-pi")).latestVersion, "0.18.0-beta.1");
  const older = createVersionSourceChecker({appVersion:"1.0.0", skillVersion:async()=>sha, request:async()=>[release("0.17.0")]});
  assert.equal((await older.check("mattpocock-pi")).status, "current");
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
  const checker = createVersionSourceChecker({appVersion: "0.16.0", upstreamVersion: "0.16.0", skillVersion: async () => sha, request: async () => { count++; return response; }});
  const first = checker.check("pi-desktop");
  const second = checker.check("pi-desktop");
  assert.equal(first, second);
  resolve([release("0.17.0")]);
  assert.equal((await first).status, "available");
  assert.equal(count, 1);
});
