import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function updateUpstream({ root, version, apply = false, fetch = true }) {
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("请指定稳定版本，例如 --version 0.16.2");
  const baselineFile = resolve(root, "packages/shared/src/upstream.ts");
  const source = readFileSync(baselineFile, "utf8");
  const baseline = Object.fromEntries(["repository", "version", "commit"].map((key) => {
    const value = source.match(new RegExp(`${key}: "([^"]+)"`))?.[1];
    if (!value) throw new Error(`官方基线缺少 ${key}`);
    return [key, value];
  }));
  if (baseline.repository !== "vastsa/PI-Desktop" || !/^[a-f0-9]{40}$/.test(baseline.commit)) throw new Error("官方基线无效");
  const current = baseline.version.split(".").map(Number);
  const next = version.split(".").map(Number);
  const order = next.map((value, i) => value - current[i]).find((value) => value !== 0) ?? 0;
  if (order < 0) throw new Error("不能使用更新入口降级官方基线");
  if (order === 0) return { current: true, version, commit: baseline.commit, conflicts: [] };
  if (apply && git("status", "--porcelain")) throw new Error("应用更新需要干净工作树；请先保留已有改动，并在专用分支执行");
  if (apply && ["main", "master", ""].includes(git("branch", "--show-current"))) throw new Error("请在专用更新分支应用更新");
  const ref = `refs/tags/upstream/v${version}`;
  if (fetch) {
    const baselineRef = `refs/tags/upstream/v${baseline.version}`;
    // 新克隆的 fork 未必包含官方提交对象；显式抓取并核对已接入的标签。
    git("fetch", "--no-tags", `https://github.com/${baseline.repository}.git`,
      `refs/tags/v${baseline.version}:${baselineRef}`, `refs/tags/v${version}:${ref}`);
    if (git("rev-parse", `${baselineRef}^{commit}`) !== baseline.commit) throw new Error("官方基线标签的提交已变化，停止更新");
  }
  const commit = git("rev-parse", `${ref}^{commit}`);
  const packageVersion = JSON.parse(git("show", `${commit}:package.json`)).version;
  if (packageVersion !== version) throw new Error("官方标签与 package.json 版本不一致");
  const baseVersion = JSON.parse(git("show", `${baseline.commit}:package.json`)).version;
  if (baseVersion !== baseline.version) throw new Error("已接入的官方版本与基线提交不一致");
  // 显式基线避开旧仓库的多个 merge-base，保留基线以外的定制增量。
  const merge = spawnSync("git", ["merge-tree", "--write-tree", `--merge-base=${baseline.commit}`, "HEAD", commit], {
    cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (merge.error) throw merge.error;
  if (![0, 1].includes(merge.status)) throw new Error(merge.stderr || "无法生成更新预览");
  const tree = merge.stdout.split("\n")[0].trim();
  if (!/^[a-f0-9]{40}$/.test(tree)) throw new Error("无效更新预览");
  const conflicts = merge.stdout.split("\n").filter((line) => line.startsWith("CONFLICT"));
  const cache = resolve(root, "cache/upstream");
  mkdirSync(cache, { recursive: true });
  const patch = resolve(cache, `${version}.patch`);
  git("diff", `--output=${patch}`, "--binary", "HEAD", tree);
  const report = { version, commit, baseline, tree, conflicts, patch, applied: false,
    changes: git("diff", "--shortstat", "HEAD", tree) };
  writeFileSync(resolve(cache, `${version}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
  if (apply && conflicts.length) throw new Error(`存在 ${conflicts.length} 个冲突，源码未修改。查看 cache/upstream/${version}.json 后人工处理`);
  if (apply) {
    git("apply", "--check", "--index", patch);
    git("apply", "--index", patch);
    writeFileSync(baselineFile, source.replace(`version: "${baseline.version}"`, `version: "${version}"`).replace(baseline.commit, commit), "utf8");
    report.applied = true;
    writeFileSync(resolve(cache, `${version}.json`), JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const known = args.every((arg, i) => arg === "--apply" || arg === "--version" || args[i - 1] === "--version");
  try {
    if (!known) throw new Error("用法: node scripts/update-upstream.mjs --version 0.16.2 [--apply]");
    const report = updateUpstream({ root: fileURLToPath(new URL("..", import.meta.url)), version: args[args.indexOf("--version") + 1], apply: args.includes("--apply") });
    console.log(JSON.stringify(report, null, 2));
    if (report.conflicts.length) process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
