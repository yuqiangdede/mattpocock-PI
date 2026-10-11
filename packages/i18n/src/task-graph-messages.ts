export const taskGraphEnglish = {
  exampleSpec: "Agree scope", exampleImplementation: "Implement the approved scope",
  title: "Task graph viewer", close: "Close", purpose: "Inspect dependencies and ready tasks. This viewer never dispatches tasks, updates issues, or closes them.",
  input: "Paste task graph JSON", schema: "Use { tasks: [{ id, title, status, blockedBy?, url? }] }. Status: pending, running, done, aborted. URLs must use HTTP or HTTPS.",
  inspect: "Inspect graph", results: "Task graph results", frontier: "Ready pending tasks (informational): {{tasks}}", none: "None", empty: "No tasks in this graph.",
  status: "Status: {{status}}", dependencies: "Dependencies: {{tasks}}", source: "Source URL:",
  statuses: { pending: "Pending", running: "Running", done: "Done", aborted: "Aborted" },
  errors: { json: "Enter valid JSON.", shape: "The graph or a task does not match the documented schema.", duplicate: "Task IDs must be unique.", dependency: "A dependency refers to an unknown task ID.", cycle: "The graph contains a dependency cycle.", url: "Use an HTTP(S) URL without embedded credentials.", limit: "Limit the graph to 1,000 tasks and 1,000,000 characters." },
};
export const skillGatesEnglish = {
  title: "Suggested gates", description: "These gates are descriptive guidance. CLI permissions or Hooks enforce actual safety constraints; this page grants no execution permission.",
  scope: "Confirm scope and acceptance criteria.", tests: "Run the relevant tests and checks.", review: "Review the task diff and contracts.", publish: "Obtain explicit authorization before publishing or pushing.", hooks: "Inspect and validate CLI permission or Hook configuration.",
};
export const taskGraphChinese = {
  exampleSpec: "确认范围", exampleImplementation: "实现已确认的范围",
  title: "任务图查看器", close: "关闭", purpose: "查看依赖与可开始的任务。查看器不会调度任务、修改 Issue 或自动关闭任务。",
  input: "粘贴任务图 JSON", schema: "格式：{ tasks: [{ id, title, status, blockedBy?, url? }] }。状态：pending、running、done、aborted。URL 仅支持 HTTP 或 HTTPS。",
  inspect: "查看任务图", results: "任务图结果", frontier: "可开始的待处理任务（仅供参考）：{{tasks}}", none: "无", empty: "任务图中没有任务。",
  status: "状态：{{status}}", dependencies: "依赖：{{tasks}}", source: "来源 URL：",
  statuses: { pending: "待处理", running: "运行中", done: "已完成", aborted: "已中止" },
  errors: { json: "请输入有效 JSON。", shape: "任务图或任务不符合上述格式。", duplicate: "任务 ID 必须唯一。", dependency: "依赖引用了不存在的任务 ID。", cycle: "任务图中存在循环依赖。", url: "请使用不含凭据的 HTTP(S) URL。", limit: "任务图最多包含 1,000 个任务及 1,000,000 个字符。" },
};
export const skillGatesChinese = {
  title: "建议门禁", description: "这些门禁仅描述建议。实际安全约束由 CLI 权限或 Hook 执行；此页面不授予执行权限。",
  scope: "确认范围与验收标准。", tests: "运行相关测试与检查。", review: "审查任务差异与契约。", publish: "发布或推送前取得明确授权。", hooks: "检查并验证 CLI 权限或 Hook 配置。",
};
