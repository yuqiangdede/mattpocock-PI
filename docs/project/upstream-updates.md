# 官方源码更新与定制维护

本仓库接入官方 `vastsa/PI-Desktop` 的稳定发布，同时保留 Matt 技能、工程工作流、Composer 快捷入口和定制版发布身份。官方源码基线记录在 `packages/shared/src/upstream.ts`，建立本手册时接入的是 `0.16.1` / `104c3613d3037bf0c600151d80e92a5cd73e161c`；后续以该文件的实际值为准。定制版应用版本仍由工作区的版本文件管理，两者独立比较。

首次升级的问题、Windows 修复、验收与交付证据见 [0.16.1 升级复盘](upstream-0.16.1-retrospective.md)。本手册提供操作入口，复盘中的历史测试结果不替代下一次升级验收。

The 0.17.0 integration records its upstream revision, conflict decisions and validation in [the 0.17.0 integration report](upstream-0.17.0.md). Upstream source adoption does not itself publish a new fork release.

## 人工更新

环境要求：Node >= 22.19、pnpm >= 10（优先使用 packageManager 指定版本）、项目要求的 Rust 工具链、Git 支持 `merge-tree --write-tree --merge-base`。依赖初始化使用 `pnpm install --frozen-lockfile`。开发启动使用 `pnpm dev`。

在干净的专用更新分支/工作树中执行，例如：

```powershell
git fetch origin main
git worktree add -b codex/upstream-0.17.0 ../mattpocock-PI-upstream-0.17.0 origin/main
Set-Location -LiteralPath '../mattpocock-PI-upstream-0.17.0'
pnpm upstream:check --version 0.17.0
pnpm upstream:check --version 0.17.0 --apply
pnpm upstream:verify
```

版本号只是下一次更新的示例，必须使用真实官方稳定版本。

Reuse compatible host dependencies and build caches for candidate validation. Install from the frozen lockfile only when dependencies are missing or incompatible; keep mutable dependency metadata, profiles and test state local to the request worktree.

预览只抓取指定官方标签并生成项目内 `cache/upstream/<version>.json` 与 `.patch`；不改源码或索引。应用时使用固定官方基线执行三方增量合并，保留定制文件；拒绝主分支、脏工作树、降级和版本不一致的标签。基线文件随候选更新变更，必须和源码一起通过验证后交付。

出现冲突时 `--apply` 停止，源码和索引不变。先读报告，逐项判断双方意图；在专用工作树中人工应用预览补丁、解决标记并更新基线，禁止整文件默认选“官方”或“本地”。旧仓库历史有多个合并基点，首次更新以官方 `v0.16.0` 为明确基线；后续以记录的官方提交为基线，不再依赖旧历史。

`pnpm upstream:verify` 顺序检查更新安全测试、版本文档、构建/类型、JavaScript/Host 回归、Electron 启动、工程工作流、数据目录设置/迁移/启动与定时任务。日志和结果保留在 `cache/upstream-validation/`。验证使用项目内临时数据，不连接真实付费提供商，也不覆盖用户已有数据。需要项目内 Electron 二进制和构建出的 Host。安装新大文件前遵循 `D:\cache` 下载缓存规则。

验证通过后人工检查差异、提交更新分支，再按仓库流程创建 PR。本地入口不提交、不推送、不发布。GitHub 的 Sync PI upstream 工作流也只允许人工指定稳定版本并上传预览报告，不再每日镜像官方 `main` 或强推同步分支。

## 定制代码的接口

| 功能 | 定制实现位置 | 官方接入位置 |
| --- | --- | --- |
| 显示名称、仓库、手动升级策略 | `packages/shared/src/fork-config.json` | `protocol.ts` 仅兼容导出；保持存储名称与 appId |
| 官方基线与三来源检测 | `packages/shared/src/upstream.ts`、`electron/main/version-sources.ts` | 应用设置中的版本来源区域 |
| Composer 快捷入口 | `features/coding/CodingWorkbench.tsx`、`useComposerSkillShortcut.ts`、`skill-shortcut-draft.ts` | Composer 草稿选择，不自动提交 |
| 工程工作流 | `ipc/workflow-*.ts`、`services/workflow-execution.ts`、`features/coding`、`components/workpanel/Workflow*` | IPC 注册、工作面板、Host RPC 与数据库 |
| Matt 技能资源 | `crates/host-core/resources/workflow-skills.json` 与工程技能模块 | 技能目录、设置与 Host 技能加载 |

新增定制优先扩展这些模块，保持官方接入位置短小。Agent Runtime 已恢复官方实现；不要为 Matt 工作流复制或替换推理、压缩、提供商和 OAuth 核心。现有 Workflow 持久化与执行还会接触 Host/共享类型，不能宣称已完全插件化；本次不改变数据库和执行语义，也不搬迁全部定制代码。

官方 UI 或协议变更仍可能需要适配。目标是把差异集中到可审阅的接入位置并由回归验证把关，不能保证每次更新零冲突。官方发布说明用于查看继承功能；定制功能和定制版更新来源继续属于本仓库。

## Windows 验证适配

完整测试采用受限并发，保留官方断言和超时。模型目录夹具使用 `fileURLToPath`；打包验证执行真实 Node 打包入口，不依赖 Bash。项目内打包夹具通过子进程解析守卫拒绝继承父目录依赖。Native Pi 持久化断言计数真正的用户/助手记录，避免把项目指令中的同名文字误判成重复消息。上游自动升级控制器通过独立测试策略验证；本应用默认仍仅手动更新。POSIX 权限位不作为 Windows ACL 的验证结果。文件符号链接权限不足会明确跳过，目录 junction 仍实际检查。

The 0.18.0 adoption and Desktop engineering boundaries are recorded in
[the 0.18.0 integration report](upstream-0.18.0.md).
