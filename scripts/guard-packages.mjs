#!/usr/bin/env node
/**
 * guard-packages.mjs — packages/ 防清空守卫
 *
 * 背景：packages/ 下被 git 跟踪的源文件曾多次（10-03 / 10-06 / 10-07 / 10-09）
 * 在来源不明的情况下被批量删除，导致 pnpm workspace 从 13 个项目塌缩到 4 个，
 * 每次都要人工从 HEAD 恢复。本脚本提供三层防护中「快照 / 校验 / 还原」的落地实现。
 *
 * 用法：
 *   node scripts/guard-packages.mjs snapshot        建立一份新快照（默认保留最近 N 份）
 *   node scripts/guard-packages.mjs verify          校验当前 packages/ 与最新快照是否一致
 *   node scripts/guard-packages.mjs restore [id]    从最新（或指定 id）快照还原
 *   node scripts/guard-packages.mjs list            列出全部快照
 *   node scripts/guard-packages.mjs baseline        用 git HEAD 建立权威基线清单
 *
 * 设计要点：
 * - 零外部依赖，只用 node 内置模块（fs / path / crypto / child_process）。
 * - 不硬编码绝对路径，全部相对脚本自身推导，保证可移植。
 * - 快照同时记录文件清单 + SHA256，用于精确比对。
 * - 还原采用「先删后写」，但**只作用于 packages/ 内部**，绝不越界。
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const GUARD_DIR = join(REPO_ROOT, "cache", "packages-guard");
const SNAPSHOTS_DIR = join(GUARD_DIR, "snapshots");
const MANIFEST_NAME = "manifest.json";

/** 需要排除的目录名（构建产物/依赖，不属于源文件） */
const EXCLUDE_DIRS = new Set(["node_modules", "dist", "dist-bundle", ".turbo", ".cache"]);

/** 保留的快照份数上限 */
const KEEP_SNAPSHOTS = Number(process.env.PACKAGES_GUARD_KEEP || 10);

// ---------------------------------------------------------------- 工具函数

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function fail(msg) {
  process.stderr.write(`\n[guard-packages] ERROR: ${msg}\n`);
  process.exit(1);
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/** 递归收集目录下所有文件（相对路径），排除 EXCLUDE_DIRS */
function collectFiles(rootDir, baseDir = rootDir, acc = []) {
  if (!existsSync(rootDir)) return acc;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const abs = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      collectFiles(abs, baseDir, acc);
    } else if (entry.isFile()) {
      acc.push(relative(baseDir, abs).split(sep).join("/"));
    }
  }
  return acc;
}

/** 生成清单：{ files: { relPath: {size, sha256} }, count, totalBytes } */
function buildManifest(baseDir) {
  const files = {};
  let totalBytes = 0;
  for (const rel of collectFiles(baseDir).sort()) {
    const abs = join(baseDir, rel);
    const buf = readFileSync(abs);
    files[rel] = { size: buf.length, sha256: sha256(buf) };
    totalBytes += buf.length;
  }
  return { files, count: Object.keys(files).length, totalBytes };
}

/**
 * git HEAD 中的跟踪文件清单（权威基线，独立于工作区状态）。
 * 某些受限环境下 spawn 子进程会被拒绝，此时返回 null 并降级，
 * 不阻塞快照主流程 —— 快照本身不依赖 git。
 */
