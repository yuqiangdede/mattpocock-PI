import { isReviewFixRequest } from "./review-fix-prompt";
import { reviewOutcome } from "./review-outcome";
export type CodingNextStep = "to-spec" | "to-tickets" | "implement" | "code-review" | "commit-code" | "review-fix";
const next: Readonly<Record<string, readonly CodingNextStep[]>> = {
  "to-spec": ["to-tickets", "implement"],
  "to-tickets": ["implement"],
  implement: ["code-review"],
  "review-fix": ["code-review"],
};

/** A successful native turn offers navigation, never proof of release acceptance. */
export function codingNextSteps(messages: readonly { role?: string; content?: string; command?: string; createdAt?: string; status?: string; isError?: boolean }[],
  result?: { status: string; finishedAt: number }, running = false) {
  if (running) return null;
  let index = messages.length - 1;
  while (index >= 0 && messages[index].role !== "user") index--;
  if (index < 0) return null;
  const user = messages[index];
  const request = user.command ?? user.content ?? "";
  const skill = isReviewFixRequest(request) ? "review-fix" : request.match(/^\s*\/(?:skill:)?(to-spec|to-tickets|implement|code-review)(?=\s|$)/)?.[1];
  if (!skill) return null;
  const replies = messages.slice(index + 1).filter(message => message.role === "assistant" && message.content);
  if (!replies.length) return null;
  const last = replies.at(-1)!;
  if (last.status !== "complete" && result && user.createdAt && Date.parse(user.createdAt) > result.finishedAt) return null;
  if (last.isError || last.status === "error" || last.status === "aborted" || last.status === "streaming") return null;
  // A final persisted answer also qualifies after recovered tool errors or history reload.
  if (result?.status !== "completed" && last.status !== "complete") return null;
  const steps: readonly CodingNextStep[] = skill === "code-review" ? [reviewOutcome(last.content ?? "") === "clear" ? "commit-code" : "review-fix"] : next[skill];
  return { steps, context: replies.map(message => message.content).join("\n\n").slice(-8000) };
}
