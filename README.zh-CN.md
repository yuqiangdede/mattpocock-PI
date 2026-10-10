# mattpocock-PI

mattpocock-PI 是面向软件工程的 PI-Desktop 扩展，集成 [Matt Pocock Skills](https://github.com/mattpocock/skills) 与可配置 Coding Actions。

当前定制版发布线：`0.17.x`；官方源码基线：`0.17.0`。

## 三阶段产品路线

| 阶段 | 定位 | 状态 |
| --- | --- | --- |
| 第一阶段 **Skill Launcher** | 把常用工程方法变成可点击的 Coding Actions，由当前 Pi Agent 执行 | 当前基础 |
| 第二阶段 **Development Navigator** | 从按钮集合升级为**开发任务与运行状态的可视化控制面**；可靠传递跨 Skill 的 Spec / Plan / 执行产物，组织动态任务图、进度、Review 和排错 | 产品规划、增量推进 |
| 第三阶段 **Engineering Control Surface** | 让需求、设计、实现、测试、Review 在工程层面可查看、选择、比较和回溯 | 远期方向 |

第二阶段的典型组合：**需求决策**（Matt：`grill-with-docs` / `to-spec`）→ **实施计划**（Superpowers：`writing-plans`）→ **执行开发**（Superpowers：`executing-plans` / `subagent-driven-development`），并允许在任何节点进入代码审查、Bug 排查或需求变更；**不强制固定顺序，也不自动推进**。上述 Superpowers 组合是规划方向，不代表当前已内置或完成集成。

详细设计：[第二阶段定位与交接路线](docs/project/development-navigator-positioning.md) · [阶段一 Coding Actions 规格](docs/project/skill-launcher-spec.md) · [Navigator 首版 Issue #46](https://github.com/yuqiangdede/mattpocock-PI/issues/46)

[PI-Desktop](https://github.com/vastsa/PI-Desktop)
