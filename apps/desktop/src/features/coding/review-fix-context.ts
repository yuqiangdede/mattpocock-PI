import { skillHandoff } from "./skill-handoff.ts";

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
  const initial = skillHandoff("", last.content ?? "", 350);
  const discussion = messages.slice(end).filter(message => (message.role === "user" || (message.role === "assistant" && message.status === "complete" && !message.isError)) && message.content);
  const latestUser = discussion.findLast(message => message.role === "user");
  const latestAnswer = discussion.findLast(message => message.role === "assistant");
  const followup = skillHandoff(latestUser?.content ?? "", latestAnswer?.content ?? "", 240);
  return [initial, followup].filter(Boolean).join("\n\n");
}
