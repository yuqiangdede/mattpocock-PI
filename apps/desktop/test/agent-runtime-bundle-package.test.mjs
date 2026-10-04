import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { bundleAgentRuntime, writeBundlePackageManifest } from "../../../packages/agent-runtime/scripts/bundle.mjs";

test("桌面打包携带完整 Agent Runtime 目录", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(pkg.build.extraResources.find((entry) => entry.to === "agent-runtime"), {
    from: "../../packages/agent-runtime/dist-bundle", to: "agent-runtime",
  });
});

test("实际打包入口生成可解析的 ESM sidecar 和模块清单", { timeout: 60_000 }, async () => {
  const cache = fileURLToPath(new URL("../../../cache/runtime-bundle-tests/", import.meta.url));
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(join(cache, "bundle-"));
  try {
    const output = join(root, "dist-bundle");
    await bundleAgentRuntime(output);
    assert.equal(JSON.parse(await readFile(join(output, "package.json"), "utf8")).type, "module");
    assert.ok((await readFile(join(output, "sidecar.js"), "utf8")).length > 1000);
    execFileSync(process.execPath, ["--check", join(output, "sidecar.js")], { stdio: "pipe" });
    // 清单写入函数同样由正式打包调用，验证其实际输出而非旧 shell 命令文本。
    await writeBundlePackageManifest(root);
    assert.equal(JSON.parse(await readFile(join(root, "package.json"), "utf8")).type, "module");
  } finally { await rm(root, { recursive: true, force: true }); }
});
