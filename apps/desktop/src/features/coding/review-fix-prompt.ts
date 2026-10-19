export const REVIEW_FIX_PROMPT_ID = "review-fix";
const headings = { zh: "修复审查问题", en: "Fix code review findings" };
export function isReviewFixRequest(text: string): boolean {
  return Object.values(headings).includes(text.trimStart().split(/\r?\n/, 1)[0]);
}
export function reviewFixPrompt(language: string): string {
  return language.startsWith("zh") ? [
    headings.zh,
    "核实本会话最近审查及后续讨论，仅修复确认成立的缺陷；报告不清时先查原文。最小修改，保留已确认需求和无关改动，遵守项目约定。",
    "补充回归测试并验证用户路径。不要自动提交、推送或合并。",
    "简要报告修复、未采纳原因、未解决问题及验证结果，完成后再次审查。",
  ].join("\n\n") : [
    headings.en,
    "Verify the latest review and follow-up discussion in this conversation; fix only confirmed defects. Consult the original report when unclear. Keep changes minimal, preserve agreed requirements and unrelated work, and follow project rules.",
    "Add a regression test and validate the user path. Do not automatically commit, push or merge.",
    "Briefly report fixes, rejected findings with reasons, unresolved issues and validation; review again afterward.",
  ].join("\n\n");
}
