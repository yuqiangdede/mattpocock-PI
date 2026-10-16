import assert from "node:assert/strict";
import test from "node:test";
import { completedReviewContext } from "../src/features/coding/review-fix-context.ts";
const review = { role: "user", command: "/skill:code-review Inspect changes", content: "Expanded review instructions" };
const answer = { role: "assistant", status: "complete", content: "[P1] Lost updates in save.ts" };
test("repair starts locked and requires a completed real review request", () => {
  for (const messages of [[], [review], [review, {...answer,status:"streaming"}], [review,{...answer,status:"error"}], [{role:"user",content:"Please explain /code-review"},answer]]) assert.equal(completedReviewContext(messages), null);
  assert.match(completedReviewContext([review,answer]), /Lost updates/);
  assert.equal(completedReviewContext([review,answer], undefined, true), null);
});
test("review discussion is retained across followups and tool output is excluded", () => {
  const context = completedReviewContext([review,answer,{role:"tool",content:"private tool dump"},{role:"user",content:"Also check cancellation"},{...answer,content:"[P2] Missing cancellation cleanup"}]);
  assert.match(context, /Lost updates/); assert.match(context, /Also check cancellation/); assert.match(context, /Missing cancellation/); assert.doesNotMatch(context,/private tool dump/);
});
test("the latest review supersedes earlier findings and locks until finished", () => {
  assert.equal(completedReviewContext([review,answer,review]), null);
  const context = completedReviewContext([review,answer,review,{...answer,content:"No findings"}]);
  assert.match(context,/No findings/); assert.doesNotMatch(context,/Lost updates/);
});
test("only the matching terminal turn may qualify a legacy statusless response", () => {
  const user = {...review,createdAt:new Date(2000).toISOString()};
  const reply = {...answer,status:undefined};
  assert.equal(completedReviewContext([user,reply],{status:"completed",finishedAt:1000}),null);
  assert.match(completedReviewContext([user,reply],{status:"completed",finishedAt:3000}),/Lost updates/);
  assert.equal(completedReviewContext([user,reply,{role:"user",content:"Other"}],{status:"completed",finishedAt:3000}),null);
});
test("large discussions keep original findings and recent clarification within a bound", () => {
  const context = completedReviewContext([review,answer,{role:"user",content:"x".repeat(20000)},{...answer,content:"Latest clarification"}]);
  assert.ok(context.length<=12000); assert.match(context,/Lost updates/); assert.match(context,/Latest clarification/);
});

test("repair prompt summarizes and deduplicates review discussion before fixes", async () => {
  const { reviewFixPrompt } = await import("../src/features/coding/review-fix-prompt.ts");
  assert.match(reviewFixPrompt("zh-CN"), /先汇总.*后续讨论/);
  assert.match(reviewFixPrompt("zh-CN"), /去重合并/);
  assert.match(reviewFixPrompt("en"), /First summarize.*follow-up discussion/);
  assert.match(reviewFixPrompt("en"), /Deduplicate/);
});
