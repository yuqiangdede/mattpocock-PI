# 阶段一 Skill Launcher Windows 候选包验收

日期：2026-10-06。结论：本记录中的 Windows 本地打包验收通过。

## 候选与范围

- 基线：`origin/main` / `9498554fc1e770fc3539c28a8857d2945eadcfec`，PR #38 合并提交；验收结束前重新 fetch，远端基线未变化。
- 独立工作树：`skill-launcher-win-acceptance/mattpocock-PI`；分支：`test/skill-launcher-win-acceptance`。创建时干净。
- 没有修改产品源码、版本号、锁文件或主目录已有修改。本次唯一受 Git 跟踪的新文件是本验收记录。
- 应用版本保持 `0.16.1-beta.1`，这些文件是包含 PR #38 的本地候选包，**与已公开发布的同名 beta.1 文件内容不同**。不应覆盖公开资产或直接作为同版本更新发布。
- 本轮没有提交、推送、创建 PR、打标签、发布资产或替换用户安装。

成功标准：依赖编译、静态检查及完整相关套件通过；三种 Windows 包完整且清单合规；使用候选包真实运行六项默认动作、配置迁移、保存、原生 Skill 调用、最新 Skill 内容、JSON 便携配置、缺失诊断、损坏恢复及重启保留。测试数据与最终验收的 Chromium profile 位于工作树内。

## 环境与初始化

源码要求沿用 README：Node >=22.19、pnpm >=10、Windows x64 Rust/MSVC 构建工具。本轮 Node 24.15.0、Electron 43.6.0；Rust 构建使用仓库 `+crt-static` 配置。

正常新机器源码初始化与启动：

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

本轮按仓库 E2E 环境复用规则，链接现有兼容依赖并复用 Cargo target 和已有 electron-builder 工具缓存；所有配置、测试数据、日志、解包内容和产物保留在独立工作树。没有下载新的大型依赖。运行发布包不需要 Node、pnpm 或 Rust。

pnpm 在复用布局下先报 task-state 链接保护错误，改为工作树内真实 mutable state 后又自动触发依赖初始化；本轮停止该初始化。随后直接调用项目已有 TypeScript、electron-vite、Runtime bundler 和 electron-builder 的等价入口完成构建，未以 pnpm 包装命令的成功冒充结果。

辅助入口保留在 `cache/release-acceptance/`：`setup-deps.cjs`、`build-js.cjs`、`build-windows.cjs`、`packaged-actions.mjs`、`packaged-boot.mjs`、`package-inventory.cjs`、`distribution-inventory.cjs`。使用这些入口需要已存在且兼容的项目依赖；独立工作树及证据应保留。

## 构建与检查

| 门禁 | 实际结果 | 证据（相对工作树） |
| --- | --- | --- |
| Release 文档预检 | 与稳定文档版本 0.16.1 对齐 | `cache/release-acceptance/release-docs.log` |
| 工作区依赖 TypeScript、Desktop typecheck、生产构建 | 通过 | `cache/release-acceptance/build-js.log` |
| Rust Release Host、Agent sidecar bundle | 通过 | `cache/release-acceptance/host-build.log`、`runtime-bundle.log` |
| Desktop 全量 | 3481 通过、46 跳过，零失败/取消；3527 tests，220.0 秒 | `cache/release-acceptance/desktop-tests-accepted.log` |
| Host 全量 | 787 通过，零失败 | `cache/release-acceptance/host-tests.log` |
| Shared 全量 | 1174 通过 | `cache/release-acceptance/shared-tests.log` |
| i18n 全量 | 29 通过 | `cache/release-acceptance/i18n-tests.log` |
| Agent Runtime 全量 | 1238 通过、93 文件通过 | `cache/release-acceptance/runtime-tests.log` |
| Biome、style tokens、agent policy、diff check | 109 文件 lint 通过；其余检查通过 | `cache/release-acceptance/lint.log`、`style.log`、`policy.log` |
| Rust fmt / clippy | 通过，保留既有 dead-code / unused-variable 警告 | `cache/release-acceptance/fmt.log`、`clippy.log` |
| Coding Actions 专项 Electron E2E | 迁移、CRUD、排序、enabled、执行、最新 Skill、missing、损坏、Chat、持久化、原生设置保持通过 | `cache/release-acceptance/coding-actions-e2e.log` |
| 工程技能设置 Electron E2E | manual、detected、updated、preserved、offline 全通过 | `cache/release-acceptance/engineering-settings-e2e.log` |

完整 Desktop 首两轮有 6 个 UI Slots Lab renderer 夹具失败，分别缺少从 `examples/plugins` 可解析的 React / React DOM。补齐工作树根 `node_modules` 下的依赖链接后，目标 8/8 通过，随后完整重跑得到以上最终结果；未修改产品代码或测试断言。旧失败日志保留，不作为通过依据。

## 包内行为验收

使用真实候选 Electron / Host / Agent sidecar / 原生 Skill Loader，Provider 为本地确定性 HTTP SSE 测试服务，未访问真实模型。

