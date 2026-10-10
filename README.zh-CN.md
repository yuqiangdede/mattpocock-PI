# mattpocock-PI

mattpocock-PI 是面向软件工程的 PI-Desktop 扩展，集成 [Matt Pocock Skills](https://github.com/mattpocock/skills) 与可配置 Coding Actions。

当前定制版发布线：`0.17.x`；官方源码基线：`0.17.0`。

## 三阶段产品路线

| 阶段 | 定位 | 状态 |
| --- | --- | --- |
| 第一阶段 **Skill Launcher** | 把 Matt Pocock 工程方法变成可点击的 Coding Actions，由当前原生 Pi Agent 执行 | 当前基础 |
| 第二阶段 **Development Navigator** | 以 **Work Item** 为中心组织多个原生 Pi 对话和工程产物；在独立 Navigator 页面实现分组、Spec/Tickets 交接和状态恢复 | 已确定产品方向，增量规划中 |
| 第三阶段 **Engineering Control Surface** | 让需求、设计、实现、测试、Review 在工程层面可查看、选择、比较和回溯 | 远期方向 |

**第二阶段先只使用 Matt Pocock Skills**：`setup-matt-pocock-skills`（工程技能配置）→ `grill-with-docs` / `to-spec`（需求与规格）→ `to-tickets`（任务拆解）→ `implement`（开发）；Bug 排查使用 `diagnosing-bugs`，按需结合 `tdd`、`code-review`、`pr`、`retro` 和 `handoff`。这些是可选工程动作，**不强制固定顺序，也不自动推进**。

Work Item 是可选的开发事项分组：一个事项可以关联多个原生对话；普通对话仍然可独立使用。先做独立 Navigator 页面，不修改 PI-Desktop 原生 Session 生命周期和侧边栏。第二阶段暂不接入 Superpowers / ECC，也不建设跨框架适配层；后续确有不足时再评估。

详细设计：[第二阶段定位](docs/project/development-navigator-positioning.md) · [Work Item 分组和独立 Navigator 页面](docs/project/development-navigator-work-items.md) · [阶段一 Coding Actions 规格](docs/project/skill-launcher-spec.md) · [Navigator 首版 Issue #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46)

[PI-Desktop](https://github.com/vastsa/PI-Desktop)
