#!/usr/bin/env node
/**
 * packages-acl.mjs — packages/ 第三层防护：文件系统级「拒绝删除」硬锁
 *
 * 原理：Windows NTFS ACL 中，显式 Deny 条目优先于任何 Allow（包括 Owner）。
 * 对 packages/ 整棵树施加 `(D,DC)`（Delete + Delete Child）的 Deny 条目后，
 * 任何进程——包括本用户自己——都无法删除或重命名该目录下的文件，
 * 直到显式移除该条目。这能挡住「来源不明的批量删除」。
 *
 * 代价与配套：硬锁同时会挡住正常操作（git checkout / git clean / pnpm 重装 /
 * 编辑器保存）。因此必须配合 unlock 使用。锁定状态记录在
 * cache/packages-guard/acl-lock.json，unlock 读取它精确回收，避免误删其他 ACL。
 *
 * 用法：
 *   node scripts/packages-acl.mjs lock     施加拒绝删除锁
 *   node scripts/packages-acl.mjs unlock   解除锁（恢复正常可写）
 *   node scripts/packages-acl.mjs status   查看当前锁定状态
 *
 * 平台：仅 Windows 有效。非 Windows 平台优雅降级（打印提示，退出码 0）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), "..");
const PACKAGES_DIR = join(REPO_ROOT, "packages");
const GUARD_DIR = join(REPO_ROOT, "cache", "packages-guard");
const LOCK_STATE = join(GUARD_DIR, "acl-lock.json");

const IS_WINDOWS = process.platform === "win32";
/**
 * Deny 权限掩码 —— 实测结论（务必保留注释，这是反复试错得到的正确值）：
 *
 *   (OI)(CI)(DE)   ← 正确：读/写正常，删除与重命名被拒
 *   (OI)(CI)(D)    ← 错误：会连带拒绝 listdir 与读取，把目录变成不可访问
 *   (OI)(CI)(D,DC) ← 错误：同样连带拒绝读取（scandir 报 EPERM）
 *
 * 要点：
 * - 必须带 (OI)(CI) 继承标志。缺了它 Deny 只落在目标目录这一层，
 *   子目录/子文件仍可被逐个删除（实测可被 rmtree 清空）。
 * - 必须用 DE 而不是 D。icacls 的 D 掩码会波及读取权限，DE 不会。
 */
const DENY_MASK = "(OI)(CI)(DE)";

function log(m) {
  process.stdout.write(`${m}\n`);
}
function fail(m) {
  process.stderr.write(`\n[packages-acl] ERROR: ${m}\n`);
  process.exit(1);
}

/**
 * 调用 icacls.exe。
 * 直接 spawn 可执行文件并传参数数组，避免 shell 拼串带来的引号/反斜杠转义陷阱。
 * 注意 icacls 的中文输出是 GBK，不能按 utf8 解码（会抛错），所以用 buffer 输出，
 * 仅在需要回显时按 GBK 尽力解码。
 */
