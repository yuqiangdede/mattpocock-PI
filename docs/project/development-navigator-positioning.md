# 第二阶段 Development Navigator — Matt Pocock Skills + Work Item

> 更新日期：2026-10-10  
> 状态：已确定的第二阶段产品方向，**不是功能已实现或完成验收的声明**。  
> 项目：[mattpocock-PI](https://github.com/yuqiangdede/mattpocock-PI)  
> 相关设计：[Work Item 分组与独立 Navigator 页面](development-navigator-work-items.md)

## 一、产品定位：在一套 Skills 之上组织持续开发

**第二阶段优先只使用 Matt Pocock Skills，让 Work Item 成为跨对话开发的稳定组织单位。**

阶段一 Skill Launcher 解决“如何方便地发起一次工程 Skill 操作”；阶段二 Development Navigator 解决“围绕同一个开发目标，如何在多个原生 Pi 对话中继续工作、找到文档和恢复进度”。

- **单一方法体系**：当前阶段默认只集成和组织 [Matt Pocock Skills](https://github.com/mattpocock/skills)，不接入 Superpowers / ECC 作为必需或默认执行框架。
- **以 Work Item 为中心**：一个明确需求、Bug 或重构目标对应一个可选 Work Item，关联多个原生 Pi Session；无需 AI 根据聊天记录猜测任务归属。
- **独立 Navigator 页面优先**：先实现 Work Item 分组、会话导航、工程产物引用与恢复；不先修改原生侧边栏或开发通用任务图编辑器。
- **Pi Runtime 保持原生**：模型、会话、工具权限、命令执行、Git、队列和恢复继续由既有 Pi / PI-Desktop 能力负责。
- **不强制流程**：可直接进入诊断、审查、实现或讨论；已产生的 Spec/Tickets 可在后续对话继续使用，不能因为一个 Turn 结束就判断工程目标完成。
- **扩展优先**：遵循 [AGENTS.md](../../AGENTS.md) 中的强制原则，优先独立模块、插件、现有 API 和增量数据模型，不为工作流组织改动 PI-Desktop 核心生命周期。

第二阶段的差异化不是提供更多 Skill 按钮，而是**跨会话仍然稳定存在的开发事项和工程上下文**。

## 二、统一的 Matt Pocock 能力组合

| 工程活动 | 首选 Matt Pocock Skills | 使用方式与边界 |
| --- | --- | --- |
| 工程 Skills 初始化 | `setup-matt-pocock-skills` | 按需配置 issue tracker、triage 标签和领域文档；**不是**创建 Pi 项目或替代 Host 项目初始化 |
| 需求分析与决策 | `grill-with-docs` | 通过讨论明确范围、约束和术语；可以多轮继续 |
| 规格文档 | `to-spec` | 由已讨论内容整理 Spec，按实际 issue tracker 配置发布；将结果登记到 Work Item |
| 任务拆解 | `to-tickets` | 由 Spec/讨论产生具备阻塞依赖的 tickets；不等同于 Superpowers 的 `writing-plans` |
| 日常开发 | `implement` | 基于选定 Spec/Tickets 执行，按需结合 `tdd`、测试和 `code-review`；提交仍受项目 Git 与权限规则约束 |
| 大型需求实现（后续评估） | `implement-spec` | 涉及 subagents、多分支/worktrees、合并；先验证与本仓库隔离规则及 Pi 能力是否兼容，**不作为 MVP 默认入口** |
| Bug 排查 | `diagnosing-bugs` | 任何时刻按需使用；复现、根因、修复、回归 |
| TDD 与代码审查 | `tdd`、`code-review` | 作为工程质量能力按需调用；是否由用户/模型调用取决于 Skill 的真实调用限制 |
| PR 与复盘 | `pr`、`retro` | PR 说明、开发过程复盘；真实提交/PR 操作遵循原生 Git 和项目规则 |
| 跨会话辅助交接 | `handoff` | 生成精简的上下文指引；不能把临时 handoff 文件当作持久 Work Item 状态 |

运行时必须检查目标 Skill 是否真实安装、启用以及底层 Pi 是否能以所需方式调用；不可用时明确反馈，不自动切换到另一套框架或伪造执行成功。

**不做的事**：第二阶段暂不建设 Superpowers / ECC 安装、Hooks、Memory、跨框架路由、产物转换或兼容层。未来若发现 Matt 某项能力不足，再以明确需求和独立验证为前提评估，而非提前增加架构复杂度。

## 三、Work Item：开发事项，而非另一套会话系统

一个 Work Item 专注一件事，可以关联多个既有 Pi Session：

```text
Project (existing Pi project identity)
  |-- Native Session A
  |-- Native Session B
  |-- Native Session C
  |
  +-- Navigator / Work Items (additional view)
       +-- Work Item: user login
            |-- reference -> Session A (grill-with-docs / to-spec)
            |-- reference -> Session B (to-tickets)
            |-- reference -> Session C (implement)
            +-- artifact references: Spec, Tickets, Review
```

MVP 的归属规则：

1. 在 Work Item 内新建对话：仍由原生 Pi 创建 Session，拿到确认的 Session ID 后关联。
2. 在普通入口新建对话：保持未分组，仍能自由使用 Skills。
3. 旧对话加入、移动或移出 Work Item：由用户明确操作；AI 仅建议，不能自行移动或拆分聊天历史。
4. 一个 Session 在 MVP 中最多属于同一 Project 下的一个**主要 Work Item**，一个 Work Item 可以关联多个 Sessions。
5. 删除、归档、完成 Work Item 不删除原生会话，也不结束正在运行的 Pi 任务；原生会话删除和项目删除沿用原本的 Host 生命周期。

**Work Item 是对原生 Session 的引用与附加工程元数据，不是 Session 的新所有者。**

详情及错误、权限、恢复、交互约束见 [Work Item 设计](development-navigator-work-items.md)。

## 四、独立 Navigator 页面与 MVP

优先在独立 Navigator 页面实现可选工作区，不先改 PI-Desktop 原生侧边栏。

| 区域 | 首版内容 | 非首版内容 |
| --- | --- | --- |
| Work Item 列表 | 创建、重命名、归档、选择、项目内查询 | AI 自动聚类 |
| 对话区域 | 从 Work Item 新建原生会话；关联/移除既有会话；打开原生聊天 | 合并聊天消息或重写 Session 存储 |
| 产物区域 | 用户选择并登记 Spec、Tickets、Review 等路径/Issue 引用；展示来源与版本 | 全自动扫描推断“某 Skill 生成了某文件” |
| 进度区域 | 最近活动、已关联产物、待确认事项、最近会话状态 | 强制阶段状态机、复杂图形编辑 |
| 普通对话 | 未分组会话继续可用 | 强制所有对话归组 |

先验证现有 Plugin SDK / Work Panel 和原生 Session API 能否安全地完成会话发现、打开及关联；若插件 API 不足，则采用独立 Navigator 功能模块加最小 Host-owned 接口，不扩张会话权限边界。

## 五、跨对话文档交接：Spec → Tickets → Implement

**第一条必须跑通的真实链路**：

1. 会话 A 通过 `grill-with-docs` 讨论需求，`to-spec` 形成 Spec，用户登记并确认其确切来源与版本。
2. 会话 B 在同一 Work Item 中选择该 Spec，使用 `to-tickets` 生成任务文件或 issue tracker 记录；关联 tickets 和真实依赖。
3. 会话 C 选择指定 Spec/Tickets，使用 `implement` 开发，按需调用 `tdd` / `code-review`。
4. 关闭并重启应用，Work Item 仍能找到上述 Sessions、文档版本和已知状态，用户可以继续工作。

产物可以存于项目 Markdown、Issue tracker 或已有 Host Plan 路径；Navigator **记录引用**，不强行要求 Matt 输出一种新的专用格式。首版至少记录：类型、Work Item、实际来源（文件或 Issue URL / ID）、内容版本/摘要、登记人/执行 ID（如有）、确认状态、可用性。

- 交接前核验文件是否存在、版本是否匹配、用户是否确认；失效或不可访问时提示，不静默用旧内容。
- `to-tickets` 的 ticket/阻塞关系是任务领域的来源之一；第一版不需要再维护一份互相竞争的完整任务状态机。
- `handoff` 可作为可选总结，但它默认写临时目录，**不可代替**持久化的 Spec/Tickets 引用、Work Item 归属和 Host 状态。
- 同一个 Work Item **不意味着把所有会话聊天全文发送给新模型**；用户选择实际需要的上下文并继续遵循 Pi 文件、工具权限。
- 所有可执行操作仍需用户明确触发；准备好 Skill 草稿、找到产物或生成建议都不能自动提交请求。

## 六、状态恢复与执行证据：只记录可证明的事实

| 状态层 | 所属权威 | 首版呈现 |
| --- | --- | --- |
| Work Item 状态 | Navigator 在 Host 的持久化元数据 | 活跃、完成、归档；完成需要明确用户动作 |
| Session / Turn 状态 | 原生 Pi / Host | 实际等待、执行、结束、失败、取消或未知 |
| Artifact 状态 | 可验证的文件/Issue 内容与人工确认 | 待确认、已确认、已变更、不可用 |
| Ticket 状态（后续） | 配置的 issue tracker 或用户明确管理的数据 | 引用真实状态，不与 Issue tracker 争夺权威 |

- Session/Turn 成功结束不意味着 Work Item 完成、Spec 被批准或测试已通过。
- Agent 文本自述属于模型报告，不等于实际测试、Git commit 或用户验收；执行证据需关联原生 sessionId/turnId、工具结果与其他可核验来源。
- 应用重启时恢复 Work Item 关联与持久化引用；未完成执行标记中断/不明，**不自动重放工具调用或提示**。
- #53 中的会话级 Engineering Activity 只用于观察，不能直接当成跨会话 Work Item。旧 V0 Workflow Run 可评估复用 Host 持久化/恢复机制，但不能继承固定六阶段锁定规则。
- 出现 Spec 更新时，只提示关联 Tickets/实现结果可能需要复核；不删除历史，不擅自覆盖用户已确认的内容。

## 七、分阶段交付与验收

| 顺序 | 交付 | 必须验证 |
| --- | --- | --- |
| 0. 适配评估 | 验证插件 / Navigator / Host 能否安全列出和打开原生会话 | 不越权、不改 Runtime、不伪造新 API |
| 1. Work Item MVP | 可选分组、会话创建/关联/解绑、独立 Navigator 页面、持久化恢复 | 普通对话不受影响；删除分组不删除会话；跨项目不可偷挂 |
| 2. Matt 产物交接 | Spec → Tickets → Implement，明确来源、版本、确认和不可用状态 | 跨三个原生会话可继续，不需复制整段聊天；失效输入不会静默继续 |
| 3. 轻量任务与证据 | 引用原生 Tickets 状态、Pi Turn、测试/Review/Commit 的可验证证据 | 任务状态与执行状态分离，失败/中断/未知不会被标为完成 |
| 4. 可选增强 | 需求变更影响、任务图、审查回溯、长期记忆 | 基于真实使用再做，不是阶段二进入门槛 |

MVP 不建设完整工作流引擎、跨 Skills 框架调度、独立 Agent Runtime、强制阶段顺序、复杂任务图画布或自动记忆学习。

## 八、与既有能力和第三阶段的关系

- **阶段一 Skill Launcher**：保留用户按需点击 Coding Action → 原生 Pi Skill 草稿 → 手动发送的路径；与是否存在 Work Item 无关。
- **[Issue #46：Navigator 首版](https://github.com/yuqiangdede/mattpocock-PI/issues/46)**：会话级活动和分析的既定范围不变。
- **[PR #53：首版实现](https://github.com/yuqiangdede/mattpocock-PI/pull/53)**：单独 Review 与验收；本 PR 不追加 Work Item 分组的代码范围，也不追认功能已上线。
- **第三阶段 Engineering Control Surface**：在实测需要时再加强跨事项决策、完整工程审计、任务图及多框架扩展，而不是第二阶段一开始就做平台型框架编排。

**衡量第二阶段是否成功：同一个 Work Item 下的多个 Pi 对话，是否能稳定找到同一份已确认的 Spec/Tickets、理解当前开发进度，并安全继续工作。**
