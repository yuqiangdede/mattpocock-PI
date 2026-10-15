---
name: markdown-to-docx
description: 将已有 Markdown 转为 Word，或先按产品维度融合多个组件需求/设计 Markdown 再转为一份 Word。合并时人工指定名称并选择 Word 模板或推荐格式，支持图片、表格、公式、Mermaid 与数据图表；不重新提取源码需求。
---

# Markdown 转 Word 与合并交付

支持单文档转换和多组件文档合并并转换，生成可独立携带的 .docx。适用于需求、总体设计、概要设计及普通技术文档；转换阶段保持已校审 Markdown 的范围、编号、图题、数据和待确认口径，不补写业务内容。

## 选择入口

- **单文档转换**：已有一份定稿 MD，直接执行下方转换流程；普通单文件转换仍可默认使用同名输出。
- **合并并转换**：用户提供多个组件 MD，或明确要求融合不同组件的需求/设计，执行 [references/merge-and-convert.md](references/merge-and-convert.md)。先收集人工指定名称及模板/推荐格式，使用独立的 `$component-doc-merge` 做产品级融合，校审后立即转换为同名 Word，交付融合 MD 与 DOCX，不仅提供下一步建议。
- **已融合稿交接**：收到 component-doc-merge 的“融合已完成，仅转换此单一 MD”交接，直接沿用名称和格式，进入转换，不再次调用合并或重复询问。

## 执行

1. 确定输入、输出及已有样式模板。默认输出到输入同目录的同名 `.docx`，保留原 Markdown 和资产。输入可以来自其他内容 skill，也可为任意已有 Markdown；无需重新执行内容编制。
2. 先按 [公共工具选型策略](../_shared/TOOLING_POLICY.md) 根据输入格式、图形类型、质量和成本推荐最合适的工具，再用脚本 `--check` 核对**当前脚本实际要求的依赖**、版本及最小探针；不以已安装为选型依据，也不能把新工具推荐当作转换脚本已支持。缺少推荐工具时说明具体优势、安装代价、授权范围和可用替代路径，获得许可后才安装；转换请求本身不授权全局安装。避免硬编码运行时路径。
3. 有图片、Mermaid、图表或扩展语法时读取 [references/formats.md](references/formats.md)。使用脚本转换，缺图、渲染失败或不支持的原始 HTML 会报错，先解决后重新执行；不把代码或缺图占位符当作已转换图形。
4. 按 [references/verification.md](references/verification.md) **必做内容完整性、Markdown→DOCX 一致性及 DOCX 结构检查**；排版采用快速/标准/严格三级：普通转换默认快速，不额外导出 PDF；高版式风险建议严格，用户可明确跳过耗时全页视觉检查。目录域存在性、实际页码更新和视觉检查分别记录，不能将未验证项称为通过。需要视觉检查时选用可用的实际 Word/LibreOffice 或其他兼容排版路径。
5. 提供实际 DOCX 链接及检查结果。源 MD、图形缓存和 QA 页面默认不作为额外交付件。遇到工具限制保留已有成果并说明具体缺口，不宣称完整视觉验证。

```powershell
python "<skill>/scripts/convert.py" "报告.md" --check
python "<skill>/scripts/convert.py" "报告.md" "输出/报告.docx" --toc
python "<skill>/scripts/convert.py" "报告.md" --reference-doc "模板.docx" --toc
python "<skill>/scripts/convert.py" "产品需求规格说明书.md" --profile formal --title "产品需求规格说明书"
```

`--pandoc`、`--mmdc` 可指定现有可执行文件，`--puppeteer-config` 可指定现有浏览器配置；Windows 支持 `.cmd` 启动器。不使用隐式下载的 npx。`--overwrite` 仅在用户已授权更新该输出时使用。普通转换默认不增加封面或目录；`--toc` 插入原生目录域。`--profile formal/review/compact` 应用用户所选推荐样式并启用目录，须同时提供人工指定的 `--title`；formal/review 增加独立封面，compact 增加标题区。`--profile` 与 `--reference-doc` 二选一，用户模板优先；reference-doc 只提供样式，不复制模板正文或审批信息。

## 支持范围

标题、段落、强调、嵌套列表、任务清单、链接、引用、代码、分隔线、表格、脚注、LaTeX 数学公式及 YAML 元数据经 Pandoc 转换；正文和表格保持可编辑。图片嵌入 Word，Mermaid、`chart` 和 `vega-lite` 围栏渲染后嵌入。复杂 HTML、其他图形 DSL 及特殊扩展先转换为支持的 Markdown/本地图片并核对，不能笼统宣称所有扩展无损。

