# Development Navigator（计划）

> **翻译说明：** 本页对应 [英文源规格](/spec/01-product/development-navigator)。代码、协议字段和标识符保留原文；如有歧义，以英文版本为准。

- 日期：2026-10-11
- 状态：产品方向已接受；这是计划合约，不代表功能已经交付。
- 设计：[第二阶段定位](../../../project/development-navigator-positioning.md)及 [Work Item 设计](../../../project/development-navigator-work-items.md)。

## 产品范围

第二阶段通过可选的项目级 Work Item，在多个普通 Pi 对话之间组织同一个工程目标。仅使用 Matt Pocock Skills；Superpowers/ECC 路由、强制阶段状态机、任务图和新代理运行时不属于初期范围。使用前必须检查 Skill 是否可用以及是否具备调用能力；不可用的能力不能表现为执行成功。

初始界面为独立 Navigator 页面。保留普通未分组对话、原生侧边栏及第一阶段 Coding Action/Skill Launcher，包括 Navigator 禁用时。Work Item 支持用户明确执行创建、重命名、完成、归档、删除和会话关联操作。完成需要用户动作；Session/Turn 结束不会使 Work Item 自动完成。

## 所有权与兼容性

Host Core 拥有持久化 Navigator 元数据。Renderer 状态只是投影。Host 保持项目、会话、聊天记录、权限和队列的权威所有权；Agent Runtime 负责代理执行。复用现有原生 Pi API，保留其工具及执行生命周期。Work Item 引用 Session，不拥有 Session；每个 Session 在其当前逻辑项目内最多属于一个主要 Work Item。禁止静默跨项目关联或扩大权限。

创建对话使用原生会话创建能力，并关联确认后的 ID。若关联失败，保留未分组 Session，允许重试，不重复创建 Session 或重放提示。删除或归档 Work Item 不得删除对话、文件或停止活跃执行。原生 Session 删除后协调不可用关联；原生项目删除遵循现有 Host 策略。

原生 Session 移动至另一项目时，必须在允许点击导航前解绑旧关联，或将其标记为不可用。在读取/导航及变更边界重新验证 Host 所有权；延迟结果不得恢复过期归属。保留原生移动操作的聊天记录、权限和执行语义。

当旧式 `legacy:<path>` 项目分组升级为持久化 UUID 时，依据确认后的逻辑身份，以事务方式协调 Navigator 所有权。保留 Work Item ID、会话关联和产物引用。中断的协调必须安全恢复，不得重复或丢失数据；不能用目录字符串推断代替权威身份。

先评估现有公开插件/work-panel API，再评估独立模块及最小 Host 元数据接口。导入会话插件访问权不等于读取普通对话的权限。生命周期、架构或安全边界变更需要明确架构批准和 ADR。

## 产物交接与确认

代表性路径为：Session A 讨论需求并产生 Spec，Session B 选择该 Spec 执行 `to-tickets`，Session C 选择 Spec/Tickets 执行 `implement`。持久化实际文件/Issue 引用、精确内容哈希或来源修订、出处和可用性，重启后仍可恢复。可读摘要不能代替内容版本。临时 `handoff` 输出只是指引，不是持久化权威状态。

符合条件的本地需求文件复用 [Requirements Confirmation](requirements-confirmation.md)。Navigator 保留 Host 决策 ID、根目录/相对路径、SHA256 和历史修订；确认状态由权威记录及当前内容派生。交接前重新读取并验证新鲜度，拒绝已变更内容或过期决策。不得创建可独立写入的竞争性批准标记，也不得把 Workflow 阶段验收当作内容批准。

尚不支持的来源（包括 Issues）需要单独定义并审查 Host 所有的确认合约，将操作人绑定到精确来源修订后，才能启用已确认交接。Tracker 状态和模型自述不代表批准。已变更、删除、不可访问或未确认输入保持可见，不得静默当作有效已确认输入使用。修订变化时保留历史引用，提示复核派生工作。

只交接用户明确选择且可访问的上下文，不注入所有关联聊天全文。准备草稿和建议但不发送。仍需用户明确 Send。不得自动调度 Skills、提交代码、推进工作流状态或在恢复后重放提示/工具。

## 证据与恢复

区分 Work Item 状态、原生 Session/Turn 结果、产物确认及 Tracker 所有的 Ticket 状态。存在权威 Session/Turn/工具标识时，将执行证据与其关联。模型写出的完成声明只是报告，不是测试、提交或验收证明。如实展示失败、取消、中断及未知结果。持久化元数据，在重新加载/重启时协调缺失引用，不重放执行。

PR #53 的会话级 Engineering Activity 需要独立审查与验收；本合约不证明其已交付，也不证明跨会话 Work Item 已上线。旧 Workflow 记录保留原有语义，不静默映射为 Work Item，也不将其固定阶段强加给此功能。

## 交付与验收

1. 可行性：验证现有扩展/会话导航访问及第一阶段插件 POC；验证通过前不替换原生 Launcher。
2. 可选分组：Work Item 操作，原生会话创建/关联/解绑/打开，未分组访问及持久恢复。
3. 产物交接：跨三个会话的 Spec → Tickets → Implement 路径，使用精确版本及权威确认。
4. 证据：原生结果、审查/测试/提交引用及 Tracker 所有的 Ticket 状态。更多任务图或记忆能力需要证明实际需求。

最低回归覆盖：Navigator 禁用时普通对话可用；多个关联对话保留原始 ID；删除 Work Item 不删除对话；关联失败后重试不重复执行；原生 Session 删除及项目移动；项目隔离和过期异步结果；旧项目身份事务升级及恢复；重启不重放；权威文件确认复用及已变更/过期/不可用输入；不支持来源的批准限制；Spec 修订影响提示且不删除历史；证据与模型自述分离；#46/#53 及旧 Workflow 行为不变。实施 issue 必须在修改代码前，为这些路径确定最低且有效的测试层级。
