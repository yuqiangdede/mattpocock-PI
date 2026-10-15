# 文档 Skill 共用执行工具

供同一 skills 资源包中的文档技能使用。此目录没有 SKILL.md，不作为独立 Skill 注入。各 Skill 仍是专业方法、证据判断和交付范围的权威入口；这里的工具只处理确定性操作。仅需 Python 3.10+ 标准库，不自动安装依赖。

## 任务开始与中断恢复

- 确认目标项目与文档、输入版本、源文件范围、用户已有选择和已存在的输出。被中断、压缩上下文、多个 Agent 协作或外部修改后，必须重新检查目标文件当前状态，不能依据会话摘要直接续写。
- 对已有输出，先创建快照：python apps/desktop/resources/skills/_shared/scripts/document_workspace.py snapshot "目标.md" --report "scratch/target-state.json"。
- 快照保存是否存在、SHA-256、字节数、行数和修改时间。续写前核对，变更则重新读取并审查实际状态，不直接重复追加。
- 快照不是锁；源文件、中间成果、生成脚本及验收记录也需要检查版本和有效性。

## 执行方式选择（先判断任务性质）

- **确定性操作先脚本/现有 CLI**：当输入、边界、规则和结果均可明确验证时，优先用脚本完成文件切片、复制、批量重编号、计数、拼接及格式转换；不因内容长而让子代理逐段 Edit。脚本必须使用只读源文件、明确输出路径，并核对预期项数、实际项数和边界。
- **需要业务判断才用 Agent**：产品级归并、冲突裁决、流程取舍、证据解释留给主 Agent；独立且有清晰文件/模块边界的复杂语义提取可交给子代理。子代理写各自成果文件，只返回路径、计数、证据及缺口；先划清共享 DTO/规则，防止并行重复扫描或同时修改同一文件。
- **工具选择依修改规模**：行锚定 Edit 只用于小范围唯一锚点修改，大段新增或整章重组使用按完整章节/接口/表分块的文件与确定性组装；任何自动替换应检查命中数量。分块大小由当前工具实际限制决定，不把 10/20/30KB 当普适上限。
- **一次只验证需要的特性**：简单单文件任务不强制创建工作流记录；复杂任务则先定内容范围、章节/对象清单、预期结果和必需检查，再按依赖顺序执行。

## 轻量任务检查点（约定而非新增运行时）

跨多文件、跨 Skill、长时间或易中断的文档任务，可在本任务 scratch 下维护 `job-manifest.json`；这是 Agent 维护的记录格式，**当前不假定任何脚本会自动创建或恢复它**。建议至少记录：

- `inputs`：路径、版本/指纹、纳入范围；`decisions`：用户已确认的名称、口径、模板及关键冲突决定；
- `stages`：步骤名、依赖、`pending/running/done/failed/skipped` 状态、实际输出路径及指纹、已完成验证、失败原因和可复用产物；
- `acceptance`：内容覆盖、结构、转换一致性、域/分页、视觉检查各自的 `passed/failed/not_checked` 与依据。

中断或外部编辑后先核对**磁盘实际文件、输入版本、输出指纹、章节及资产**，再调整步骤状态；不得以 manifest、对话摘要或文件修改时间代替当前内容。输入、模板、工具环境或依赖变化会使相应下游结果失效；无变化且验证仍成立的成功阶段不重做。manifest 不充当锁、许可或成功证明，也不允许自动覆盖用户改动。

## 源码预盘点（只作候选）

python apps/desktop/resources/skills/_shared/scripts/source_inventory.py "项目根目录" --report "scratch/source-index.json" --quiet

- 先收集入口、DTO、SQL、部署/迁移配置文件清单；索引帮助定位候选位置，不是 AST、路由注册、DTO 字段、SQL 迁移最终结构或运行行为的证明。
- 分配子代理前给定目标模块、输入清单、共享公共模型、产物路径和验收口径。没有明确边界或来源重叠时先由主代理提取共享事实，再决定是否并行。
- 对同一文件或模型共享已核验的快照和证据定位；版本变化及依赖变化时失效重查。各子代理把大结果写文件，只返回摘要、计数、文件路径、缺口；严禁输出数万字导致上限重试。
- 首次超时检查实际产物与进度，没有进展就缩小范围；同原因连续失败后更换执行方法，不反复延长等待。

