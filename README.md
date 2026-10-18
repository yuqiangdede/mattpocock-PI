# mattpocock-PI

mattpocock-PI 是面向软件工程的 PI-Desktop 扩展，集成 [Matt Pocock Skills](https://github.com/mattpocock/skills) 与可配置 Coding Actions。

当前定制版发布线：`0.21.x`；官方源码基线：`0.21.0-beta.3`。

## 当前功能范围 (Current scope)

Skill Launcher provides configurable Coding Actions using Matt Pocock Skills and the current native Pi Agent. Actions prepare editable drafts; execution requires explicit Send.

- [Skill Launcher specification](docs/project/skill-launcher-spec.md)
- [PI-Desktop](https://github.com/vastsa/PI-Desktop)

## 上游依赖与基线版本 (Upstream Dependencies & Baseline Versions)

本项目基于开源生态构建，包含官方宿主、Agent 核心引擎、内置技能库及第三方工具规范。下表记录各上游的 Git 仓库路径、当前接入版本/Commit 及更新维护方式：

### 1. 核心底座与宿主应用 (Core Host & Runtime Engine)

| 依赖项 | Git 仓库路径 | 当前接入版本 / Commit | 作用说明 | 更新方式 / 脚本 |
| :--- | :--- | :--- | :--- | :--- |
| **PI-Desktop** (宿主主干) | `https://github.com/vastsa/PI-Desktop.git` | `v0.21.0-beta.3`<br>(`5e1655893ce6181b3e9324b0f49b52f1c7f79762`) | 本仓库的官方基线源码，提供 Electron 宿主架构与原生插件机制 | `node scripts/update-upstream.mjs --version <new_version>`<br>(基线记录：[`packages/shared/src/upstream.ts`](packages/shared/src/upstream.ts)) |
| **pi** (底层 Agent 引擎) | `https://github.com/earendil-works/pi.git`<br>*(原 `badlogic/pi-mono`)* | `v1.1.0` | 提供底层 Agent 执行循环与核心依赖包（`@earendil-works/pi-agent-core`、`pi-ai`、`pi-coding-agent` 等） | 本地 patch 机制（`patches/@earendil-works__*.patch`）<br>检查脚本：`node scripts/check-pi-dependencies.mjs` |

### 2. 内置技能与工具库 (Bundled Skills & Tools)

| 依赖项 | Git 仓库路径 | 当前接入版本 / Commit | 作用说明 | 存储路径 / 更新方式 |
| :--- | :--- | :--- | :--- | :--- |
| **Matt Pocock Skills** | `https://github.com/mattpocock/skills.git` | `d81f3a183412e71a5b1e84ca21bc1a35eea03a60` | 工程技能套件（tdd、code-review、codebase-design、grilling 等） | 路径：[`apps/desktop/resources/skills/matt/`](apps/desktop/resources/skills/matt/)<br>更新脚本：`node scripts/update-matt-skills.mjs` |
| **grill-with-ui** | `https://github.com/jasonku09/grill-with-ui.git` | `c8f699d3dd99eaf7af168e21acb355184a354f1b` | 本地浏览器端可视化需求讨论与设计访谈技能 | 路径：[`apps/desktop/resources/skills/matt/grill-with-ui/`](apps/desktop/resources/skills/matt/grill-with-ui/)<br>说明：[`docs/guide/bundled-grill-with-ui.md`](docs/guide/bundled-grill-with-ui.md) |
| **diagram-design** | `https://github.com/cathrynlavery/diagram-design.git` | 跟踪规范 | 总体设计（`overall-design`）与概要设计（`outline-design`）的强制制图能力 | 规范路径：[`apps/desktop/resources/skills/outline-design/references/diagrams.md`](apps/desktop/resources/skills/outline-design/references/diagrams.md) 与 [`apps/desktop/resources/skills/overall-design/references/diagrams.md`](apps/desktop/resources/skills/overall-design/references/diagrams.md) |

### 3. 插件中心与官方生态 (Plugin Ecosystem)

| 依赖项 | Git 仓库路径 | 作用说明 | 校验 / 维护入口 |
| :--- | :--- | :--- | :--- |
| **PI-Desktop 插件源** | `https://github.com/vastsa/pi-desktop-plugins.git` | 官方插件市场主频道（Official Channel） | `node scripts/check-marketplace-catalog.mjs` |
| **PI-Desktop 插件管理中心** | `https://github.com/vastsa/pi-plugin-center.git` | 插件 Registry 管理与审查目录 | 遵循 [`docs/spec/07-plugins/`](docs/spec/07-plugins/) 规范 |
| **AIUO-Net 插件备用源** | `https://github.com/AIUO-Net/pi-desktop-plugins.git` | 官方指定的 GitHub 备用插件发布源 | 参见 [ADR 0276](docs/adr/0276-official-plugin-channel-and-backup-channels.md) |

### 4. 技能设计与转换流程参考 (Design & Implementation References)

| 借鉴项目 | Git 仓库路径 | 参考用途 |
| :--- | :--- | :--- |
| **Anthropic Skills** | `https://github.com/anthropics/skills.git` | `requirements-spec` 需求说明书评审机制参考了 `doc-coauthoring` |
| **HumanLayer Skills** | `https://github.com/humanlayer/skills.git` | `matt/pr` 技能中 diff 视觉表达清单参考了 `show-me` |
| **Awesome Copilot** | `https://github.com/github/awesome-copilot.git` | `markdown-to-docx` 相对路径图片与排版借鉴 `skills/md-to-docx` |
| **Agent Skills** | `https://github.com/desmondc9/agent-skills.git` | `markdown-to-docx` 的 Pandoc + Mermaid 分阶段流水线设计 |
| **piwin** | `https://github.com/mimimaster/piwin.git` | 实时语音（Live Voice）与 Codex/Gemini/OpenAI Realtime 双工会话适配设计参考（`docs/implementation/live-voice-evidence.md`） |
| **Opencode DCP** | `https://github.com/Opencode-DCP/opencode-dynamic-context-pruning.git` | 轮次边界上下文检查点与压缩机制参考（[ADR 0030](docs/adr/0030-turn-boundary-context-checkpoint-compaction.md)） |
