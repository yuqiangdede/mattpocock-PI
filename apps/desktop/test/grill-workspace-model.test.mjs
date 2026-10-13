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

  test("model responses require a matching action id and strict envelope", () => {
    assert.equal(parseGrillReply(questions(), { ...op(), id: "another" }), null);
    assert.equal(parseGrillReply(questions().replace("<grill-workspace-result>", ""), op()), null);
    assert.equal(parseGrillReply(payload({ requestId: "req-123", kind: "questions", questions: [
      { title: "Invalid", body: "...", options: [{ key: "A", label: "Only" }], recommended: ["A"] },
    ] }), op()), null);
    const result = parseGrillReply(questions(), op());
    assert.equal(result.kind, "questions");
    assert.equal(result.questions.length, 2);
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
