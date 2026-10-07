# Skill Launcher 阶段一交付

本次以用户 2026-10-06 的两阶段战略为准。#31–#37 已重写为 Skill Launcher 工单，代码由 PR #38 的 codex/configurable-skill-shortcuts 分支交付。未合并或发布应用。

## 实际修改与调用链

- Shared 的 coding-actions 定义轻量 CodingAction、Registry、校验、排序及兼容迁移。
- Main 的 coding-action-store 负责独立 JSON、备份、原子写入和损坏回退；register / protocol / api 仅接入三个配置通道。
- CodingWorkbench 读取 Registry，只按顺序将前六项与 More Actions 投影为视图。
- execute-coding-action / useCodingActionLauncher 解析当前原生 Skill Catalog，调用原有 sendPrompt，携带当前 Session 请求和附件；接受后按原草稿 revision 清理。
- CodingActionSettingsPage 复用现有扩展设置卡片，提供最小 CRUD、排序、启用、可选提示词与 JSON 便携配置。
- i18n 为界面与默认名称提供 en/zh-CN；其余语言按现有 English fallback。初值可以本地化，用户已保存的名称和提示词不自动改写。

```text
Action id → Registry → 原生有效 Skill → sendPrompt / Prompt IPC
          → 原生 Skill Loader 读取最新 SKILL.md → 当前 Session Pi Agent
```

与 origin/main 比较，Pi Agent Runtime、session-launch、sidecar、agent-ipc、composer-ipc 核心实现没有净改动。没有另建 Skill 系统或 Agent 调用系统。

## 配置与兼容

扩展配置位于当前应用数据目录的 extensions/coding-actions.json；仅有 schemaVersion 与 actions。备份位于同目录下的 coding-action-backups。

旧 engineeringShortcutPrompts 的自定义、null、空值保留；必要自定义辅助动作继续存在。旧未发布的 skill-shortcuts.json 保留原文件并迁移动作身份、名称、Skill、启用、提示词、说明与顺序，不保留位置、分组和来源锁定。新配置存在时不重复迁移。

损坏或过大配置回退内存默认值，不静默覆盖。显式恢复先确认并逐字节备份。普通 Chat / Agent 保持可用。历史独立工程 Workflow 与需求确认保留兼容，不成为任何 Action 的前置条件。

## 环境与验证方式

环境要求沿用项目：Node >=22.19、pnpm >=10、Windows 上可用的 Electron 与兼容 Host。实际验证使用 Node 24.15.0 / Electron 43.6.0。

初始化和启动沿用 README 的 pnpm install --frozen-lockfile / pnpm dev；本次没有新增部署依赖。代码验证入口：

```text
pnpm --filter @pi-desktop/desktop build:deps
pnpm --filter @pi-desktop/desktop typecheck
pnpm --filter @pi-desktop/desktop build
pnpm --filter @pi-desktop/desktop test
pnpm --filter @pi-desktop/shared test
pnpm --filter @pi-desktop/i18n test
pnpm test:e2e:coding-actions
node scripts/e2e-workflow-runs.mjs --engineering-settings
node scripts/e2e-electron-boot.mjs
```

任务工作树复用兼容 Host 二进制时通过 PI_DESKTOP_HOST_BIN 指定；测试数据和日志放在项目内。E2E 使用真实 Electron / Host / Pi Runtime，模型边界为确定性的测试 Provider，不声称已验证外部模型联网。

## 已验证

- Desktop 全套：3481 passed、46 skipped（3527 tests），无失败。
- Shared：1174 passed；i18n：29 passed。
- Actions / 导航 / 设置目标回归：54 passed。
- 正规 typecheck、完整 Desktop build、Main bundle 语法、样式 token 与 diff 检查通过。
- Coding Actions E2E：执行、最新 Skill、CRUD / 排序 / enabled、missing、损坏回退、普通 Chat、重启和原生设置保持通过；重试取消保留编辑也通过。
- 工程 Skill 检测、更新、本地修改保护与离线错误 E2E 通过。
- 新构建完整应用启动、sandbox Preload / IPC 与 800 会话响应性 Boot Probe 通过（Host protocol 11）。
- 双轴静态审查：规格未发现偏差；重试并发、i18n 与重复排序问题已修复并复核。

完整构建发现 electron-vite 静态 import 正则误识别以 import 结尾的英文译文；将导入按钮文案明确为 Validate and import actions 后构建恢复。未修改打包器或 Runtime。

## 第二阶段与后续工单

Development Navigator、ProjectState、Artifact Tracking / Freshness、Recommendation、Next Step、流程百分比、强制阶段跳转与自动推进均未实现。本次不做 Workflow 模板升级引擎。

#31–#36 保留编号并重写为轻量动作能力；#37 改为阶段一验收与原生交互回归。PR #38 已于 2026-10-06 合并，#31–#37 已关闭。建议后续导航能力另行提出需求与工单，不将强流程回填到这七张工单中。

实现交付时未做安装包验收。后续 Windows 候选包验收见 [2026-10-06 验收记录](windows-skill-launcher-acceptance-2026-10-06.md)；最新主分支 0.16.1-beta.2 发行验收见 [2026-10-07 发布验收](windows-release-acceptance-2026-10-07-beta2.md)。签名、干净机器及跨平台验收仍未覆盖。
