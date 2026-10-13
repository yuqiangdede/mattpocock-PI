/** Built-in guidance for the visual discussion shortcut; the Skill owns the workflow. */
export function visualGrillingDefaultPrompt(language: string): string {
  if (language.startsWith("zh")) return [
    "请围绕我提供的需求主题，使用 grill-with-ui 开展可视化需求讨论。",
    "先检查当前项目的相关代码、文档和已有决策，不要重复询问能够自行确认的事实。",
    "通过浏览器页面逐轮提出有价值的设计问题，为每个问题提供明确选项、推荐方案及取舍理由；允许我暂缓、重开和深入讨论，不要擅自替我决定。",
    "遵循 Skill 的事件监听与断点恢复流程，确认浏览器提交确实被 Agent 接收；监听中断时如实提示，不要声称仍在处理。",
    "仅在我明确完成访谈时输出完整设计文档，记录已确认决策、未决事项及理由；如需要可视化原型，按 Skill 的 Visualize 流程生成。",
    "保持现有项目架构和会话生命周期不变，不要直接修改业务代码。",
  ].join("\n");
  return [
    "Use grill-with-ui to run a visual requirements interview about the topic I provide.",
    "Inspect relevant project code, documentation, and existing decisions first; do not ask for facts you can verify yourself.",
    "Ask consequential design questions in browser rounds with clear options, a recommendation, and trade-offs; let me defer, reopen, or explore each decision without deciding for me.",
    "Follow the Skill's event listening and resume procedure; verify that the Agent receives browser submissions and report an inactive listener honestly.",
    "Only when I explicitly finish, write the complete design document with confirmed decisions, outstanding questions and rationale; use the Skill's Visualize flow when requested.",
    "Preserve the existing project architecture and session lifecycle; do not change application code.",
  ].join("\n");
}
