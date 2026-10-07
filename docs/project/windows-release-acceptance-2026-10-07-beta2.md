# Windows 0.16.1-beta.2 发布验收（2026-10-07）

用户授权公开发布。发布准备基于 `9498554fc`，本次合入最新 `origin/main` 的 `0700edd90`，包含 PR #39 的确认弹窗修复和 PR #40 的 Matt 技能中文入口与项目周期分类。主工作区的 AGENTS.md、.agents、启动/验证脚本及原始备份保持原状。

## 构建与回归

证据保留在独立工作树的 `cache/release-beta2/publish-*`；最终发行包在 `apps/desktop/release/publish-beta2/`，未覆盖之前的候选包。

| 检查 | 实际结果 |
| --- | --- |
| JS 工作区、Desktop、文档站构建 | 通过 |
| Desktop 类型检查 | 通过 |
| Desktop 全量最终重跑 | 3492 通过、46 跳过、0 失败，265.4 秒 |
| Host 全量（八并发） | 787 通过、0 失败 |
| Shared / i18n / Agent Runtime | 1174 / 29 / 1238 通过 |
| Coding Actions Electron 专项 | 迁移、CRUD、排序、启用、手动发送、原生 Skill、最新正文、配置恢复、Chat、重启通过 |
| Requirements Confirmation Electron 专项 | 确认、内容变化、取消、隔离、历史保留、中文文案、手动操作通过 |
| 文档结构及语言镜像检查 | 596 页面通过 |
| 发布版本文档预检 | 0.16.1 稳定文档与 beta.2 对齐 |
| 三种包的完整性与清单 | 通过，每包一个 Host、一个 sidecar，Matt 技能许可证存在，无禁带依赖内容 |
| 更新清单 | beta.2 版本、Setup SHA512 与大小匹配 |

首次 Desktop 全量因根目录 React 链接指向另一工作树而触发一项 Invalid Hook Call。统一为本工作树 React / React DOM 后，目标八项与全量均通过。首次 Electron 专项因开发 Electron 文件缺失未执行，使用 `D:\cache` 中匹配的 Electron 43.6.0 压缩包补齐后通过。没有修改产品代码或测试断言来规避失败。

旧包内辅助探针检查六个按钮并期待选择后立即执行，已与 PR #39、#40 行为不符。本次探针验证八个入口、可编辑草稿与手动 Send；初次失败日志保留，未计为通过。

## 包内业务与启动

Setup 构建目录完整业务检查通过：旧自定义/null/空提示词迁移、设置保存、重启、手动发送进入原生 Skill、更新正文、JSON 导入导出、missing Skill 禁用、损坏原文件保持、普通 Chat、显式恢复及逐字节备份、原生旧设置保持。

Portable EXE 启动器完整执行相同业务检查并通过，最终重启保持成功。对应 `publish-packaged-actions-portable.log`；所有测试启动的 Desktop / Host 已退出。

安装版和 ZIP 启动探针分别完整返回 800 个会话，Host protocol 11；最大列表耗时 228.6 / 232.9 ms，Main 最大间隔 171.6 / 112.8 ms。Setup 与 ZIP 实际解出 ASAR 的 SHA256 均匹配对应构建目录。截图已人工查看，中文可读。

## 发行文件

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| `PI-Desktop-Setup-0.16.1-beta.2.exe` | 120110108 | `e52f10d791503ed1a22240f4b2dadc514564bcda16c75adeb897c8e7d2563d0c` |
| `PI-Desktop-Portable-0.16.1-beta.2.zip` | 175153334 | `70c6720ac499803cfd86301126f4780dd5d51e0ead812c341787b2bde431ef76` |
| `PI-Desktop-Portable-0.16.1-beta.2.exe` | 107412840 | `ffe8fe133fab7e14bfb51f445e4bab65adc76833544310b0fa474153bb1554e9` |

Setup 比 beta.1 预览候选增长 7.52%，符合 15% 体积预算。EXE Authenticode 均为 `NotSigned`。`SHA256SUMS.txt` 同时覆盖 Setup blockmap 与安装版 latest.yml。

## 验收边界

未覆盖真实外部模型、干净虚拟机、真实 NSIS 安装/升级/卸载、真实 updater 安装链路、macOS/Linux 和远程 pi-host。测试使用隔离数据与本地确定性 Provider，46 项跳过不计为通过。

初始化使用 `pnpm install --frozen-lockfile`；开发启动使用 `pnpm dev`；目标回归入口为 `pnpm --filter @pi-desktop/desktop typecheck`、`pnpm test:e2e:coding-actions` 和 `cargo test --locked -p host-core -- --test-threads=8`。发行用户运行 Portable EXE，或解压 ZIP 后运行 `PI-Desktop.exe`；保留原数据目录。
