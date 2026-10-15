# 文档 Skill 共用执行工具

供同一 skills 资源包中的文档技能使用。此目录没有 SKILL.md，不作为独立 Skill 注入。各 Skill 仍是专业方法、证据判断和交付范围的权威入口；这里的工具只处理确定性操作。以下脚本仅需 Python 3.10+ 标准库，不自动安装依赖。

通用工具选型、主动推荐安装、授权边界及可跳过的排版验证级别统一执行 [TOOLING_POLICY.md](TOOLING_POLICY.md)。先依据任务选最合适的工具，再核实安装情况；不要将“现有工具优先”作为绝对规则。各文档 Skill 的内容与结构底线检查保持必做。

## 任务开始与中断恢复

- 确认目标项目与文档、输入版本、源文件范围、用户已有选择和已存在的输出。被中断、压缩上下文、多个 Agent 协作或外部修改后，必须重新检查目标文件当前状态，不能依据会话摘要直接续写。
- 对已有输出，先创建快照：python apps/desktop/resources/skills/_shared/scripts/document_workspace.py snapshot "目标.md" --report "scratch/target-state.json"。
- 快照保存是否存在、SHA-256、字节数、行数和修改时间。续写前核对，变更则重新读取并审查实际状态，不直接重复追加。
- 快照不是锁；源文件、中间成果、生成脚本及验收记录也需要检查版本和有效性。

## 源码预盘点（只作候选）

python apps/desktop/resources/skills/_shared/scripts/source_inventory.py "项目根目录" --report "scratch/source-index.json" --quiet

- 先收集入口、DTO、SQL、部署/迁移配置文件清单；索引帮助定位候选位置，不是 AST、路由注册、DTO 字段、SQL 迁移最终结构或运行行为的证明。
- 分配子代理前给定目标模块、输入清单、共享公共模型、产物路径和验收口径。没有明确边界或来源重叠时先由主代理提取共享事实，再决定是否并行。
- 对同一文件或模型共享已核验的快照和证据定位；版本变化及依赖变化时失效重查。各子代理把大结果写文件，只返回摘要、计数、文件路径、缺口；严禁输出数万字导致上限重试。
- 首次超时检查实际产物与进度，没有进展就缩小范围；同原因连续失败后更换执行方法，不反复延长等待。

## 大文档安全组装

- 对预估超过单次工具容量的大文件，写成按章节编号的 UTF-8 part 文件，避免一次大 Write 或用行锚定 Edit 追加整章。单块按环境实测安全上限选择，不硬编码适用于所有模型的 KB 数。
- 生成前列出预期章节顺序。完成每个 part 后检查内容尾部、围栏、表格与目标标题。
- 对新文件，使用：

~~~text
python apps/desktop/resources/skills/_shared/scripts/document_workspace.py assemble "输出.md" --part "scratch/01.md" --part "scratch/02.md" --required-heading "## 1 章节" --required-heading "## 2 章节"
~~~

- **已有文件禁止静默覆盖**；只有明确决定替换时同时传 --overwrite 和 --snapshot "scratch/target-state.json"。如文件在中断期间已变更，工具拒绝覆盖。需先重新读取当前文件和重新取得授权范围，绝不通过重新生成快照绕过冲突。
- assemble 检查非空块、必需标题恰好一次、UTF-8/替换字符、代码围栏和 JSON 格式，先写同目录临时文件，通过后原子替换。还需由文档 Skill 检查业务完整性及影响范围。

## 静态校验与 Word 文本验证

~~~text
python apps/desktop/resources/skills/_shared/scripts/document_qa.py "输出.md" --report "scratch/md-qa.json"
python apps/desktop/resources/skills/_shared/scripts/docx_text_check.py "输出.docx" --phrase "某一必须存在的章节标题" --report "scratch/docx-text.json"
python -m unittest discover -s apps/desktop/resources/skills/_shared/scripts -p "test_*.py"
~~~

- Markdown 工具检查 UTF-8、围栏、JSON 代码块、相对文件链接及可疑缩进；不证明 API 字段、SQL 结构、需求或设计语义正确。
- DOCX 文本校验在 Word 的段落层合并分裂的 XML run，避免直接在 document.xml 搜完整文字造成误报。一个短语应在同一段落内；跨段落内容用不同检查项。此工具不能替代 ZIP/关系/样式/图片/分页与全页视觉检查。
- 需对照资产清单、证据与字段模型完成专有校验。若工具缺失或不适配，不声称检查通过，按 Skill 原有交付规则记录未检查项。
- 失败留存已验证成果，不修改业务代码、不执行生产接口、不未经授权安装依赖。

## 适用边界

所有脚本都只用于辅助执行和验证，不提供 Agent 编排、桌面会话状态、持久化 Work Item 或新的 UI 生命周期。独立复制单个 Skill 时若没有相邻 _shared，遵循同样的安全流程并如实记录缺少自动化验证；不凭空假设工具已安装。
