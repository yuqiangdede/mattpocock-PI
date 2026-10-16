export const REVIEW_FIX_PROMPT_ID = "review-fix";
const headings = { zh: "修复审查问题", en: "Fix code review findings" };
export function isReviewFixRequest(text: string): boolean {
  return Object.values(headings).includes(text.trimStart().split(/\r?\n/, 1)[0]);
}
export function reviewFixPrompt(language: string): string {
  return language.startsWith("zh") ? [
    headings.zh,
    "先汇总当前会话最近一次代码审查及后续讨论中提出的问题，去重合并同一问题，并按严重程度列出问题清单、涉及文件或位置、影响与证据，保留补充说明和已确认的结论。然后逐项核实问题；仅修复确认成立的问题，不盲目采纳建议。若未提供审查结果或结论不清楚，先定位原始审查报告并核实，不凭空创造问题。",
    "优先最小修改，保留已确认需求和无关改动，不扩大范围；遵守项目的架构、权限、数据兼容和交付约定。",
    "为成立的缺陷补充失败复现或回归测试，再修复并运行相关检查，覆盖代表性用户路径。不要自动提交、推送或合并。",
    "输出：先给出审查问题汇总，再逐项列出已修复、未采纳及原因、未解决问题、验证结果和残余风险；完成后建议再次代码审查。",
  ].join("\n\n") : [
    headings.en,
    "First summarize the latest code review and its follow-up discussion in this conversation. Deduplicate findings and list severity, affected files or locations, impact and evidence, retaining clarifications and confirmed conclusions. Then verify each finding. Fix only confirmed defects; do not blindly accept recommendations. If the report is missing or unclear, locate and verify it before inventing work.",
    "Use minimal changes, preserve agreed requirements and unrelated work, and follow project architecture, permissions, compatibility and delivery rules.",
    "Add a failing reproduction or regression test, fix the defect and run relevant checks covering the representative user path. Do not automatically commit, push or merge.",
    "Report the review issue summary first, then fixed findings, rejected findings with reasons, unresolved issues, validation and remaining risks; recommend another code review afterward.",
  ].join("\n\n");
}
