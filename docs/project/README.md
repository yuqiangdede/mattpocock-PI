# Project Tracking

- 第二阶段已确定的简化方向（2026-10-10）：[Development Navigator — Matt Pocock Skills + Work Item](development-navigator-positioning.md)。优先独立页面中的对话分组、Spec → Tickets → Implement 交接和状态恢复；暂不集成 Superpowers / ECC。属于产品规划，不等同于 [首版规格 #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46) 或正在审查的 [PR #53](https://github.com/yuqiangdede/mattpocock-PI/pull/53) 已实现范围。

- 第一阶段插件化预验证：[Skill Launcher Plugin Feasibility Gate](skill-launcher-plugin-feasibility.md)。优先验证 Plugin SDK 的 Composer 控件、原生 Skill Catalog、草稿/附件保持与配置迁移；验证成功前保留现有入口。

- Work Item 分组与独立 Navigator 页面：[设计方案（规划中）](development-navigator-work-items.md)，以明确开发目标关联多个原生 Pi 对话，先独立 Navigator 页面，不改变底层会话生命周期。
- 项目强制架构准则：[AGENTS.md：Extension First](../../AGENTS.md)；优先插件 / 独立模块 / 现有 API / 增量数据模型，避免修改 PI-Desktop 核心生命周期。

- 当前编码入口方向：[阶段一 Skill Launcher](skill-launcher-spec.md)。#31–#37 按 CodingAction → 原生 Skill → 当前 Session Pi Agent 重写；旧快捷按钮规格仅保留历史，Development Navigator 留待第二阶段。

- Windows 0.16.1-beta.2：[发布说明](windows-release-notes-0.16.1-beta.2.md)、[最新主分支打包验收](windows-release-acceptance-2026-10-07-beta2.md) 与 [GitHub Release](https://github.com/yuqiangdede/mattpocock-PI/releases/tag/v0.16.1-beta.2)。

- Requirements Confirmation: [confirmed product direction](requirements-confirmation-design.md) and [implementation specification](../spec/01-product/requirements-confirmation.md); shared human approval of specification content, independent of Workflow stage execution; implementation candidate.

- Skill Shortcuts: [confirmed simplification design](skill-shortcuts-interaction-design.md); draft insertion with manual submission, [current specification](../spec/01-product/coding-workbench-free-tasks.md) and [delivery evidence](skill-shortcuts-delivery.md).

- Coding Home: [confirmed interaction design and implementation acceptance scenarios](coding-home-interaction-design.md)
- Coding Workbench: [specification](../spec/01-product/coding-workbench-free-tasks.md), [task-candidate delivery](coding-workbench-delivery.md) and [GitHub issue #14](https://github.com/yuqiangdede/mattpocock-PI/issues/14); release pending.

- Engineering Workflow V0: [published tickets and acceptance coverage](engineering-workflow-v0-tickets.md)
- Engineering Workflow V0: [delivery acceptance and remaining release gates](engineering-workflow-v0-closeout.md)

- Pending release highlights: [Unreleased changes](unreleased.md)

- Historical project board (archived; last refreshed 2026-08-11 for the 0.5.x line): [`BOARD.md`](BOARD.md)
- Documentation/code alignment audit: [2026-07-30 audit](2026-07-30-docs-code-audit.md)
- Plan implementation plan: [`plan-mode-implementation-plan.md`](plan-mode-implementation-plan.md)
- Pi 1.0.1 adoption: [`pi-101-adoption.md`](pi-101-adoption.md)
- GitHub Issues + Milestones: repository Issues page
- GitHub Projects: create after adding the `project` token scope

- 官方稳定版更新与定制维护：[`upstream-updates.md`](upstream-updates.md)
- 官方 0.16.1 升级知识与历史验收：[`upstream-0.16.1-retrospective.md`](upstream-0.16.1-retrospective.md)
- Official 0.17.0 source integration: [`upstream-0.17.0.md`](upstream-0.17.0.md)
