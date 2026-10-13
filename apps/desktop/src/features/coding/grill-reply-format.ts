/** Bounded syntax repair only. Never invent IDs, answers, options or decisions. */
export function grillReplyObjects(content: string): unknown[] {
  if (content.length > 65_536) return [];
  const objects: unknown[] = [];
  let start = -1, depth = 0, quote = "", escaped = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (start < 0) { if (c !== "{") continue; start = i; depth = 1; continue; }
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === "{") depth++;
    if (depth > 64 || i - start > 50_000) return [];
    if (c !== "}") continue;
    depth--;
    if (depth !== 0) continue;
    const candidate = content.slice(start, i + 1);
    try { objects.push(JSON.parse(candidate)); }
    catch { try { objects.push(JSON.parse(repairSyntax(candidate))); } catch { /* Non-repairable candidate. */ } }
    if (objects.length > 16) return [];
    start = -1;
  }
  return objects;
}

function repairSyntax(source: string): string {
  let output = "";
  let previous = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' || c === "'") {
      const quote = c;
      let value = "", closed = false;
      for (i++; i < source.length; i++) {
        const next = source[i];
        if (next === quote) { closed = true; break; }
        if (next === "\\") {
          const escaped = source[++i];
          if (escaped === "'" && quote === "'") value += "'";
          else if (escaped === '"') value += '\\"';
          else value += "\\" + escaped;
        } else if (next === '"') value += '\\"';
        else if (next.charCodeAt(0) < 32) value += JSON.stringify(next).slice(1, -1);
        else value += next;
      }
      if (!closed) throw new Error("Unterminated reply string");
      output += '"' + value + '"';
      previous = '"';
      continue;
    }
    if (c === "," && /^\s*[}\]]/.test(source.slice(i + 1))) continue;
    if ((previous === "{" || previous === ",") && /[A-Za-z_]/.test(c)) {
      const key = source.slice(i).match(/^([A-Za-z_][A-Za-z_0-9]*)\s*:/);
      if (key) { output += JSON.stringify(key[1]) + ":"; previous = ":"; i += key[0].length - 1; continue; }
    }
    output += c;
    if (!/\s/.test(c)) previous = c;
  }
  return output;
}