function icacls(args) {
  const buf = execFileSync("icacls.exe", args, {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return decodeGbk(buf);
}

/** 控制台中文输出多为 GBK/CP936，按 utf8 解码会失败。这里做尽力解码。 */
function decodeGbk(buf) {
  if (!buf || buf.length === 0) return "";
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    // 回退：GBK 与 ASCII 在单字节区间兼容，非 ASCII 字节保留为可读占位
    return buf.toString("latin1");
  }
}

/**
 * 解析当前用户主体（形如 `域名\用户名`）。
 * 注意：在 Git Bash / MSYS 环境下，PATH 里的 `whoami` 是 Unix 版本，
 * 直接调用会返回裸用户名（如 `admin`），而 icacls **不接受**这种短名 ——
 * 会报「无效参数」。所以必须经由 `cmd /c whoami` 取到带域名的全名。
 * 多路回退，任一成功即返回。
 */
function currentPrincipal() {
  // 路径 1：cmd /c whoami（最可靠，返回 域\用户）
  try {
    const out = execFileSync("cmd", ["/c", "whoami"], {
      encoding: "utf8",
      windowsHide: true,
    }).trim();
    if (out && out.includes("\\")) return out;
  } catch {
    /* fall through */
  }

  // 路径 2：环境变量拼装
  const user = process.env.USERNAME;
  const domain = process.env.USERDOMAIN || process.env.COMPUTERNAME;
  if (user && domain) return `${domain}\\${user}`;

  fail(
    "无法确定当前用户主体名（需要 `域\\用户名` 形式）。" +
      "请手动设置环境变量 USERDOMAIN 与 USERNAME 后重试。",
  );
}

function ensureGuardDir() {
  if (!existsSync(GUARD_DIR)) mkdirSync(GUARD_DIR, { recursive: true });
}

function readLockState() {
  if (!existsSync(LOCK_STATE)) return null;
  try {
    return JSON.parse(readFileSync(LOCK_STATE, "utf8"));
  } catch {
    return null;
  }
}

function cmdLock() {
  if (!IS_WINDOWS) {
    log("[packages-acl] 非 Windows 平台，ACL 硬锁不适用。已跳过（退出码 0）。");
    log("            该平台请依赖 snapshot/verify/restore 三层中的前两层。");
    return 0;
  }
  if (!existsSync(PACKAGES_DIR)) fail("packages/ 不存在，无法加锁。");

  const existing = readLockState();
  if (existing?.locked) {
    log(`[packages-acl] 已处于锁定状态（${existing.lockedAt}，主体 ${existing.principal}）。`);
    return 0;
  }

  const principal = currentPrincipal();
  log(`[packages-acl] 正在对 packages/ 施加拒绝删除锁 ...`);
  log(`  主体：${principal}`);
  log(`  掩码：${DENY_MASK}`);

  try {
    icacls([PACKAGES_DIR, "/deny", `${principal}:${DENY_MASK}`, "/T", "/C", "/Q"]);
  } catch (err) {
    fail(`施加 ACL 失败：${err.message}`);
  }

  ensureGuardDir();
  writeFileSync(
    LOCK_STATE,
    JSON.stringify(
      {
        locked: true,
        lockedAt: new Date().toISOString(),
        principal,
        mask: DENY_MASK,
        target: relative(REPO_ROOT, PACKAGES_DIR),
      },
      null,
      2,
    ),
    "utf8",
  );

  log(`[packages-acl] 已锁定。packages/ 现在无法被删除或重命名。`);
  log(`[packages-acl] 需要正常改动（git checkout / pnpm 重装 / 编辑保存）前，请先执行 unlock。`);
  return 0;
}

function cmdUnlock() {
  if (!IS_WINDOWS) {
    log("[packages-acl] 非 Windows 平台，无需解锁。");
    return 0;
  }

  const state = readLockState();
  const principal = state?.principal || currentPrincipal();
  const mask = state?.mask || DENY_MASK;

  if (!existsSync(PACKAGES_DIR)) {
    log("[packages-acl] packages/ 不存在，无需解锁；已清理锁状态。");
    if (existsSync(LOCK_STATE)) rmSync(LOCK_STATE, { force: true });
    return 0;
  }

  log(`[packages-acl] 正在解除 packages/ 的拒绝删除锁 ...`);
  log(`  主体：${principal}`);

  try {
    icacls([PACKAGES_DIR, "/remove:d", principal, "/T", "/C", "/Q"]);
  } catch (err) {
    // 即使失败也继续清理状态文件前的提示，让用户知道发生了什么
    fail(`解除 ACL 失败：${err.message}`);
  }

  if (existsSync(LOCK_STATE)) rmSync(LOCK_STATE, { force: true });
  log("[packages-acl] 已解锁。packages/ 恢复正常读写。");
  return 0;
}

function cmdStatus() {
  if (!IS_WINDOWS) {
    log("[packages-acl] 非 Windows 平台，ACL 硬锁不适用。");
    return 0;
  }

  const state = readLockState();
  log("------------------------------------------------------");
  log("  packages/ ACL 锁定状态");
  log("------------------------------------------------------");
  if (state?.locked) {
    log(`  状态  ：已锁定`);
    log(`  时间  ：${state.lockedAt}`);
    log(`  主体  ：${state.principal}`);
    log(`  掩码  ：${state.mask}`);
  } else {
    log(`  状态  ：未锁定（正常可写）`);
  }

  if (existsSync(PACKAGES_DIR)) {
    log("");
    log("  当前 ACL：");
    try {
      const out = icacls([PACKAGES_DIR]);
      for (const l of out.split(/\r?\n/)) {
        if (l.trim()) log(`    ${l.trim()}`);
      }
    } catch (err) {
      log(`    （读取失败：${err.message}）`);
    }
  }
  log("------------------------------------------------------");
  return 0;
}

function main() {
  const [, , cmd] = process.argv;
  switch (cmd) {
    case "lock":
      return process.exit(cmdLock());
    case "unlock":
      return process.exit(cmdUnlock());
    case "status":
      return process.exit(cmdStatus());
    default:
      log(
        [
          "packages-acl — packages/ 拒绝删除硬锁",
          "",
          "  lock     施加拒绝删除锁",
          "  unlock   解除锁（正常改动前必须先执行）",
          "  status   查看锁定状态与当前 ACL",
          "",
        ].join("\n"),
      );
      return process.exit(cmd ? 1 : 0);
  }
}

main();
