---
name: database-design-doc
description: 从项目 SQL 和辅助源码编制详尽的数据库结构设计说明书，默认以项目 _pkg/linux/bin/*db 下 SQL 为主要依据，覆盖字段、关系、分表分区、索引、视图及其他数据库对象，交付专业 Markdown 文档。用于数据库设计文档编制、数据字典和现有数据库结构还原。
---

# 数据库结构设计说明书编制

从项目材料还原现有数据库设计，生成一份可用于技术评审、交接和维护的中文 Markdown 文档。默认描述当前材料所代表的设计基线；优化建议单独列出，不能写成已实现能力。

## 1. 确定项目与 SQL 基线

沿用用户已给出的项目根目录、数据库目录、版本和输出位置。尚未指定项目时，当前工作目录只有在明确是待分析项目时才可作为默认值；技能仓库或多项目目录不能代替目标项目，只询问缺失的目标路径。参考文档为可选输入，无需等待用户额外提供。

默认优先递归发现 `<项目根目录>/_pkg/linux/bin/*db/` 下全部 SQL 文件。用户示例中的 `xxxx` 是项目或数据库名称占位符，不是固定名称；同时检查项目内嵌套组件的同类路径，并记录各目录对应的组件和数据库。用户指定 SQL 目录时优先使用。找不到默认目录时，搜索项目其他 SQL、迁移目录和初始化入口，说明替代来源；有多个互斥产品或版本且无法判定时询问范围，同时继续文件盘点。

读取适用的 AGENTS.md、安装/升级脚本和数据库配置，确认方言、可证实的版本范围、数据库/schema、编码和大小写规则。配置仅提取设计相关项，连接凭证和敏感初始化数据不进入产物。只读分析 SQL 和源码，不执行安装脚本、DDL、DML，不连接或修改数据库；在线核验需用户另行授权。

建立 SQL 文件清单及对象清单，至少记录相对路径、用途（初始化/升级/历史/测试/方言变体）、适用版本、加载入口、顺序依据和纳入状态。完成条件是发现的每个 SQL 文件均已归类，选定基线有可解释的安装或迁移路径。

## 2. 重建有效结构

开始解析时读取 [references/analysis-rules.md](references/analysis-rules.md)。以选定版本的安装链和迁移链还原有效对象：CREATE 后的 ALTER、重命名、DROP、重建以及注释更新必须反映到最终结构。不能简单拼接所有 SQL，也不能按文件名排序就声称得到部署结构。

按数据库/schema 建立唯一对象标识，覆盖表、字段、键与约束、索引、视图、物化视图、序列、函数、存储过程、触发器、扩展、自定义类型、定时任务及权限定义等实际存在的对象。全文检索和正则可用于定位，遇到多行 SQL、动态 SQL、条件执行、函数体或方言语法时读取完整上下文核对；解析器不支持的部分列入人工核对范围，不能静默漏掉。

结构冲突优先根据安装入口、迁移版本及适用条件解决。没有足够证据确定先后或适用分支时，分别保留变体及差异，并明确文档基线限制。静态材料代表可还原的设计，不代表生产数据库已执行这些脚本。

完成条件：每个纳入基线的结构变更有处理结果，每类对象均有完整清单或明确的未发现/无法确认说明。

## 3. 用源码补全业务与动态行为

Within the confirmed project scope, discover and read existing requirements, overall design and outline design documents as additional references alongside SQL scripts, source code and user-supplied reference documents. Check the project root and documentation directories (including `docs/Requirements/` and `docs/Design/`), then follow relevant document links. Use requirements for business entities, rules and retention constraints, overall design for data ownership and storage boundaries, and outline design for logical models, relationships, state and transaction behavior. Reuse project-local documents without requiring a separate upload. These documents are optional: record missing or unreadable sources and their impact without requiring another document to be generated first. Record their paths, versions, scope and purpose, and map relevant statements to database objects. The selected SQL installation/migration baseline remains authoritative for physical definitions; use code to verify dynamic behavior, and retain document discrepancies or unimplemented target designs explicitly rather than inventing tables, columns, constraints or relationships.

从 SQL 对象名反查 ORM 实体、Mapper/Repository、服务、任务、数据库路由、配置与项目已有文档，解释业务职责、字段枚举和状态、逻辑关系、主要读写路径及生命周期。SQL 主导静态物理定义；源码用于解释业务语义及 SQL 未覆盖的运行时行为。源码和 SQL 不一致时保留差异，不能用实体声明覆盖实际 DDL。

对动态表名、拼接 DDL、建表模板、分片中间件、继承/分区语法、归档与清理任务进行专项追踪。区分应用分表、数据库原生分区、分库、归档表及普通带日期后缀的独立表。逐表族说明命名、路由键、算法/时间粒度、时区与边界、创建时机、跨表查询、索引约束继承、保留清理和失败处理；只有命名相似时标为候选，不据此断言分表。

物理外键和应用逻辑关系分别表述。字段的关联含义、枚举和基数无证据时写“未确认”；不按字段名猜测后当作事实。索引用途可结合查询解释，但性能收益、执行计划与容量数据只有实测证据才能写为已验证。

完成条件：每张表均有用途与字段说明，全部动态表族有专门章节，源码差异和未确认项可追溯。

## 4. 编制正式文档

读取 [references/document-template.md](references/document-template.md)，按照模板生成一份完整文档。用户提供的专业模板优先，同时保留本技能要求的结构覆盖。按业务域组织表，统一术语和对象标识；大型项目仍逐表逐字段展开，不能以“其他同类表略”替代。结构完全一致的物理分表可以共用字段字典，但须列全已发现实例、模板、差异与范围。

正式正文面向维护人员解释设计。来源明细、版本冲突、覆盖清单集中放附录，关键未知保留在对应章节，避免将推断包装成确定设计。不存在的对象类别简述“选定基线未发现”，无法解析或材料缺失则写明限制；二者不能混同。提供按业务域拆分的 Mermaid ER 图，图中标明物理/逻辑关系，标注方式应与 Mermaid 实际可用语法兼容。

默认保存到 `<项目根目录>/docs/Design/<项目名>-数据库结构设计说明书.md`，用户指定位置时沿用。已有同名文档先读取并保留有效人工内容及修订记录，避免直接覆写无法融合的内容，必要时生成独立新版。中间盘点按需放 `docs/Design/中间文档/数据库设计/`，最终正文须能独立阅读。

## 5. 全量校审与交付

逐项比对清单与文档：所有有效表、字段、约束、索引、视图及其他对象均已覆盖；迁移删除对象不混入当前清单；每个分表实例归属明确；字段数量、索引列顺序、唯一性、默认值与表达式无误。视图依赖、ER 图、表间关系和正文一致。检查 Markdown 表格转义（尤其 SQL 的竖线和换行）、标题编号、目录链接、UTF-8 编码及替换字符。

在附录写明扫描和解析范围、对象分类计数、遗漏/未确认项与核验方式；未完成全量分析时如实交付阶段稿并列出剩余范围，不能标注完整定稿。交付最终文件链接，简述覆盖范围与重要限制，区分静态核对和在线验证。仅生成文档，不修改业务代码，不提交或推送。

## 执行效率与增量检查

复用选定基线的 SQL 清单及对象记录，以数据库/schema/对象标识关联定义、变更链、最终结构和文档位置。源码语义与动态表族追踪结果附在相应记录，字段字典、对象计数和 ER 图从同一有效记录核对，减少重复解析与手工抄写。

材料变化时先定位受影响对象、迁移分支及依赖，再更新对应记录和正文；迁移顺序或基线变化需重算受影响链，不能只追加最后一段 DDL。未知及解析失败项继续显式记录。

修订前确定对象/字段/索引等计数口径和预期变化，复用同一验收清单；自动修改核对对象唯一性及实际命中数量。中文分析结果以 UTF-8 保存，编码异常先解决再比对。修改后检查依赖视图、关系图和引用，交付前仍完成既有全量校审，不通过执行 DDL 验证文档。

调用示例：

> 使用 $database-design-doc 为 D:\\项目路径 生成数据库结构设计说明书。优先分析 _pkg/linux/bin/*db 下 SQL，结合源码补全动态分表、业务关系与数据生命周期，逐表逐字段展开，交付 Markdown。

## 执行补充：SQL 对象提取与安全成文

采用[公共文档执行工具](../_shared/README.md)，但保持“安装/迁移链决定有效数据库结构”的核心原则。

- 对大型 SQL 先生成文件快照、安装与迁移顺序表，source_inventory.py 只协助定位 CREATE 等候选，**不能把正则扫描计数当作有效表/列/索引统计**。继续检查 ALTER/DROP、条件版本、动态 SQL、继承、分区和源码运行时 DDL。
- 对象清单为表族、字段字典、关系图、总览计数的共同事实来源；物理表实例和模板分开统计。主代理为子代理预分配数据库/schema 或无交叉对象组，先共享解析结果，避免重复扫描 SQL。
- 完整字段明细按业务域写到独立 UTF-8 分块，预先列出预期对象和章节，分块后立即核对最后一行、表格格式和字段数量；用 document_workspace.py 组装，文档变更则刷新源证据与校验，不沿旧会话状态追加。
- 全量交付时由同一对象清单校核“有效→已描述”数量、索引/函数/触发器和动态表族，不因格式校验通过就宣称数据库事实正确。
- DDL 文件切片、确定性格式转换、对象去重与计数优先脚本；安装/迁移执行顺序、方言条件、动态 SQL/分表语义仍需核验，不把简单正则作为真实 schema 解析器。用“SQL/迁移版本 → 有效对象与字段 → 文档章节”双向核对，差异与未解析范围单独计数。
- 长文档和迁移链按 _shared 的输入指纹、结构分块及检查点恢复；发生版本或安装入口变化时使相关对象和依赖设计失效，不重复扫描未改变的数据库域。


## 跨 Skill 源码证据复用

复杂分析可使用 [共享源码证据索引](../_shared/EVIDENCE.md) 记录本 Skill 的源码位置、文件指纹和需求/架构/接口/数据库条目引用，复用其他文档 Skill 已核对且版本仍有效的公共事实。索引默认只是候选/带来源的线索，不能代替本 Skill 对真实业务链路、条件启用、迁移顺序和目标语义的专业核对；源文件或相关依赖变化时使对应结论失效并重新验证。
