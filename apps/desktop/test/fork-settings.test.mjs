import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));
const { APP_NAME, APP_DISPLAY_NAME } = await import("../../../packages/shared/src/protocol.ts");
const { buildBugReportUrl, assertFeedbackIssueUrl } = await import("../../../packages/shared/src/github-feedback.ts");

test("本应用名称与反馈都属于 fork，上游反馈地址不可作为本应用反馈入口", () => {
  assert.equal(APP_DISPLAY_NAME, "mattpocock-PI");
  assert.equal(APP_NAME, "PI-Desktop");
  const url = buildBugReportUrl({version:"0.16.0-beta.1",platform:"win32",arch:"x64",protocolVersion:11});
  assert.equal(new URL(url).pathname, "/yuqiangdede/mattpocock-PI/issues/new");
  assert.match(new URL(url).searchParams.get("environment"), /^mattpocock-PI /);
  assert.doesNotThrow(() => assertFeedbackIssueUrl(url));
  assert.throws(() => assertFeedbackIssueUrl("https://github.com/vastsa/PI-Desktop/issues/new?template=bug_report.yml"), /path/);
});
test("本应用打包更新源与主页都指向 fork", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.homepage, "https://github.com/yuqiangdede/mattpocock-PI");
  assert.equal(pkg.build.publish[0].owner, "yuqiangdede");
  assert.equal(pkg.build.publish[0].repo, "mattpocock-PI");
});
