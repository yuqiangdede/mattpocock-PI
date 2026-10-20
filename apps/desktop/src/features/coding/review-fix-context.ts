import { reviewHandoff } from "./review-handoff.ts";
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
  // Reserve room for the localized notice within the 600-character handoff.
  // Never attach an older turn's answer to the latest clarification.
  const discussion = messages.slice(end);
  const latestUserIndex = discussion.findLastIndex(message => message.role === "user");
  const latestUser = discussion[latestUserIndex];
  const latestAnswer = discussion.slice(latestUserIndex + 1).findLast(message =>
    message.role === "assistant" && message.status === "complete" && !message.isError && message.content
  );
  const followup = skillHandoff(latestUser?.content ?? "", latestAnswer?.content ?? "", 150);
  return [reviewHandoff(last.content ?? ""), followup].filter(Boolean).join("\n\n");
}
