# ADR extension-shortcut-settings: 快捷按钮扩展设置与原生 PI 设置分离

- Status: Accepted
- Date: 2026-10-06

Previously numbered 0319 in this fork. The stable slug preserves this fork
decision when upstream 0.17.0 introduces its own unrelated ADR 0319.

## Context

2026-10-06 补充：用户新需求将领域收敛为 CodingAction → Skill。独立扩展配置边界保留，持久化动作数组；不再保存按钮位置、Stage、来源锁定或模板内容指纹，不建立第二套 Skill 或 Runtime。详情见阶段一 Skill Launcher 规格。

三轮需求讨论已确认：Matt Skill 按钮作为可编辑预置，全部 Skill 按钮由统一的全局用户配置驱动。快捷按钮页面、配置存储、校验及迁移集中在扩展模块，配置独立于原生 PI 设置，原生设置导航与 Composer 仅保留必要接入点。

将配置继续放入原生设置结构虽可复用现有读写，但会扩大同步上游时的修改与迁移范围。

## Decision

独立存储以带版本的配置承接旧提示词，保留用户改动和可恢复备份。应用继续统一打包发布，首版只迁移快捷按钮及原有提示词设置，其他扩展设置保持当前行为。用户于 2026-10-06 确认整体需求，本决策已接受。

阶段一已按 CodingAction → 原生 Skill → 当前 Session Pi Agent 的边界实现并在 PR #38 合并；当前规格见 [Skill Launcher](../project/skill-launcher-spec.md)。旧按钮位置、分组与来源锁定模型不作为当前实现要求。

## Consequences

本决策降低上游升级耦合；代价是维护独立的持久化与兼容逻辑，并持续验证导航和 Composer 接口兼容。
