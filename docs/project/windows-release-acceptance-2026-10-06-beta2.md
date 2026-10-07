# Windows 0.16.1-beta.2 发布准备与验收

日期：2026-10-06。结论：发布准备及本记录列出的 Windows 候选包验收通过；尚未交付或公开发布。

## 候选与修改范围

基线为 `origin/main` 的 `9498554fc1e770fc3539c28a8857d2945eadcfec`，独立分支 `test/skill-launcher-win-acceptance`。验收完成前 fetch 确认基线未变化；远端没有 `v0.16.1-beta.2` 标签。

版本改为 `0.16.1-beta.2`，覆盖根、apps、packages、docs 的 package.json、Cargo workspace / lockfile 及 APP_VERSION。为现有稳定文档版本 `0.16.1` 的九种语言 changelog 各补两项亮点并统一日期，不创建 prerelease changelog 条目。更新中英文 README、unreleased 和阶段一交付状态，并形成 [发布说明草稿](windows-release-notes-0.16.1-beta.2.md)。补齐 ADR 0319 的既有格式与索引缺口并更新实现状态，不改变独立配置决策。未修改产品行为、依赖版本、pnpm lockfile 或主目录已有修改。

上轮 [同版本 beta.1 候选验收](windows-skill-launcher-acceptance-2026-10-06.md) 和产物保持。新产物单独放在 `apps/desktop/release/beta2/`，新日志与辅助脚本放在 `cache/release-beta2/`。当前测试的是本分支的未提交版本/文档补丁，不能把基线提交直接当作 beta.2 完整源码。

## 环境、初始化与构建

环境要求沿用 README：Node >=22.19、pnpm >=10、Windows x64 Rust/MSVC 构建工具。实际使用 Node 24.15.0、Electron 43.6.0，仓库 `+crt-static` 配置构建 Host。

常规新机器源码初始化：`pnpm install --frozen-lockfile`；开发启动：`pnpm dev`；Windows 打包：`pnpm --filter @pi-desktop/desktop dist:win`。

本轮复用工作树已准备的兼容依赖链接、Cargo target 和 electron-builder 缓存，未重新安装依赖或下载大型资源。按上一轮已验证的直接入口调用 TypeScript、electron-vite、Runtime bundler 和 electron-builder；输出目录单独配置为 beta2。打包设置 `publish: never`。用户运行三种包不需要 Node、pnpm 或 Rust，也不依赖开发机器路径。

## 实际验证结果

| 门禁 | 结果 | 日志（相对 cache/release-beta2） |
| --- | --- | --- |
| 工作区 TypeScript、Desktop typecheck、生产构建 | 通过 | `build-js.log` |
| Release 文档预检 | 0.16.1 稳定文档与 beta.2 对齐 | `release-docs.log` |
| 文档结构与中英文规格镜像 | 596 页面、88 对规格通过 | `docs-check-final.log`、`docs-locales.log` |
| 文档站生产构建与页面渲染 | 通过，72.0 秒；保留体积与 gitignore 高亮 fallback 提示 | `docs-build.log` |
| Desktop 全量 | 3481 通过、46 跳过，零失败/取消；3527 tests，284.2 秒 | `desktop-tests.log` |
| Host 全量（最终八并发） | 787 通过，零失败，111.5 秒 | `host-tests-final.log` |
| Shared / i18n / Agent Runtime 全量 | 1174 / 29 / 1238 通过 | `shared-tests.log`、`i18n-tests.log`、`agent-runtime-tests.log` |
| Release Host / sidecar bundle | 通过 | `host-build.log`、`runtime-bundle.log` |
| Biome、style、agent policy、diff check | 109 文件 lint 通过，其余通过 | `lint.log`、`style.log`、`policy.log` |
| Rust fmt / clippy | 通过，保留既有 dead-code / unused-variable 警告 | `fmt.log`、`clippy.log` |
| Coding Actions 专项 Electron E2E | 迁移、CRUD、排序、启用、执行、最新 Skill、missing、损坏、Chat、重启、原生设置保持通过 | `coding-actions-e2e.log` |
| 工程技能设置 Electron E2E | 手动检测、更新、本地修改保护、离线错误通过 | `engineering-settings-e2e.log` |

Host 首次默认并发全量有一项 `tools_abort_during_execution_kills_bash_and_cleans_registry` 失败：其约 1 秒启动 marker 等待没有完成。目标单测复跑通过；八并发完整重跑全部通过。没有修改测试断言或 Bash 实现。首轮失败保留在 `host-tests.log`，不能计为通过。

文档总检首次发现 ADR 0319 的标题、Status、Context、Decision 和索引五项基线缺口；补齐结构并保留已确认决策后全检通过。其他历史 ADR 的可选 Consequences 缺失仅为既有提示。

## 包内真实运行

最终四个入口都运行真实候选 Electron、Host、sidecar 和原生 Skill Loader，使用工作树内隔离数据、Chromium profile、项目及本地确定性 HTTP SSE Provider：

