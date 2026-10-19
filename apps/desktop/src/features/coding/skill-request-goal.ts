import { catalogs } from "@pi-desktop/i18n";

const defaultPrompts = Object.values(catalogs).flatMap(catalog => Object.values(catalog.coding.prompts));
const guards = Object.values(catalogs).map(catalog => catalog.codingActions.noCompilePrompt);

/** Only remove exact known launcher text; never guess where a manual request ends. */
export function skillRequestGoal(request: string, customPrompts: readonly string[] = []): string {
  let text = request.replace(/^\s*\/(?:skill:)?[\w-]+[ \t]*/, "").trim();
  const prompt = [...defaultPrompts, ...customPrompts].filter(Boolean).sort((a, b) => b.length - a.length)
    .find(candidate => text === candidate || text.startsWith(candidate + "\n\n") || text.startsWith(candidate + "\r\n\r\n"));
  if (prompt) text = text.slice(prompt.length).trim();
  for (const guard of guards) {
    if (text === guard || text.endsWith("\n\n" + guard) || text.endsWith("\r\n\r\n" + guard)) text = text.slice(0, -guard.length).trim();
  }
  return text.split(/\r?\n/)[0] ?? "";
}
