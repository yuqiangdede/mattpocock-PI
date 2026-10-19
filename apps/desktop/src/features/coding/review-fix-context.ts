type ReviewMessage = { role?: string; content?: string; command?: string; status?: string; isError?: boolean; createdAt?: string };

/** Derive availability from this session's actual review transcript, never from clicking a shortcut. */
export function completedReviewContext(messages: readonly ReviewMessage[], result?: { status: string; finishedAt: number }, running = false): string | null {
  if (running) return null;
  let start = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === "user" && /^\s*\/(?:skill:)?code-review(?=\s|$)/.test(message.command ?? message.content ?? "")) { start = i; break; }
  }
  if (start < 0) return null;
  let end = start + 1;
  while (end < messages.length && messages[end].role !== "user") end++;
  const replies = messages.slice(start + 1, end).filter(message => message.role === "assistant" && message.content);
  const last = replies.at(-1);
  if (!last || last.isError || ["error", "aborted", "streaming"].includes(last.status ?? "")) return null;
  if (last.status !== "complete") {
    const createdAt = Date.parse(messages[start].createdAt ?? "");
    if (end !== messages.length || result?.status !== "completed" || !Number.isFinite(createdAt) || createdAt > result.finishedAt) return null;
  }
  // Preserve the full review. Fit recent discussion as whole paragraphs, never
  // shorten findings or manufacture ellipses. Omitted discussion stays in history.
  const discussion = messages.slice(end).filter(message =>
    message.role === "user" || (message.role === "assistant" && message.status === "complete" && !message.isError)
  );
  const paragraphs = discussion.flatMap(message => (message.content ?? "").split(/\r?\n\s*\r?\n/)).filter(Boolean);
  const recent: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs.reverse()) {
    const size = Array.from(paragraph).length + (recent.length ? 2 : 0);
    if (length + size > 600) break;
    recent.unshift(paragraph);
    length += size;
  }
  return [last.content ?? "", recent.join("\n\n")].filter(Boolean).join("\n\n");
}