## 大文档安全组装

- 对预估超过单次工具容量的大文件，写成按章节编号的 UTF-8 part 文件，避免一次大 Write 或用行锚定 Edit 追加整章。单块按环境实测安全上限选择，不硬编码适用于所有模型的 KB 数。
- 生成前列出**完整且有顺序**的预期章节/条目清单。完成每个 part 后检查首尾、围栏、表格、目标标题和源条目去向；组装后除工具的必需标题存在性检查外，还需核对标题全量、唯一性、顺序及条目数。当前 assemble 的 --required-heading **不保证顺序或语义完整**，不能称其已经检查过这些内容。
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

## 工具预探测、失败处理和验证边界

- 调用外部 CLI 前先看实际版本、帮助、依赖与环境，再对**本次实际使用的功能**执行最小端到端探针；存在命令不等于参数兼容。Mermaid 需探测 CLI 支持的尺寸参数、浏览器和配置，不能套用历史 `-w` / `--size`；Windows 使用 `.cmd/.bat` 时须额外验证引号、空格和中文路径，不擅自修改真实源文件路径。
- 阶段按“读取/提取 → 结构化 → 组装 → 转换/渲染 → 更新域/保存 → 视觉验证”隔离，按输入依赖选择实际步骤。对可能挂起的外部命令设置有上限的超时和明确的输出检查；超时后先确认文件是否已经成功落盘、进程是否仍在运行，并保留阶段产物。
- 按失败原因分类：临时故障可在有证据时有限重试；参数/依赖/输入错误先纠正；同一故障条件未变禁止原样重试或只放大超时。更换 Office 导出范围但仍调用同一挂起 API，不算更换执行路径。具有副作用的步骤不自动重试。
- 验证分层：**内容事实/覆盖、文件结构、MD→DOCX 转换一致性、目录域/分页、实际视觉排版**须分别记账。脚本只证明它实际检查的层级；逐接口字段、SQL 最终结构、需求/架构语义仍由相应 Skill 核对。不得用短语命中、标题存在或 ZIP 正常代替全量内容与视觉审查。
- 用户必需的验收项没通过不能宣称完成；仅可选的视觉/PDF 辅助检查失败时，保留已有效的 MD/DOCX，按需求给出实际产物和明确的未检查项，不让额外验证无期限阻塞交付。

## 可选检查点脚本（当前已实现）

`job_checkpoint.py` 是本目录内不依赖第三方包的可选命令行工具。适用于需要保留输入指纹、人工决定、阶段顺序、阶段输出和实际检查记录的**复杂文档任务**；简单单文件转换不必启用。

在项目根目录执行（所有输入、输出和 manifest 必须属于此项目）：

```sh
python apps/desktop/resources/skills/_shared/scripts/job_checkpoint.py init scratch/job-manifest.json --input source.md --stage extract --stage merge --stage convert --decision format=formal
python apps/desktop/resources/skills/_shared/scripts/job_checkpoint.py done scratch/job-manifest.json --stage extract --output scratch/extracted.md --check-result 'source inventory checked'
python apps/desktop/resources/skills/_shared/scripts/job_checkpoint.py check scratch/job-manifest.json
python apps/desktop/resources/skills/_shared/scripts/job_checkpoint.py fail scratch/job-manifest.json --stage convert --reason 'missing renderer'
```

完成步骤时要求前置阶段已完成、输入与已完成输出指纹未变化，并将阶段产物 SHA-256 记录到 manifest；`check` 发现过期文件时返回非零码，用户/Agent 必须重新检查磁盘并决定复用或重新生成。脚本只管理记录，**不自动执行任何内容处理、转换、部署，也不会把用户输入的“检查通过”描述当成独立证据**。不同任务不共享同一个 manifest；不允许通过重新初始化覆盖已有历史。

## 适用边界

所有脚本都只用于辅助执行和验证，不提供 Agent 编排、桌面会话状态、持久化 Work Item 或新的 UI 生命周期。独立复制单个 Skill 时若没有相邻 _shared，遵循同样的安全流程并如实记录缺少自动化验证；不凭空假设工具已安装。
