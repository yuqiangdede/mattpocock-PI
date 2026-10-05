# Windows 0.16.1-beta.1 发布验收

候选基线：`8b8a296630e33875f7373188d9b6cb3a0e0ad814`（PR #29 合并后的 main）。本次发布面向 Windows x64，属于未签名预览版。

## 本地文件核对与提交范围

主目录的 `AGENTS.md`、`.agents/README.md`、`.pi-init-original-89380339-41cb-4b25-8c76-04674e9b8d72`、`scripts/start.ps1`、`scripts/verify.ps1` 原样保留，不进入发布提交。AGENTS 的精简是本地初始化修改；初始化备份与远程原版 AGENTS.md 的 Git blob 完全一致，是恢复材料；两个脚本仅包装现有 `pnpm dev` 和 `pnpm test`，不包含业务逻辑。

发布在干净的 main 独立工作树中完成。提交范围为版本号、各语言发布说明、更新规格中文镜像与导航、需求确认交付状态、更新安装错误码注册表与规格，以及本验收记录。

## 已完成检查

- Desktop 最终全量门禁：3465 通过，零失败、零取消，46 项显式跳过。命令：在 apps/desktop 运行 `node --test --test-concurrency=4 --test-timeout=180000 test/*.test.mjs`，耗时 208.8 秒。

- Host 全量测试：787 通过，零失败。
- Shared 全量测试：1174 通过；i18n：29 通过。
- Agent runtime 全量测试：1823 通过，零失败。
- 全部工作区依赖 TypeScript 构建、Desktop TypeScript 与生产 Electron 构建通过。
- Rust fmt/clippy 通过，保留既有 unused-variable 警告；109 文件 Biome lint、样式规则、agent policy、发布文档和 diff 检查通过。
- 文档：88 对中英文规格、592 页面检查通过。
- 需求确认、完整 Composer 与显式更新 Electron E2E 通过，使用隔离配置和本地模拟服务。
- 安装版及 ZIP 实际启动通过：版本一致，protocol 11；800 会话列表最大耗时 314.1 ms / 300.4 ms，Main 最大间隔 161.2 ms / 126.4 ms。
- 包内工程技能 E2E 通过，涵盖真实 Skill 加载、Workflow 调用、本地修改和禁用状态重启保留。
- 六组 Workflow 回归通过：创建、发现、恢复、阶段、重开和产物。
- Portable 实际启动通过：包内需求确认按钮、技能说明 tooltip、应用/Host 版本、protocol 11、五个主操作、四组 19 个 More 入口正确；退出释放调试端口。
- 三种发布文件完整性检查通过，更新源 SHA512 与安装器一致。
- 安装版包内清单通过：一个 Host、一个 sidecar、技能许可证保留；ASAR 无多余测试、声明文件、sourcemap 或原始 renderer 依赖。安装包约 111.8 MB。

原始日志和辅助验收脚本位于工作树 `cache/release-acceptance/`。主目录本地文件 SHA256 基线单独记录，以便交付后核对。

## 过程问题

早期 Desktop 测试在依赖输出未构建时失败；另一次从仓库根目录启动导致三个相对路径夹具失败。这些运行不作为验收依据，最终全量门禁从 apps/desktop 运行。pnpm 自动初始化被停止，改用项目相同的 TypeScript、bundler、electron-builder 入口，工作区包指向候选代码。首轮 NSIS 下载超时，复用现有工具缓存并重新打包。一次全量运行停在 Vite 侧栏夹具，单独运行该夹具通过后，在构建完成且依赖不再变化的环境中以四并发和每文件 180 秒超时重跑。早期 ZIP 启动尝试发生在 ZIP 输出生成前，随后完整重跑通过。

已发现并修复 main 的发布阻断：Host 的更新安装安全门返回 `UPDATE_INSTALLING`，但共享 ErrorCodes 未登记。现有错误码注册表回归先失败，补齐共享登记和中英文说明后 2/2 通过；未改变 Host 的阻止行为。修复后重新执行完整 Desktop 门禁和三种格式打包验收。测试环境另有六个示例插件无法找到 React，复用既有版本的本地依赖链接后通过；运行中移动保留链接触发 Vite 重载，Scheduled 返回夹具暂时丢失模块状态。稳定目录后，未修改原始测试断言的 11 项定点回归全部通过，再完整重跑 Desktop。保留链接移入默认忽略目录后，侧栏单项由约 18 秒降到约 5 秒。更新界面 E2E 曾在高负载下超时，最后一次完整重跑 Host 和界面均通过。

## 验收边界

没有替换用户现有安装或使用用户数据库、真实模型和付费 API。Authenticode、干净虚拟机、真实 NSIS 安装/升级、自动更新安装链路、macOS/Linux 和远程 pi-host 不属于本次已验证范围。应用更新 E2E 使用模拟安装传输，不代表真实升级通过。

运行方式：执行 Setup 安装器，或解压 ZIP 后运行 `PI-Desktop.exe`，或直接运行 Portable。用户运行不需要 Node/Rust。源码初始化与开发命令沿用 README；Windows 构建入口为 `pnpm --filter @pi-desktop/desktop dist:win`。