function gitTrackedPackageFiles() {
  try {
    const out = execFileSync("git", ["ls-files", "--", "packages"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return out
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((p) => !EXCLUDE_DIRS.has(p.split("/")[1] || ""))
      .sort();
  } catch (err) {
    log(`[guard-packages] 提示：无法读取 git 清单（${err.code || err.message}），已降级处理。`);
    return null;
  }
}

function readManifest(snapshotDir) {
  const p = join(snapshotDir, MANIFEST_NAME);
  if (!existsSync(p)) fail(`快照缺少 manifest：${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function listSnapshots() {
  if (!existsSync(SNAPSHOTS_DIR)) return [];
  return readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // 时间戳命名，字典序即时间序
}

// ---------------------------------------------------------------- 命令实现

function cmdSnapshot() {
  if (!existsSync(PACKAGES_DIR)) fail("packages/ 目录不存在，无法建立快照。");
  mkdirSync(SNAPSHOTS_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const snapDir = join(SNAPSHOTS_DIR, stamp);
  mkdirSync(snapDir, { recursive: true });

  // 1) 存一份纯文件副本（用于还原）
  const filesDir = join(snapDir, "files");
  cpSync(PACKAGES_DIR, filesDir, {
    recursive: true,
    filter: (src) => {
      const name = src.split(sep).pop();
      return !EXCLUDE_DIRS.has(name);
    },
  });

  // 2) 存清单（用于校验）
  const manifest = buildManifest(PACKAGES_DIR);
  manifest.snapshotId = stamp;
  manifest.createdAt = new Date().toISOString();
  manifest.source = "working-tree";

  // 3) 附带 git HEAD 基线，便于交叉验证（失败则跳过，不影响快照）
  const tracked = gitTrackedPackageFiles();
  manifest.gitTracked = tracked ? { count: tracked.length, files: tracked } : null;

  writeFileSync(join(snapDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), "utf8");

  // 4) 顺手更新「最新快照」软指针（纯文本，跨平台）
  writeFileSync(join(GUARD_DIR, "LATEST"), stamp, "utf8");

  log(`[guard-packages] 快照已建立：${stamp}`);
  log(`  源文件数：${manifest.count}`);
  log(`  总字节  ：${manifest.totalBytes}`);
  if (manifest.gitTracked) log(`  git 跟踪：${manifest.gitTracked.count}`);

  pruneOldSnapshots();
}

function pruneOldSnapshots() {
  const all = listSnapshots();
  if (all.length <= KEEP_SNAPSHOTS) return;
  const drop = all.slice(0, all.length - KEEP_SNAPSHOTS);
  for (const name of drop) {
    rmSync(join(SNAPSHOTS_DIR, name), { recursive: true, force: true });
    log(`  [prune] 已删除旧快照 ${name}`);
  }
}

function pickSnapshot(id) {
  const all = listSnapshots();
  if (all.length === 0) fail("没有任何快照，请先执行 snapshot。");
  if (!id) return all[all.length - 1];
  if (all.includes(id)) return id;
  fail(`找不到快照 "${id}"。可用：${all.join(", ")}`);
}

function cmdVerify(opts = {}) {
  const snapId = pickSnapshot(opts.id);
  const snapDir = join(SNAPSHOTS_DIR, snapId);
  const expected = readManifest(snapDir);
  const actual = buildManifest(PACKAGES_DIR);
  const expFiles = Object.keys(expected.files);
  const actFiles = Object.keys(actual.files);
  const missing = expFiles.filter((f) => !(f in actual.files));
  const added = actFiles.filter((f) => !(f in expected.files));
  const changed = expFiles.filter(
    (f) => f in actual.files && actual.files[f].sha256 !== expected.files[f].sha256,
  );

  const ok = missing.length === 0 && changed.length === 0;

  log("");
  log("======================================================");
  log(`  packages/ 完整性校验  (对照快照 ${snapId})`);
  log("======================================================");
  log(`  期望文件数：${expected.count}`);
  log(`  实际文件数：${actual.count}`);
  log(`  缺失      ：${missing.length}`);
  log(`  被改动    ：${changed.length}`);
  log(`  新增      ：${added.length}`);
  log("------------------------------------------------------");

  if (ok) {
    log("  结果：OK — packages/ 与快照一致。");
    log("======================================================");
    log("");
    return 0;
  }

  log("");
  log("");
  log("  ##############################################################");
  log("  ##                                                          ##");
  log("  ##   !!!  packages/ 完整性告警：内容已偏离快照  !!!          ##");
  log("  ##                                                          ##");
  log("  ##   有文件缺失或被改动，很可能遭遇了批量删除事故。         ##");
  log("  ##                                                          ##");
  log("  ##############################################################");
  log("");
  if (missing.length) {
    log(`  >>> 缺失文件（前 30 条，共 ${missing.length}）<<<`);
    for (const f of missing.slice(0, 30)) log(`      - ${f}`);
    if (missing.length > 30) log(`      ... 其余 ${missing.length - 30} 条省略`);
    log("");
    log("  >>> 建议立即执行：pnpm guard:restore");
    log("");
  }
  if (changed.length) {
    log(`  >>> 被改动文件（前 30 条，共 ${changed.length}）<<<`);
    for (const f of changed.slice(0, 30)) log(`      ~ ${f}`);
    if (changed.length > 30) log(`      ... 其余 ${changed.length - 30} 条省略`);
    log("");
  }
  if (added.length) {
    log(`  >>> 新增文件（前 30 条，共 ${added.length}）<<<`);
    for (const f of added.slice(0, 30)) log(`      + ${f}`);
    log("");
  }
  log("==============================================================");
  log("");

  const drifted = missing.length > 0 || changed.length > 0;
  if (drifted && opts.warnOnly) {
    log("  [guard-packages] --warn-only：仅告警，不阻断后续命令。");
    log("");
    return 0;
  }
  return drifted ? 2 : 0;
}

function cmdRestore(id) {
  const snapId = pickSnapshot(id);
  const snapDir = join(SNAPSHOTS_DIR, snapId);
  const filesDir = join(snapDir, "files");
  if (!existsSync(filesDir)) fail(`快照 ${snapId} 缺少 files/ 目录，无法还原。`);

  const expected = readManifest(snapDir);
  log(`[guard-packages] 从快照 ${snapId} 还原 packages/ ...`);

  // 安全护栏：确保目标解析后确实位于 REPO_ROOT/packages 之内
  const targetAbs = resolve(PACKAGES_DIR);
  if (!targetAbs.startsWith(resolve(REPO_ROOT) + sep) || !targetAbs.endsWith(`${sep}packages`)) {
    fail(`拒绝操作：还原目标路径异常 (${targetAbs})`);
  }

  // 先删后写：只删 packages/ 内容，保留 packages/ 目录本身
  if (existsSync(PACKAGES_DIR)) {
    for (const entry of readdirSync(PACKAGES_DIR)) {
      if (EXCLUDE_DIRS.has(entry)) continue; // 保留 node_modules 等
      rmSync(join(PACKAGES_DIR, entry), { recursive: true, force: true });
    }
  } else {
    mkdirSync(PACKAGES_DIR, { recursive: true });
  }

  cpSync(filesDir, PACKAGES_DIR, { recursive: true });

  const after = buildManifest(PACKAGES_DIR);
  log(`  还原完成：${after.count} 个文件（期望 ${expected.count}）`);
  if (after.count !== expected.count) {
    fail(`还原后文件数不匹配！期望 ${expected.count}，实际 ${after.count}`);
  }
  log(`  校验通过。`);
  return 0;
}

function cmdList() {
  const all = listSnapshots();
  if (all.length === 0) {
    log("[guard-packages] 暂无快照。");
    return 0;
  }
  log(`[guard-packages] 共 ${all.length} 份快照：`);
  for (const name of all) {
    const m = readManifest(join(SNAPSHOTS_DIR, name));
    log(`  ${name}  files=${m.count}  bytes=${m.totalBytes}  (${m.createdAt})`);
  }
  return 0;
}

function cmdBaseline() {
  const tracked = gitTrackedPackageFiles();
  if (!tracked) {
    fail("当前环境无法调用 git，baseline 命令不可用（快照/校验/还原不受影响）。");
  }
  const manifest = buildManifest(PACKAGES_DIR);
  const missing = tracked.filter((f) => !(f in manifest.files));
  const outPath = join(GUARD_DIR, "git-baseline.json");
  mkdirSync(GUARD_DIR, { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), trackedCount: tracked.length, files: tracked },
      null,
      2,
    ),
    "utf8",
  );
  log(`[guard-packages] git 基线已写入 ${relative(REPO_ROOT, outPath)}`);
  log(`  git 跟踪文件：${tracked.length}`);
  log(`  工作区文件  ：${manifest.count}`);
  if (missing.length) {
    log(`  !! 工作区缺失：${missing.length} 个（git 有但磁盘没有）`);
    for (const f of missing.slice(0, 20)) log(`      - ${f}`);
  } else {
    log(`  工作区与 git 跟踪清单一致。`);
  }
  return missing.length ? 2 : 0;
}

// ---------------------------------------------------------------- 入口

function main() {
  const argv = process.argv.slice(2);
  const cmdIndex = argv.findIndex((a) => !a.startsWith("--"));
  const cmd = cmdIndex >= 0 ? argv[cmdIndex] : undefined;
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  // 位置参数 = cmd 之后第一个非 -- 开头的值
  const arg = argv.slice(cmdIndex + 1).find((a) => !a.startsWith("--"));

  switch (cmd) {
    case "snapshot":
      return process.exit(cmdSnapshot());
    case "verify":
      return process.exit(cmdVerify({ id: arg, warnOnly: flags.has("--warn-only") }));
    case "restore":
      return process.exit(cmdRestore(arg));
    case "list":
      return process.exit(cmdList());
    case "baseline":
      return process.exit(cmdBaseline());
    default:
      log(
        [
          "guard-packages — packages/ 防清空守卫",
          "",
          "  snapshot              建立新快照",
          "  verify [id]           校验当前 packages/ 与最新快照是否一致",
          "  verify --warn-only    同上，但告警不阻断（退出码恒为 0）",
          "  restore [id]          从快照还原",
          "  list                  列出所有快照",
          "  baseline              用 git HEAD 建立权威基线清单",
          "",
        ].join("\n"),
      );
      return process.exit(cmd ? 1 : 0);
  }
}

main();
