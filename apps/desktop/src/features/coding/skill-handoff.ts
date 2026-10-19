const MAX_SUMMARY = 600;
const MAX_ITEM = 145;

function compact(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : text;
}

/** Extract source text, never infer decisions or turn completion into acceptance. */
export function skillHandoff(request: string, answer: string, budget = MAX_SUMMARY): string {
  const clean = (text: string) => text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^(?:\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+))+/, "").replace(/[*`]/g, "").replace(/\s+/g, " ").trim();
  const goal = clean(request.replace(/^\s*\/(?:skill:)?[\w-]+\s*/, "").split(/\r?\n/)[0]);
  let fence = "";
  const lines = answer.split(/\r?\n/).filter(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      return false;
    }
    if (marker) { fence = marker; return false; }
    return true;
  }).map(clean).filter(Boolean);
  const unique = [...new Set(lines)];
  const priority = (line: string) => {
    if (/\[P[0-3]\]/.test(line)) return 4;
    if (/\b(blocked|unresolved|pending|remaining|todo|risk|failed)\b|待办|待确认|未解决|阻塞|风险|失败/i.test(line)) return 3;
    if (/\b(decided|confirmed|agreed|decision)\b|已确认|决定|决策|约定/i.test(line)) return 2;
    if (/(?:[\w.-]+[\\/])+[\w.-]+|\.(?:md|tsx?|rs|json)\b/.test(line)) return 1;
    return 0;
  };
  // Rank facts before prose, then restore source order to retain qualifications.
  const selected = unique.map((line, index) => ({ line, index, rank: priority(line) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index).slice(0, goal ? 3 : 4)
    .sort((a, b) => a.index - b.index).map(item => item.line);
  const items = [...new Set([goal, ...selected].filter(Boolean))];
  return compact(items.map(item => `- ${compact(item, MAX_ITEM)}`).join("\n"), budget);
}
