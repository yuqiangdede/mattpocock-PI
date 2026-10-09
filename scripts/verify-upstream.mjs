import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(root, "cache/upstream-validation");
mkdirSync(join(cache, "tmp"), { recursive: true });
const env = { ...process.env, TEMP: join(cache, "tmp"), TMP: join(cache, "tmp") };
// 直接调用 pnpm 原生或 JavaScript 入口，避免 Windows shell 的引用与 .cmd 差异。
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("请使用 pnpm upstream:verify 执行验证");
const pnpmStep = (args) => /\.exe$/i.test(pnpm) ? [pnpm, args] : [process.execPath, [pnpm, ...args]];
const steps = [
  ["同步安全测试", process.execPath, ["--test", "scripts/update-upstream.test.mjs", "apps/desktop/test/version-sources.test.mjs"]],
  ["版本与文档", process.execPath, ["scripts/check-release-docs.mjs"]],
  ["构建与类型", ...pnpmStep(["typecheck"])],
  // 限制并发防止大型工作区同时创建大量测试进程，保留官方测试断言和时限。
  ["工作区模块回归", ...pnpmStep(["--filter", "./packages/**", "--workspace-concurrency=1", "-r", "exec", "vitest", "run", "--maxWorkers=2", "--reporter=json", `--outputFile=${join(cache, "module-results.json")}`])],
  ["桌面回归", ...pnpmStep(["--filter", "@pi-desktop/desktop", "exec", "node", "--test", "--test-concurrency=2", "test/*.test.mjs"])],
  ["文档回归", process.execPath, ["--test", "docs/scripts/*.test.mjs"]],
  ["Host 回归", "cargo", ["test", "--locked", "-p", "host-core"]],
  ["Host 可执行文件", "cargo", ["build", "--locked", "-p", "host-core"]],
  ["Electron 启动", process.execPath, ["scripts/e2e-electron-boot.mjs"]],
  ["工程工作流", process.execPath, ["scripts/e2e-workflow-runs.mjs"]],
  ["Coding Actions", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--coding-actions"]],
  ["Composer MCP", process.execPath, ["scripts/e2e-composer-mcp.mjs"]],
  ["Composer model selection", process.execPath, ["scripts/e2e-composer-model-selection.mjs"]],
  ["Composer paste", process.execPath, ["scripts/e2e-composer-paste.mjs"]],
  ["Live Voice TLS", process.execPath, ["scripts/e2e-live-voice.mjs", "--fixture"]],
  ["Live Voice HTTP", process.execPath, ["scripts/e2e-live-voice.mjs", "--fixture", "--plain-http"]],
  ["Plan history", process.execPath, ["scripts/e2e-plan-history.mjs"]],
  ["Transcript rendering", process.execPath, ["scripts/e2e-transcript-render.mjs"]],
  ["Renderer responsiveness", process.execPath, ["scripts/e2e-renderer-responsiveness.mjs"]],
  ["Resumable subagents", process.execPath, ["scripts/e2e-subagent-parent-error.mjs"]],
  ["Browser capture viewport", process.execPath, ["scripts/e2e-browser-capture-resize.mjs"]],
  ["Provider model layout", process.execPath, ["scripts/e2e-provider-model-layout.mjs"]],
  ["工程技能设置", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--engineering-settings"]],
  ["工作流发现与执行", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--discovery"]],
  ["工作流恢复", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--recovery"]],
  ["工作流阶段", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--stages"]],
  ["工作流重开", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--reopen"]],
  ["工作流产物", process.execPath, ["scripts/e2e-workflow-runs.mjs", "--artifacts"]],
  ["数据目录设置", process.execPath, ["scripts/e2e-storage-settings.mjs"]],
  ["数据目录迁移", process.execPath, ["scripts/e2e-storage-migration.mjs"]],
  ["数据目录启动", process.execPath, ["scripts/e2e-storage-bootstrap.mjs"]],
  ["定时任务", process.execPath, ["scripts/e2e-scheduled.mjs"]],
  ["差异检查", "git", ["diff", "--check"]],
];
const results = [];
for (const [name, command, args] of steps) {
  const log = join(cache, `${results.length + 1}.log`);
  console.log(`开始：${name}；日志：${log}`);
  const output = createWriteStream(log);
  const start = Date.now();
  const code = await new Promise((done, reject) => {
    const child = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(output, { end: false }); child.stderr.pipe(output, { end: false });
    const timer = setInterval(() => console.log(`验证中：${name}（${Math.round((Date.now() - start) / 1000)} 秒）`), 15000);
    child.on("error", (error) => { clearInterval(timer); output.end(); reject(error); });
    child.on("close", (status) => { clearInterval(timer); output.end(() => done(status)); });
  });
  results.push({ name, code, seconds: Math.round((Date.now() - start) / 1000), log });
  writeFileSync(join(cache, "results.json"), JSON.stringify(results, null, 2) + "\n", "utf8");
  if (code !== 0) { console.error(`失败：${name}。请查看日志，修复后重新验证。`); process.exit(code ?? 1); }
  console.log(`通过：${name}`);
}
console.log("官方更新验证通过；提交、推送与发布由人工执行。");
