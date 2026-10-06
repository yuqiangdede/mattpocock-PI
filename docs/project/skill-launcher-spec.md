# 阶段一：Skill Launcher

状态：2026-10-06 用户的新需求为当前基准，替代旧快捷按钮规格和 #31–#37 的 Workflow / Stage 设计。

## 当前实现差异

- 远程工单曾要求 Workflow → Stage → Action → Skill，但未合并实现主要还是快捷按钮配置。
- 未合并实现持久化按钮位置、更多分组、来源锁定与预置内容指纹；这些不属于阶段一领域。
- 来源限定别名侵入 Agent 调用路径，建立第二套来源选择行为；新方案恢复原生 Catalog、Loader 和 Runtime。
- origin/main 已有独立工程 Workflow 功能。本次不删除其用户数据和历史代码，也不让 Coding Actions 依赖该功能。

## 核心模型与边界

领域仅为 CodingAction：id、label、skillId、enabled、order、可选 prompt / description / icon。持久化使用带 schemaVersion 的 actions 数组包装。

CodingActionRegistry 负责默认动作、查询、排序与启用状态。它不保存 Skill 正文，不判断项目状态、产物新旧、阶段完成或下一步。

默认只提供需求讨论、固化需求、技术设计、拆分任务、实现、代码审查六个编码动作。使用仓库实际 Skill id；技术设计绑定 codebase-design，需求讨论绑定 grill-with-docs。不根据全部 Skill Catalog 自动生成动作。

## 调用链

```text
页面操作(actionId)
  → executeCodingAction(actionId, 当前 Project / Session Context)
  → CodingActionRegistry 查询与 enabled 检查
  → 原生 Composer Skill Catalog 的有效条目
  → 原生 sendPrompt / Prompt IPC
  → 原生 Skill Loader 获取最新 SKILL.md
  → 当前 Session 的 Pi Agent / Skill Tool
```

点击动作提交可选提示词与当前输入框中的请求及附件；使用正常发送、队列、模型、权限和 Plan/Goal 控制。接受提交后沿用原生草稿清理，失败保留草稿。异步解析期间切换项目或会话时取消本次提交，避免投递到错误会话。

Skill Resolver 消费原生 Catalog 已合并的结果，不自行规定项目、用户、内置或插件优先级，不引入来源限定别名。Skill 更新无需保存 Action。

## 界面与配置

复用扩展设置中的一个设置卡片，支持创建、删除、编辑 label / skillId / enabled / order / optional prompt，以及可选说明。显式保存与取消，未保存离开提示。诊断重试读取也要确认放弃未保存修改，取消确认保留草稿；读取、保存、重置和导入共用同步互斥，避免 React 尚未更新禁用状态时启动并发操作。界面文字沿用现有 i18n；用户保存的 label / prompt 原文不随语言切换改写，默认标签仅在初始化、恢复默认或损坏回退时按当前语言生成。

Renderer 按 Registry 顺序将前六项显示为主要动作，其余放入 More Actions。此规则只属于视图，不持久化位置、分组或坐标。

Renderer 通过既有 Preload IPC 访问 Main；Main 在当前应用数据目录独立持久化扩展配置。配置写入先备份再原子替换。配置损坏时回退内存默认值并显示诊断，原文件保留，普通 Chat / Agent 仍可使用。覆盖损坏数据和重置需要用户明确确认。

保留轻量 Actions JSON 导入导出作为数据便携能力，校验后明确整体替换，不导出 Provider 或原生运行设置。它不表达 Workflow DSL。

## 兼容

- engineeringShortcutPrompts 迁移到对应 Action.prompt，自定义、null 和显式空值保留。
- 旧主快捷动作转换为对应 Coding Action；仅有自定义提示词的辅助动作继续保留。
- 未合并旧 skill-shortcuts.json 若已被使用，迁移名称、Skill id、启用、提示词、备注和原顺序；丢弃位置、分组和来源锁定语义并提示来源策略变化。原文件及迁移备份保留。
- 新配置存在时不重复迁移。显式空 actions 数组保持为空，不自动补齐或复活用户删除的动作。
- 原生工程 Skill 检测/更新功能保留。历史工程 Workflow 与需求确认继续作为独立功能，不成为 Actions 的前置条件。

## 验收

1. 默认六项动作可见，各自独立，可先审查再讨论或实现。
2. 配置仅保存 Skill 引用和用户附加文本，不保存 SKILL.md 正文、页面位置或流程状态。
3. 执行入口按当前会话调用原生 Agent；缺失、停用或无效 Action 有诊断且不投递。
4. Skill 更新后执行加载最新正文，Action 配置不变。
5. 配置 CRUD、顺序、启用、持久化和重启有效。
6. 旧配置安全且幂等迁移；读取和备份/写入失败不损坏原数据。
7. 配置损坏不会阻塞启动和普通 Chat，恢复前保全原始字节。
8. 原生 Chat、Agent、Plan、Goal、权限和队列的行为不被替换。
9. 目标测试覆盖默认、解析、missing、迁移、排序、enabled、执行、持久化及损坏回退，以及诊断重试取消保留草稿、保存与重试互斥、临时空名称排序和 i18n 键集合 / 插值一致性；运行真实 Electron / Host / Pi 的 Action 和工程 Skill 回归。

## 明确不实现

Development Navigator 留待第二阶段：ProjectState、Artifact Tracking / Freshness、Recommendation、Next Step、流程完成状态与百分比、强制阶段跳转、依赖阻塞和自动推进均不实现。

本轮不引入 Workflow / Stage / Run / Constraint 核心模型，不修改 Pi Core 或 Pi Agent Runtime 核心执行语义，不实现模板版本升级引擎。后续导航能力可以包围 executeCodingAction，但用户仍可自由选择动作。
