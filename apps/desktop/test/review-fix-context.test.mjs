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
test("large discussions are summarized with their latest reply", () => {
  const context = completedReviewContext([review,answer,{role:"user",content:"x".repeat(20000)},{...answer,content:"Latest clarification"}]);
  assert.ok(Array.from(context).length <= 502); assert.ok(!context.includes("x".repeat(20000))); assert.match(context,/Lost updates/); assert.match(context,/Latest clarification/);
});

test("repair prompt stays concise while preserving verification and follow-up context", async () => {
  const { reviewFixPrompt } = await import("../src/features/coding/review-fix-prompt.ts");
  assert.ok(reviewFixPrompt("zh-CN").length <= 200);
  assert.match(reviewFixPrompt("zh-CN"), /后续讨论/);
  assert.match(reviewFixPrompt("zh-CN"), /核实/);
  assert.ok(reviewFixPrompt("en").length <= 650);
  assert.match(reviewFixPrompt("en"), /follow-up discussion/);
  assert.match(reviewFixPrompt("en"), /Verify/);
});

test("handoff extracts findings without copying fenced evidence or progress", () => {
  const content = ["Background ".repeat(100), "More background ".repeat(100),
    "[P1] Fix save.ts: cancellation leaks a subscription.", "~~~ts", "PRIVATE_CODE"].join("\n");
  const context = completedReviewContext([review,{role:"assistant",content:"PROGRESS_ONLY"},{...answer,content}]);
  assert.match(context,/\[P1\] Fix save.ts/);
  assert.doesNotMatch(context,/PRIVATE_CODE|PROGRESS_ONLY/);
  assert.ok(!context.includes("Background ".repeat(100)));
  assert.ok(Array.from(context).length <= 600);
});

test("bounded Unicode excerpts preserve numeric and relative-path prefixes", () => {
  const context = completedReviewContext([review,{...answer,content:"2026 compatibility decision\n.scratch/spec.md\nPending: " + "😀".repeat(900)}]);
  assert.ok(Array.from(context).length <= 600);
  assert.ok(!context.includes("😀".repeat(900)));
  assert.match(context,/2026 compatibility/);
  assert.match(context,/\.scratch\/spec.md/);
  assert.doesNotMatch(context,/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test("completed structured reviews keep repair available without copying JSON", () => {
  const context = completedReviewContext([review,{...answer,content:'```json\n{"findings":[]}\n```'}]);
  assert.notEqual(context,null);
  assert.doesNotMatch(context, /```|[{}]/);
});

test("unanswered clarifications exclude stale answers and failed replies", () => {
  for (const tail of [[], [{...answer,status:"error",isError:true,content:"Failed"}], [{...answer,status:"streaming",content:"Incomplete"}]]) {
    const context = completedReviewContext([review,answer,{role:"user",content:"Should we keep cloud sync?"},
      {...answer,content:"Confirmed: keep cloud sync."}, {role:"user",content:"Correction: disable cloud sync."},...tail]);
    assert.match(context,/Correction: disable cloud sync/);
    assert.doesNotMatch(context,/Confirmed: keep cloud sync|Failed|Incomplete/);
  }
});

test("repair summarizes long findings and the latest clarification", () => {
  const findings = Array.from({length: 8}, (_, i) => `[P2] Finding ${i}: ${"Detailed evidence ".repeat(25)}END_${i}`).join("\n\n");
  const context = completedReviewContext([review,{...answer,content:findings},
    {role:"user",content:"Keep the confirmed concurrency boundary."},
    {...answer,content:"Confirmed: do not change that boundary."},
    {role:"user",content:"Also preserve the failure stage."}]);
  assert.ok(!context.includes(findings));
  assert.match(context,/\[P2\] Finding 0/);
  assert.ok(Array.from(context).length <= 502);
  assert.match(context,/Also preserve the failure stage/);
  assert.match(context,/…/);
});

test("review and discussion share a concise handoff budget", () => {
  const fullReview = "[P1] " + "Evidence ".repeat(200);
  const old = "Earlier qualification ".repeat(20);
  const latest = "Latest correction ".repeat(20);
  const context = completedReviewContext([review,{...answer,content:fullReview},
    {role:"user",content:old},{...answer,content:latest}]);
  assert.ok(!context.includes(fullReview));
  assert.match(context,/\[P1\]/);
  assert.match(context,/Latest correction/);
  assert.ok(!context.includes(latest));
  assert.ok(!context.includes(old));
  assert.ok(Array.from(context).length <= 502);
});

test("review then clarification prepares a concise editable repair draft", async () => {
  const { buildCommitCodeDraft } = await import("../src/features/coding/commit-code-draft.ts");
  const { reviewFixPrompt } = await import("../src/features/coding/review-fix-prompt.ts");
  const fullReview = Array.from({length: 7}, (_, i) => `[P2] Finding ${i}: ${"Evidence ".repeat(30)}END_${i}`).join("\n\n");
  const transcript = [review,{...answer,content:fullReview}];
  assert.equal(completedReviewContext([review]),null);
  transcript.push({role:"user",content:"Keep the confirmed concurrency boundary."});
  const context = completedReviewContext(transcript);
  const existing = "My unsent draft";
  const draft = buildCommitCodeDraft(reviewFixPrompt("en"), [context,existing].join("\n\n"));
  assert.ok(!draft.includes(fullReview));
  assert.match(draft,/\[P2\] Finding 0/);
  assert.ok(draft.includes("Keep the confirmed concurrency boundary."));
  assert.ok(draft.endsWith(existing));
  assert.match(draft,/…/);
});

test("an oversized recent correction is summarized instead of exposing older advice", () => {
  const context = completedReviewContext([review,answer,
    {role:"user",content:"Old advice"},{role:"user",content:"Correction ".repeat(100)}]);
  assert.match(context,/Correction/);
  assert.doesNotMatch(context,/Old advice/);
  assert.ok(Array.from(context).length <= 502);
});

test("structured findings retain titles and locations without copying long bodies", () => {
  const content = JSON.stringify({findings:[{title:"[P1] Lost update",body:"Long evidence ".repeat(500),code_location:{absolute_file_path:"/src/save.ts",line_range:{start:42,end:45}}}],overall_correctness:"patch is incorrect"});
  for (const source of [content, "```json\n" + content + "\n```", "~~~json\n" + content + "\n~~~"]) {
    const context = completedReviewContext([review,{...answer,content:source}]);
    assert.match(context,/\[P1\] Lost update.*\/src\/save\.ts:42/);
    assert.match(context,/patch is incorrect/);
    assert.doesNotMatch(context,/Long evidence|[{}]/);
    assert.ok(Array.from(context).length <= 600);
  }
});

test("unsupported fenced reviews keep availability without manufacturing conclusions", () => {
  for (const content of ["```ts\nPRIVATE_CODE\n```",'```json\n{"findings":"unknown"}\n```']) {
    assert.equal(completedReviewContext([review,{...answer,content}]), "");
  }
});