默认制作 `.docx`。用户明确要求旧 `.doc` 时仅通过已有兼容工具实际另存并检查，不能改后缀伪装；工具不足时交付现有 DOCX 并说明旧格式尚未完成。此技能不提交代码、不发布文件、不改变系统全局配置。

## 执行效率与失败处理

保留上述依赖授权、格式选择、融合交接及**内容/结构必检、视觉分级可选**流程。先根据任务选择推荐工具，再匹配输入实际使用的语法与图形类型核对其能力；工具存在不等于参数、浏览器和渲染链路可用。新增工具、模板或转换逻辑时，使用覆盖本次特性的最小探针，包含实际中文路径；记录版本与结果，在环境和输入特性未变时复用，不反复安装或固定降级到旧版本。

中文提取、诊断及替换规则使用精确 UTF-8 文本；编码异常先解决。大批替换将规则与引擎分开，较大文件按实际工具限制分块写入并核对完整性；自动修改核对唯一目标、实际命中及预期数量，避免静默跳过。

转换按解析、图形渲染、DOCX 制作、域更新及视觉检查定位失败。原因未改变时不原样重跑；有明确修正后最多重试一次，同一原因再次失败则更换可用路径或交付现有成果并报告缺口。复用已校审 MD 与仍有效资产，内容变化时重新核对相关检查；失败重试不重新触发融合或已完成的人工选择。复用同一验收清单记录各阶段实际状态；内容与结构检查标准不降级，视觉检查按用户选择的级别执行并记录未检项。

## 实现参考

- [github/awesome-copilot · md-to-docx](https://github.com/github/awesome-copilot/tree/main/skills/md-to-docx)：借鉴相对路径图片嵌入与结构化样式思路。
- [desmondc9/agent-skills · markdown-to-docx](https://github.com/desmondc9/agent-skills/tree/main/markdown-to-docx)：借鉴 Pandoc、Mermaid 渲染与 DOCX 后处理分阶段流程。

本实现使用 Pandoc AST，图形失败即停止，不依赖固定 Linux 浏览器路径，不自动删除手写目录。

## 执行补充：转换恢复与文本核验

使用[共享文档工具](../_shared/README.md)处理前序 Markdown 的完整性和 Word 内容抽样校验，不在转换中再次融合或改写需求。

- 大型合并稿的分块写入和中断恢复由上游融合 Skill 完成；开始转换前必须确认输入 MD 的当前指纹、完整章节、图片资产和内容基准，不能用中断前记录的文件大小代替读取。用 document_qa.py 检查源 Markdown 结构。
- --check 仅报告依赖存在性，并不证明 Mermaid/浏览器/Pandoc 参数兼容；对本次实际使用的图形和中文路径先做最小探针，再批量转换，不自动安装工具。沿用已验证的参数，失败先定位解析、渲染、DOCX、域更新或排版阶段。
- Word XML 的中文或带空格标题可能拆分为多个文本 run。可以用同包 _shared/scripts/docx_text_check.py 按段落合并 run 后核对关键标题，禁止在 document.xml 中直接查完整字符串后认定“缺失”。其通过仅代表指定内容在文档中，不代表全文一致、分页/目录或视觉检查通过。
- 同一 Office 导出路径两次同原因失败就降级；更严格地，失败条件未改变时**不要原样重试**，已知同一 API 挂起也不因修改页数、扩大超时而重置次数。每次只重试失败阶段并保留先前已验证成果，明确报告实际完成和未完成的结构、文字、目录及全页视觉验证。
- 在含 Mermaid 的文档上，先核对当前 mmdc 版本、帮助、可用浏览器及最小图形探针，**不得直接假定 convert.py 内置的 -w 参数一定有效**；若探针不兼容，应先报告当前转换实现需适配，不通过编造已转换图形或无限试错绕过。Windows .cmd/.bat 需以实际含空格/中文路径做调用探针；可在 ASCII scratch 验证定位环境问题，但不得修改源 MD 或资产含义。
- 依次记录 MD 结构、渲染、DOCX 结构与关键内容、Office 域更新及保存、分页与视觉检查的独立状态。更新域/保存与可选 PDF 导出分开执行，设置有限超时；DOCX 已完成时不让非必需的 PDF 辅助导出失败迫使整条转换重做。长任务按 _shared 检查点只恢复未完成且必要的步骤。
