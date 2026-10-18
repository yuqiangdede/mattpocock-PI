# 产品维度的融合规则

## 建立统一模型

逐份读取组件文档的正文、表格、图形源、版本与适用范围，记录组件职责和输入条目。建立“输入文件/条目 → 产品能力或设计标识 → 纳入、合并、拆分、调整、排除或冲突 → 理由”的工作映射。按可独立验证的业务目标合并，不按页面、类或组件文件名决定需求边界。

例如：客户端描述告警展示、服务端描述告警接收与处置、设备端描述告警上报。最终组织为“告警接收、展示与处置”的产品能力，说明操作者如何完成闭环及权限/状态/异常；不形成“客户端需求、服务端需求、设备端需求”三份顺次正文。设计中仍说明三方的实际职责、协议和失败处理，不能因同属一项能力而抹去独立边界。

## 需求融合

- 按业务目标、参与者、触发、范围和结果识别同义、重复、互补与独立需求。同义合一，互补阶段融入同一用例，独立目标保留独立需求。
- 统一角色、术语、权限、业务状态与数据定义；不同版本或适用对象的差异显式保留，不把高/中/低、编码或同名状态强行视为相同。
- 跨组件流程连贯描述用户动作、产品响应及可观察结果。入口、前置、正常、取消、异常、幂等/重试、后置及验收按实际适用性覆盖，不添加原输入没有的强制审批或能力。
- 数据、接口与非功能需求独立组织并关联业务能力。硬指标保留单位、条件和有效来源口径；各组件指标不直接相加成产品承诺，局部性能不冒充整体性能。
- 业务分类、当前实现、目标要求、可信度分别管理；没有基准不强行判为新增或基线，没有实现证据不把目标能力写成现状。

## 设计融合

先明确产品上下文、逻辑架构、运行构件与部署边界，再把组件职责放入统一视图。按端到端业务场景组织系统级或模块级流程，交代同步/异步、调用/提供方、状态、数据权威归属、协议、失败传播及恢复。

核对接口两侧的字段、枚举、单位、版本、错误与重试契约；文档仅有一侧时明确未闭合，不能凭空创建共享库、共享数据库或成功响应。共用认证、日志、消息及异常策略一处定义，组件差异写适用范围。设计中必要的技术接口名、表名和版本保留；源码路径、合并来源与分析过程不进入正式正文。

总体设计保持系统/子系统视角；概要设计保留接口契约、状态及内部协作细节。不能以产品化措辞删除开发和测试所需的机制，也不能从多个局部图臆造已部署的整体拓扑。

## 冲突与一致性

优先采用用户明确决定及适用的有效修订。有效性不清时不能仅按文件修改时间取新覆盖旧。对改变业务结果或工程承诺的冲突，给出两侧差异、影响与具体方案，等待明确决定；继续不依赖该冲突的部分。未解决项沿用用户的真实缺口策略，不能把无证据的推断改为事实。

重新建立一套编号；旧编号映射保留在工作记录，最终跨节、图表、脚注和正文引用全部更新。同名图片分别命名，原文件目录是资源解析基准；不能在合并目录中按同名文件碰运气查找。参考式链接、脚注标识与显式锚点需要消除冲突，代码块内的示例编号不误改。

正文只保留一份概述、范围、术语、角色及章节目录。去除“组件 A 文档指出”“本次合并”“源码反推”等编制痕迹，保留有业务意义的组件差异、工程取舍和待确认项。原始文档保持只读。

## Final chapter-title audit

After the final content revision and before delivery or Word conversion, enumerate every Markdown heading outside code blocks, including ATX and Setext headings. Record its level, parent chapter path, original title and location in `.merge-work/`.

Compare title text after removing chapter numbering and Markdown formatting, trimming and collapsing whitespace, and ignoring Latin letter case. Check the whole document as well as siblings under each parent: different numbering must not hide repeated titles. Review synonymous titles for overlapping scope.

For each match, inspect the section content and parent context. Merge sections that repeat the same subject while preserving unique requirements and design constraints. Rename distinct sections with ambiguous titles to express their actual scope. Keep legitimate repeated subsection labels under different parents (such as "Overview" or "Error handling") when their context is clear; record the reason rather than deleting content mechanically.

After corrections, regenerate chapter numbering and the table of contents, update anchors and cross-section links, and repeat the audit. Completion requires no unresolved accidental duplicate titles, valid references, and a recorded list of resolved matches or justified repetitions; record an explicit zero-match result when none are found.

## 完成条件

1. 每份输入和每项有效内容均有处理去向，排除有理由，重要约束无遗漏，重复规则已统一。
2. 产品能力和整体流程独立可读，不依赖打开组件原稿；需求覆盖用户问题与结果，设计覆盖职责与真实机制。
3. 跨组件正常和关键异常链路闭合，或准确标出未闭合处；数据/接口/状态和各侧契约一致或缺口明确。
4. 最终编号唯一、引用有效，图形语义与正文一致，公式/单位/图表数据保留，资产可携带；输入与输出未相互覆盖。
5. 名称及模板/推荐格式来自用户的明确选择，已贯彻结构和交接信息；正式正文没有来源拼接或内部证据痕迹。
6. The final chapter-title audit is complete, all accidental duplicates are resolved, and any justified repeated labels and reference checks are recorded in `.merge-work/`.

完成上述校审后再交给 Word 转换，不把文档校审、模板采用或 DOCX 结构校验称为客户验收、运行测试或全页视觉通过。