| 入口 | 最终日志 | 截图 / result.json（相对工作树） |
| --- | --- | --- |
| 安装版构建目录 | `packaged-actions-installed.log` | `.pi-desktop-test/packaged-actions-WAdrpt/` |
| NSIS 文件实际解出 payload | `packaged-actions-setup-payload.log` | `.pi-desktop-test/packaged-actions-P6o2I1/` |
| ZIP 文件实际解压目录 | `packaged-actions-zip.log` | `.pi-desktop-test/packaged-actions-9DnEpv/` |
| Portable EXE 启动器 | `packaged-actions-portable-final.log` | `.pi-desktop-test/packaged-actions-R0Vy8k/` |

四个入口完整通过：六项默认动作、旧自定义/null/显式空提示词迁移、真实扩展设置保存、动作名称与提示词重启保留、按钮实际调用 `code-review`、更新 Skill 后加载最新正文、真实 JSON 导入和文件导出、missing Skill 禁用、损坏原文件保持、损坏状态下普通 Chat、显式恢复前逐字节备份、恢复后重启及原生旧设置保持。

应用与 Host 均断言为 `0.16.1-beta.2`，Host protocol 11。安装版和 ZIP 构建目录 Boot Probe 的 800 会话完整返回：最大列表耗时 336.9 / 287.5 ms，Main 最大间隔 79.1 / 87.9 ms；sandbox Preload 与 IPC 通过，见 `packaged-boot.log`。

Portable 首次与其他探针同时派发的命令异常退出（退出码 -1073740791），没有探针结果，未计为通过。单独重跑完整探针正常退出并通过；没有发现本轮相关应用崩溃事件，无法将首次命令异常归因为产品问题。最终截图已查看，中文文案可读；本工作树 Desktop / Host 进程全部退出，未停止用户已有服务。

## 产物与完整性

三种发行包均通过 7-Zip 完整性检查。每种 distribution 的 ASAR 615 项，恰有一个 Host 和一个 sidecar，Matt 技能许可证存在，无禁带依赖测试、声明文件、sourcemap 或原始 renderer 依赖。清单检查将 Windows ASAR 路径归一化为斜杠后匹配。证据：`inventory.log`、`distribution-inventory.json`、`installed-integrity.log`、`zip-integrity.log`、`portable-integrity.log`。

以下路径相对 `apps/desktop/release/beta2/`：

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| `installed/PI-Desktop-Setup-0.16.1-beta.2.exe` | 111845832 | `09af843cf7c54dbe8bc0f58240c6be5ac0e26017d43e0bd91f3acf71749b6b2b` |
| `zip/PI-Desktop-Portable-0.16.1-beta.2.zip` | 155759303 | `7bc2b9b206ae7b704c7d4b9a89a110a086b3ea90acb0ef2f1b653df5154b605d` |
| `portable/PI-Desktop-Portable-0.16.1-beta.2.exe` | 100264283 | `d320dfbc6560f34156694bc0ac09654c829f4aabe6edf09fe00e130454440110` |

`SHA256SUMS.txt` 还覆盖 Setup `.blockmap` 和安装版 `latest.yml`；机器可读清单位于 `cache/release-beta2/artifact-manifest.json`。`latest.yml` 的 beta.2 版本、安装器 SHA512 和大小实际匹配，见 `update-manifest-check.json`。应使用安装版目录的更新清单，不用 ZIP / Portable 的同名清单替换。

NSIS / ZIP 解出 ASAR 与各自构建目录的 SHA256 一致，见 `payload-comparison.json`。未提交候选文件清单与 SHA256 保留在 `source-manifest.json`。

两项 EXE Authenticode 状态均为 `NotSigned`。用户启动：运行 Portable EXE；或解压 ZIP 后运行 `PI-Desktop.exe`。NSIS 仅验收解出 payload，未执行真实安装交互。

## 复验与交付边界

标准验证入口：Shared、i18n、Agent Runtime 的 `pnpm --filter <package> test`；Host `cargo test --locked -p host-core -- --test-threads=8`；Coding Actions `pnpm test:e2e:coding-actions`。Desktop 全量从 `apps/desktop` 运行 `node --test --test-concurrency=4 --test-timeout=180000 test/*.test.mjs`。

包内辅助脚本：`cache/release-beta2/packaged-actions.mjs`。`PI_SKILLS_PACKAGE_DIR` 指向待验目录；Portable 另设 `PI_ACTIONS_EXE` 指向 EXE 启动器。脚本使用独立 profile，并清理本轮应用和本地 Provider。

未覆盖：真实外部模型、Authenticode 签名、干净虚拟机、真实 NSIS 安装/升级/卸载、真实 updater 安装链路、macOS/Linux、远程 pi-host。46 项 Desktop 跳过不计为通过。未做公开资产下载校验，因为尚未发布。

本轮没有提交、推送、创建 PR、合并、打标签、公开发布或替换用户安装。后续交付需要保留该工作树及 ignored 产物；提交时明确选择版本、发布说明和验收文件，再执行授权的远端流程，不能直接以基线提交打 beta.2 标签。
