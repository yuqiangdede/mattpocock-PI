const MAX_SUMMARY = 600;
const MAX_ITEM = 145;

function compact(text: string, limit: number): string {
  const characters = Array.from(text);
  return characters.length > limit ? characters.slice(0, limit - 1).join("") + "…" : text;
}

/** Extract source text, never infer decisions or turn completion into acceptance. */
export function skillHandoff(request: string, answer: string, budget = MAX_SUMMARY): string {
  const clean = (text: string) => text.replace(/^(?:\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+))+/, "").trim();
  const goal = clean(request.replace(/^\s*\/(?:skill:)?[\w-]+\s*/, "").split(/\r?\n/)[0]);
  let fence = "";
  const visible = answer.split(/\r?\n/).filter(line => {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker?.[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = "";
      return false;
    }
    if (marker) { fence = marker; return false; }
    return true;
  });
  const lines: Array<{ text: string; heading: string }> = [];
  let heading = "";
  for (const line of visible) {
    if (/^\s*#{1,6}\s+/.test(line)) { heading = clean(line); continue; }
    const text = clean(line);
    if (!text) continue;
    // A heading alone is not a fact. Keep its qualifying content in the same item.
    lines.push({ heading, text });
    heading = "";
  }
  const unique = [...new Map(lines.map(item => [JSON.stringify(item), item])).values()];
  const priority = (line: string) => {
    if (/\[P[0-3]\]/.test(line)) return 4;
    if (/\b(blocked|unresolved|pending|remaining|todo|risk|failed)\b|待办|待确认|未解决|阻塞|风险|失败/i.test(line)) return 3;
    if (/\b(decided|confirmed|agreed|decision)\b|已确认|决定|决策|约定/i.test(line)) return 2;
    if (/(?:[\w.-]+[\\/])+[\w.-]+|\.(?:md|tsx?|rs|json)\b/.test(line)) return 1;
    return 0;
  };
  // Rank facts before prose, then restore source order to retain qualifications.
  const selected = unique.map((line, index) => ({ line, index, rank: priority(line.heading + " " + line.text) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index).slice(0, goal ? 3 : 4)
    .sort((a, b) => a.index - b.index).map(item => item.line);
  const items = [...new Map([...(goal ? [{ text: goal, heading: "" }] : []), ...selected]
    .map(item => [JSON.stringify(item), item])).values()];
  if (!items.length) return "";
  // Share the budget before formatting so the final item is never cut at its heading.
  const itemLimit = Math.min(MAX_ITEM, Math.floor((budget - items.length * 3 + 1) / items.length));
  return items.map(item => {
    if (!item.heading) return `- ${compact(item.text, itemLimit)}`;
    const title = compact(item.heading, Math.min(45, Math.floor(itemLimit / 3)));
    return `- ${title}: ${compact(item.text, itemLimit - Array.from(title).length - 2)}`;
  }).join("\n");
}
