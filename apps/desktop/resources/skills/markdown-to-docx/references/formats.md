# 格式与依赖

## 基础转换

按 [公共工具选型策略](../../_shared/TOOLING_POLICY.md) 先比较任务所需能力、结果质量、兼容性与执行/安装代价，再检查现有环境。**当前仓库的 convert.py 实现**必需 Python 3.10+、Pandoc 3+、python-docx；其他推荐方案不代表此脚本无需这些依赖。脚本不执行安装；缺少时先说明推荐工具的优势、替代方案及代价，取得明确授权后才在指定环境安装，例如该解释器的 `-m pip install python-docx`。Pandoc 可使用便携版本，通过 `--pandoc` 指定；不擅自修改全局 PATH。

Markdown 通过 Pandoc 原生 AST 解析，支持标准 Markdown/GFM 常用构件、管道表格、脚注、任务列表和 `$...$`/`$$...$$` 公式。公式由 Pandoc 转成 Word 数学对象；特殊 LaTeX 宏需检查实际结果。代码围栏保留代码字体，普通程序代码不执行。表格中的 `<br>` 转为真实换行；其他原始 HTML 报错，先转成等价 Markdown，复杂合并单元格表可在明确保持内容后用 python-docx 专项构建。代码示例中的 `<br>` 不作替换。

YAML 元数据按 Pandoc 规则处理，不能编造作者、日期或审批。`--reference-doc` 指定 DOCX 样式参考，不是填充模板正文；用户要求保留模板封面/固定正文时，单独用 DOCX 工具处理并复核。

## 图片

支持本地 PNG/JPEG；GIF/BMP/TIFF/WebP 等由 Pillow 转为 PNG，动图默认首帧并在报告记录。SVG 由 CairoSVG 实际转为 PNG（需要可用 Cairo 运行库），不靠改后缀。需保持矢量或透明等特殊效果时先验证目标 Word 支持。

路径相对于输入 MD，支持中文、空格及 URL 编码路径。图片在 DOCX 中嵌入，输出不依赖原路径。远程图片、data URI、HTML img 标签不自动下载或静默丢弃：先由代理解析、核实可访问性并本地化到临时资产，再更新转换副本；保留原文件和合法来源。失效图片或无法读取的文件必须解决。

## Mermaid

使用 `mermaid` 围栏。通过现有 Mermaid CLI（mmdc）渲染高分辨率 PNG，覆盖流程、时序、状态、ER、甘特、饼图等当前安装版本支持的类型。需要 Node、Mermaid CLI 和可用 Chromium；使用 `--puppeteer-config` 指定浏览器路径等配置，不硬编码 Linux 路径，不关闭沙箱作为默认措施。

批量渲染前先检查当前 `mmdc --version` 和 `--help`、实际可用 Chromium/Edge 路径及 Puppeteer 配置，再对本次图形跑最小端到端探针。不同 mmdc 版本的尺寸选项可能不兼容，不能假定旧 `-w` 或新 `--size` 恒成立；转换脚本内置参数与实际版本不符时应停止并如实说明需适配，不通过盲目重试或换文档掩盖。Windows 通过 `.cmd` 启动时额外验证空格和中文路径的引号处理；ASCII scratch 只用于定位问题和制作临时产物，不改变用户交付路径。

缺依赖时经授权可安装到项目或指定工具目录，例如 `npm install --prefix <tools> @mermaid-js/mermaid-cli`，并说明可能下载浏览器。渲染不使用外部托管服务；不执行文档附带的 shell 命令。

## 数据图表

已有图表图片按图片处理，Word 中为嵌入图片，不宣称原生可编辑 Word chart。需要数据可编辑时同时保留源数据；用户要求原生 Word chart 时使用可用 OOXML/Office 工具专项制作并验证。

`chart` 围栏接受 JSON，使用 matplotlib（另需可显示中文的字体）生成柱状、折线、饼图或散点图。例如：

````markdown
```chart
{"type":"bar","title":"月度数量","x":["一月","二月"],"series":[{"name":"事件","values":[12,18]}],"ylabel":"条","font":"Microsoft YaHei"}
```
````

`type` 为 `bar`、`line`、`pie` 或 `scatter`；`x` 为标签（scatter 为数值），每个 series 的 values 与 x 等长，pie 只接受单系列非负且总和大于零的数据。可选 title、xlabel、ylabel、font。柱状多系列并列显示，不叠在一起。图表不运行 Python 代码；数据来自原文或用户，不推测缺失数值。

`vega-lite` 围栏接受自包含 Vega-Lite JSON，经 `vl-convert-python` 生成 PNG。仅接受内联 data.values，拒绝 url、外部图片及外部资源引用；复杂规格由图表工具预先渲染为本地图片。安装按已有授权进行，不在转换时自动联网补齐。

PlantUML、Graphviz 等其他 DSL 先用已有对应渲染器生成本地 PNG，核对语义后在转换副本中引用，不能以普通代码块保留冒充已支持图形。

## 样式与大型文档

用户参考样式优先；默认 A4、中文正文、真实 Heading 样式、表格重复表头及页码域。超宽表、宽图、长行的最终版面依赖排版引擎，需按实际页面调整列宽、横向节或拆图，不缩到无法阅读。

合并交付时沿用用户明确选择的模板或推荐格式，不在转换阶段重新选择。`--profile formal/review/compact --title "人工名称"` 应用内置样式，自动启用目录，并设置中文正文、标题、表线、页眉与页码；formal/review 生成独立封面，compact 生成紧凑标题区。标题只使用人工输入，不自动填作者、日期、版本或审批。选择差异见 [推荐格式](../../component-doc-merge/references/intake-and-format.md)。

`--profile` 与 `--reference-doc` 互斥；后者保留用户参考样式，不被内置字体/封面覆盖。原生目录和页码域若要求准确实际页码，仍需实际排版引擎更新并验证；用户可跳过全页视觉检查，但未更新或未检查的页码必须标记为未验证。内置样式不是国家/行业标准认证。模板需要固定封面、公司标识或特定页眉页脚正文时，由现有 DOCX 工具另外制作并复核。

脚本在输出旁的独立 `.md-to-docx/` 工作目录保留 AST、图像和校验报告；不会重写源 MD。输出先构建与检查临时 DOCX，通过后才替换目标，现有文件需显式 `--overwrite`。失败保留中间成果，修复失败阶段再执行；缓存不是全页验证证据。
