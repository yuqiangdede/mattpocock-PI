import assert from "node:assert/strict";
import test from "node:test";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const server = await createServer({
  root: dirname(here),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const domain = await server.ssrLoadModule("/src/features/coding/grill-workspace-model.ts");
  const {
    newGrill, parseGrillReply, applyGrillReply, decideGrillQuestion,
    loadGrill, saveGrill, grillPrompt,
    canAutoRetryGrill,
    setGrillCustomAnswer, summaries,
    grillNavigation, acceptGrillRecommendations,
  } = domain;

  const op = (kind = "round", questionId) => ({
    id: "req-123", kind, questionId, text: "Why?", submittedAt: "2026-10-13T01:00:00.000Z",
  });
  const payload = (body) => `<grill-workspace-result>${JSON.stringify(body)}</grill-workspace-result>`;
  const questions = () => payload({ requestId: "req-123", kind: "questions", questions: [
    { title: "Where?", body: "Storage for decisions", multi: false, recommended: ["B"], why: "Durable querying",
      options: [{ key: "A", label: "Files" }, { key: "B", label: "SQLite" }] },
    { title: "Who?", body: "Who confirms?", multi: true, recommended: ["A", "B"], why: "Both roles",
      options: [{ key: "A", label: "Owner" }, { key: "B", label: "Reviewer" }] },
  ] });
  const ready = () => {
    const state = newGrill("session-1", "Reliability");
    state.pending = op();
    return applyGrillReply(state, parseGrillReply(questions(), op()));
  };
  test("automatic retries require a completed current attempt and stop after three", () => {
    const attempt = op();
    const result = {status:"completed",finishedAt:Date.parse(attempt.submittedAt)+1};
    for (const retryCount of [0,1,2]) assert.equal(canAutoRetryGrill({...attempt,retryCount},result,false),true);
    assert.equal(canAutoRetryGrill({...attempt,retryCount:3},result,false),false);
    assert.equal(canAutoRetryGrill(attempt,result,true),false);
    assert.equal(canAutoRetryGrill(attempt,{...result,status:"failed"},false),false);
    assert.equal(canAutoRetryGrill(attempt,{...result,finishedAt:0},false),false);
    assert.equal(canAutoRetryGrill(attempt,undefined,false),false);
  });
  test("navigation guides settled rounds to next and exhausted rounds to finish", () => {
    let state = ready();
    assert.deepEqual(grillNavigation(state), { next: false, finish: false });
    state = acceptGrillRecommendations(state);
    assert.deepEqual(grillNavigation(state), { next: true, finish: false });
    assert.deepEqual(grillNavigation({ ...state, noMoreQuestions: true }), { next: false, finish: true });
    for (const blocked of [{ ...state, pending: op() }, { ...state, finished: true }]) {
      assert.deepEqual(grillNavigation(blocked), { next: false, finish: false });
    }
    assert.deepEqual(grillNavigation({ ...state, noMoreQuestions: true, questions: ready().questions }), { next: false, finish: false });
    assert.deepEqual(grillNavigation({ ...state, questions: Array.from({ length: 100 }, (_, index) => ({ ...state.questions[0], id: `q${index + 1}` })) }), { next: false, finish: true });
  });
  test("automatic acceptance preserves confirmed decisions and accepts valid single and multiple recommendations", () => {
    const original = ready();
    const accepted = acceptGrillRecommendations(original);
    assert.deepEqual(accepted.questions.map(q => q.selected), [["B"], ["A", "B"]]);
    assert.ok(accepted.questions.every(q => q.status === "confirmed"));
    const manual = decideGrillQuestion(decideGrillQuestion(original, "q1", "select", ["A"]), "q1", "confirm");
    assert.deepEqual(acceptGrillRecommendations(manual).questions[0].selected, ["A"]);
    const deferred = decideGrillQuestion(original, "q1", "defer");
    assert.equal(acceptGrillRecommendations(deferred).questions[0].status, "confirmed");
    for (const recommended of [[], ["OTHER"], ["Z"], ["A", "B"]]) {
      const invalid = { ...original, questions: [{ ...original.questions[0], recommended }] };
      assert.equal(acceptGrillRecommendations(invalid), invalid);
    }
    for (const blocked of [{ ...original, pending: op() }, { ...original, finished: true }]) {
      assert.equal(acceptGrillRecommendations(blocked), blocked);
    }
  });

  test("model responses require a matching action id and validated payload", () => {
    assert.equal(parseGrillReply(questions(), { ...op(), id: "another" }), null);
    assert.equal(parseGrillReply(questions().replace("<grill-workspace-result>", ""), op()).kind, "questions");
    assert.equal(parseGrillReply(payload({ requestId: "req-123", kind: "questions", questions: [
      { title: "Invalid", body: "...", options: [{ key: "A", label: "Only" }], recommended: ["A"] },
    ] }), op()), null);
    const result = parseGrillReply(questions(), op());
    assert.equal(result.kind, "questions");
    assert.equal(result.questions.length, 2);
  });

  test("bare JSON follow-up replies retain request and question correlation", () => {
    const body = { requestId: "req-123", kind: "discussion", questionId: "q1", reply: "Database field: event_serial_no" };
    assert.deepEqual(parseGrillReply(JSON.stringify(body), op("discuss", "q1")), body);
    assert.equal(parseGrillReply(JSON.stringify(body), { ...op("discuss", "q1"), id: "other" }), null);
    assert.equal(parseGrillReply(JSON.stringify(body), op("discuss", "q2")), null);
    assert.deepEqual(parseGrillReply("Prose " + JSON.stringify(body), op("discuss", "q1")), body);
    assert.equal(parseGrillReply(JSON.stringify({ ...body, reply: "" }), op("discuss", "q1")), null);
  });
  test("minor formatting errors are repaired without changing reply content", () => {
    const expected = op("discuss", "q1");
    const body = {requestId:"req-123",kind:"discussion",questionId:"q1",reply:"Field {event_serial_no}, path C:\\data\\file.json"};
    const json = JSON.stringify(body);
    for (const text of ["```json\n"+json+"\n```", "Explanation before\n"+json+"\nExplanation after",
      json.replace(/}$/,",}"), "<grill-workspace-result>"+json,
      "{request_id:'req-123', question_id:'q1', reply:'数据库字段是 event_serial_no',}"] ) {
      const actual = parseGrillReply(text,expected);
      assert.ok(actual,text);
      assert.equal(actual.requestId,"req-123"); assert.equal(actual.questionId,"q1");
    }
    assert.deepEqual(parseGrillReply("```json\n"+json+"\n```",expected),body);
    assert.equal(parseGrillReply('{"requestId":"req-123","questionId":"q1","reply":"First line\nSecond line"}',expected).reply,"First line\nSecond line");
    const scalar = questions().replace('"recommended":["B"]','"recommended":"B"');
    assert.deepEqual(parseGrillReply(scalar,op()).questions[0].recommended,["B"]);
  });
  test("repair rejects ambiguous, conflicting, truncated and uncorrelated payloads", () => {
    const expected = op("discuss", "q1");
    const json = JSON.stringify({requestId:"req-123",kind:"discussion",questionId:"q1",reply:"Answer"});
    assert.equal(parseGrillReply(json+"\n"+json,expected),null);
    assert.equal(parseGrillReply(json.slice(0,-1),expected),null);
    assert.equal(parseGrillReply("{request_id:'wrong',question_id:'q1',reply:'Answer',}",expected),null);
    assert.equal(parseGrillReply("{requestId:'req-123',request_id:'wrong',questionId:'q1',reply:'Answer'}",expected),null);
    assert.equal(parseGrillReply("{requestId:'req-123',questionId:'q1',question_id:'q2',reply:'Answer'}",expected),null);
    assert.equal(parseGrillReply("{questionId:'q1',reply:'Answer'}",expected),null);
    assert.equal(parseGrillReply("{requestId:'req-123',questionId:'q1',reply:process.exit()}",expected),null);
    assert.equal(parseGrillReply("x".repeat(65_537)+json,expected),null);
  });

  test("new questions get stable unique identifiers and preserve previous state", () => {
    const s = ready();
    assert.deepEqual(s.questions.map(q => q.id), ["q1", "q2"]);
    assert.equal(s.round, 1);
    assert.equal(s.pending, null);
    assert.deepEqual(s.questions[0].recommended, ["B"]);
    assert.deepEqual(s.questions[1].recommended, ["A", "B"]);
    assert.equal(applyGrillReply(s, parseGrillReply(questions(), op())), s);
  });
  test("custom alternatives require text, survive confirmation and cannot be overridden by discussion", () => {
    let state = decideGrillQuestion(ready(),"q1","select",["OTHER"]);
    assert.equal(decideGrillQuestion(state,"q1","confirm").questions[0].status,"open");
    state = setGrillCustomAnswer(state,"q1","Search both fields with separate controls");
    state = decideGrillQuestion(state,"q1","confirm");
    assert.equal(state.questions[0].status,"confirmed");
    assert.match(summaries(state),/Other: Search both fields/);
    assert.equal(setGrillCustomAnswer(state,"q1","Overwrite").questions[0].customAnswer,state.questions[0].customAnswer);
    const multi = decideGrillQuestion(state,"q2","select",["A","OTHER"]);
    assert.deepEqual(multi.questions[1].selected,["A","OTHER"]);
    assert.equal(multi.questions[0].customAnswer,state.questions[0].customAnswer);
  });
  test("empty next rounds explicitly record no more questions and retain decisions", () => {
    const original = ready();
    const state = {...original,pending:op()};
    const exhausted = applyGrillReply(state,{requestId:op().id,kind:"questions",questions:[]});
    assert.equal(exhausted.noMoreQuestions,true);
    assert.equal(exhausted.pending,null);
    assert.deepEqual(exhausted.questions,original.questions);
    const renewed = applyGrillReply({...exhausted,pending:op()},parseGrillReply(questions(),op()));
    assert.equal(renewed.noMoreQuestions,false);
  });

  test("choices are not confirmed by selecting or discussing", () => {
    let s = ready();
    s = decideGrillQuestion(s, "q1", "select", ["A"]);
    assert.equal(s.questions[0].status, "open");
    s = decideGrillQuestion(s, "q1", "confirm");
    assert.equal(s.questions[0].status, "confirmed");
    assert.deepEqual(s.questions[0].selected, ["A"]);
    const discussOp = op("discuss", "q1");
    s.pending = discussOp;
    const reply = parseGrillReply(payload({
      requestId: "req-123", kind: "discussion", questionId: "q1", reply: "Files are simpler, with weaker concurrent writes.",
    }), discussOp);
    s = applyGrillReply(s, reply);
    assert.equal(s.questions[0].status, "confirmed");
    assert.deepEqual(s.questions[0].selected, ["A"]);
    assert.equal(s.questions[0].thread.length, 1);
    assert.equal(s.questions[1].thread.length, 0);
  });

  test("discussion reply cannot mutate another question", () => {
    const s = ready();
    s.pending = op("discuss", "q1");
    assert.equal(parseGrillReply(payload({
      requestId: "req-123", kind: "discussion", questionId: "q2", reply: "Nope",
    }), s.pending), null);
    assert.equal(parseGrillReply(payload({
      requestId: "req-123", kind: "discussion", questionId: "q1", reply: "Let's compare.",
    }), s.pending).questionId, "q1");
  });

  test("deferred and reopened decisions keep their historical choice", () => {
    let s = ready();
    s = decideGrillQuestion(s, "q2", "select", ["A", "B"]);
    s = decideGrillQuestion(s, "q2", "defer");
    assert.equal(s.questions[1].status, "deferred");
    s = decideGrillQuestion(s, "q2", "reopen");
    assert.equal(s.questions[1].status, "open");
    assert.deepEqual(s.questions[1].selected, ["A", "B"]);
  });

  test("structured prompts carry the request identity and question-specific context", () => {
    const s = ready();
    const prompt = grillPrompt(s, op("discuss", "q1"));
    assert.match(prompt, /req-123/);
    assert.match(prompt, /question q1/);
    assert.match(prompt, /Never replace confirmed choices/);
    assert.match(prompt, /Do not compile, build or package/);
    assert.match(prompt, /grill-workspace-result/);
  });

  test("versioned local state resumes a pending request without losing decisions", () => {
    const cells = new Map();
    const original = globalThis.localStorage;
    globalThis.localStorage = {
      setItem: (key, value) => { cells.set(key, value); },
      getItem: key => cells.get(key) ?? null,
    };
    try {
      const s = ready();
      s.pending = op("discuss", "q2");
      assert.equal(saveGrill(s), true);
      const recovered = loadGrill("session-1");
      assert.equal(recovered.pending.questionId, "q2");
      assert.equal(recovered.questions[1].id, "q2");
      assert.equal(loadGrill("wrong-session"), null);
      cells.set("mattpocock.pi.native-grill.v1.session-1", '{"version":1,"sessionId":"session-1","topic":"x","questions":[{"id":"bad"}]}');
      assert.equal(loadGrill("session-1"), null);
    } finally {
      if (original === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = original;
    }
  });

  test("finished response requires matching operation and keeps its note", () => {
    const s = ready();
    s.pending = op("finish");
    const response = parseGrillReply(payload({ requestId: "req-123", kind: "finished", note: "docs/reliability-design.md" }), s.pending);
    const done = applyGrillReply(s, response);
    assert.equal(done.finished, true);
    assert.equal(done.finishNote, "docs/reliability-design.md");
    assert.equal(done.pending, null);
  });
} finally {
  await server.close();
}