- 安装版构建目录、**NSIS 文件实际解出的 payload**、**ZIP 文件实际解压目录**以及 **Portable EXE 启动器**均通过完整 Actions 行为验收。
- 六项默认动作可见：需求讨论、固化需求、技术设计、拆分任务、实现、代码审查；没有新增强制阶段导航。
- 旧 `engineeringShortcutPrompts` 的自定义、null、显式空字符串正确迁移；原字段保持。
- 真实扩展设置修改名称和可选提示词，显式保存；重启后使用已保存内容。
- 点击代码审查动作，实际 Provider 请求包含动作提示词，随后原生 Skill 工具载入 `code-review` 正文并完成响应。
- 更新当前 Skill 内容后，无需重存 Action，下一次执行载入新正文。
- 真实设置 JSON 导入后重启保留；缺失 Skill 的动作保留并禁用。安装版及 NSIS 解出的 payload 还完成真实文件 JSON 导出，并逐字段比较导出内容。
- 将隔离配置替换为无效 JSON 后，应用使用内存默认动作，原文件保持；普通 Chat 仍完成真实请求。
- 通过真实设置显式恢复默认，损坏文件逐字节进入备份；再次重启保留有效默认配置。
- 原生设置中的旧提示词保持，未更改用户真实数据目录。

最终证据：

| 启动入口 | 日志 | 截图 / 结果目录 |
| --- | --- | --- |
| 安装版构建目录 | `cache/release-acceptance/packaged-actions-installed-final.log` | `.pi-desktop-test/packaged-actions-fAxXYW/` |
| NSIS 实际 payload | `cache/release-acceptance/packaged-actions-setup-payload.log` | `.pi-desktop-test/packaged-actions-SMW7op/` |
| ZIP 实际解压目录 | `cache/release-acceptance/packaged-actions-zip-extracted.log` | `.pi-desktop-test/packaged-actions-gymq88/` |
| Portable 启动器 | `cache/release-acceptance/packaged-actions-portable.log` | `.pi-desktop-test/packaged-actions-dPeMK0/` |

截图已查看，中文设置文案可读。早期辅助探针误启用 CAPTURE 自动页面巡检，干扰导航；已关闭。早期探针没有显式传入 Chromium profile 参数，最终以上有效验收均增加工作树内 `--user-data-dir` 后重跑。Portable 的退出确认曾使测试子进程残留；已清理本轮拥有的进程并修正退出方式，最后各验收进程正常退出，本工作树无残留 Desktop / Host 进程。未停止用户已有服务。

安装版与 ZIP 构建目录 Boot Probe 均通过 sandbox Preload / IPC、版本及 Host protocol 11，800 会话全部返回；列表最大耗时分别 310.3 / 311.0 ms，Main 最大间隔 135.2 / 232.8 ms。证据：`cache/release-acceptance/packaged-boot.log`。

## 包清单与产物

三种包均经 7-Zip 完整性检查通过。每种 distribution 的 ASAR 中为 615 项；资源清单恰有一个 Host 和一个 sidecar，Matt 技能许可证存在，无禁带依赖测试、声明文件、sourcemap 或原始 renderer 依赖。证据：`package-inventory.json`、`distribution-inventory.json` 与三份 `*.integrity.log`。

NSIS 解出 payload 的 ASAR SHA256 与安装版构建目录一致；ZIP 解出的 ASAR 与 ZIP 构建目录一致，详见 `cache/release-acceptance/payload-comparison.json`。

候选文件均位于 `apps/desktop/release/`：

| 文件（相对 release） | 字节 | SHA256 |
| --- | ---: | --- |
| `installed/PI-Desktop-Setup-0.16.1-beta.1.exe` | 111844697 | `e2c9b299a2be470128019c0ba35a2bb4a437acfce9ebd14f14a40171f0a22ff0` |
| `zip/PI-Desktop-Portable-0.16.1-beta.1.zip` | 155761375 | `9413e3afc4879e418f53cb43eff11ff6f62f01905522a681d2258d5352674cc8` |
| `portable/PI-Desktop-Portable-0.16.1-beta.1.exe` | 100261491 | `c4bd1598e7223e55d40d2ac4cda676b1d7cd0411c82d32cb3ffaba0a31f8d6ce` |

两项 EXE 的 Authenticode 状态均为 `NotSigned`；ZIP 不适用 EXE 签名。机器可读清单：`cache/release-acceptance/artifact-manifest.json`；校验文件：`apps/desktop/release/SHA256SUMS-candidate.txt`。

用户启动方式：运行 Portable EXE，或解压 ZIP 后运行 `PI-Desktop.exe`。Setup 的实际安装交互未在本轮执行，不能以 payload 验收代替安装验证。

## 复验入口与边界

正常工作区的标准入口：

```powershell
pnpm --filter @pi-desktop/desktop build:deps
pnpm --filter @pi-desktop/desktop typecheck
pnpm --filter @pi-desktop/desktop dist:win
pnpm --filter @pi-desktop/shared test
pnpm --filter @pi-desktop/i18n test
pnpm --filter @pi-desktop/agent-runtime test
cargo test --locked -p host-core
pnpm test:e2e:coding-actions
```

Desktop 全量须从 `apps/desktop` 运行：

```powershell
node --test --test-concurrency=4 --test-timeout=180000 test/*.test.mjs
```

包内复验从工作树根运行辅助脚本，`PI_SKILLS_PACKAGE_DIR` 指向待验目录，Portable 另用 `PI_ACTIONS_EXE` 指向启动器。测试脚本创建独立数据、profile、项目与本地 Provider，输出结果、截图和原始失败信息。

未覆盖：真实外部模型联网、Authenticode 签名、干净虚拟机、真实 NSIS 安装/升级/卸载、真实 updater 安装链路、macOS/Linux 和远程 pi-host。没有发布或公共下载校验。46 项 Desktop 跳过保持原测试声明，不能计为通过。

后续若授权发布，需先确定新候选版本、更新版本与发布说明，再按发布门禁验收并交付；本次同版本候选不等于新的公开发行版。
