import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const server = await createServer({ root: dirname(dirname(fileURLToPath(import.meta.url))), configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true } });
try {
  const { codingNextSteps } = await server.ssrLoadModule("/src/features/coding/coding-next-steps.ts");
  const { startGrillFromComposer } = await server.ssrLoadModule("/src/features/coding/grill-composer-start.ts");
  test("external topic admission preserves draft and only opens an accepted checkpoint", async () => {
    const previous = globalThis.localStorage;
    const writes = [];
    globalThis.localStorage = {setItem: (key,value) => writes.push(JSON.parse(value))};
    try {
      const draft = {text:"External topic",fileReferences:[{id:"file",path:"context.md"}]};
      let opened = 0, captured = "";
      const args = ["External topic with attachment context",draft,undefined,id=>{captured=id;}];
      assert.equal(await startGrillFromComposer(async()=>false,args,()=>opened++,()=>assert.fail("storage")),false);
      assert.equal(writes.length,0);
      assert.equal(opened,0);
      await startGrillFromComposer(async(content,retained,_id,accepted)=>{
        assert.equal(retained,draft); assert.match(content,/Request ID:/); accepted("created-session"); return true;
      },args,()=>opened++,()=>assert.fail("storage"));
      assert.equal(opened,1); assert.equal(captured,"created-session");
      assert.equal(writes[0].topic,"External topic");
      assert.equal(writes[0].sessionId,"created-session");
    } finally { if(previous===undefined)delete globalThis.localStorage; else globalThis.localStorage=previous; }
  });
  const messages = skill => [{role:"user",content:`/skill:${skill} Do this`,createdAt:new Date(1000).toISOString()}, {role:"assistant",content:"docs/spec.md"}];
  const completed = {status:"completed",finishedAt:2000};
  test("review findings and unknown outcomes guide repair; only explicit clear reviews guide commit", () => {
    for (const [content, step] of [
      ["[P1] Lost updates", "review-fix"], ["Review outcome", "review-fix"],
      ["No findings.", "commit-code"], ["未发现可操作的问题。", "commit-code"],
      [JSON.stringify({findings:[],overall_correctness:"patch is correct"}), "commit-code"],
      [JSON.stringify({findings:[],overall_correctness:"patch is incorrect"}), "review-fix"],
      [JSON.stringify({findings:[],overall_correctness:"unknown"}), "review-fix"],
      [JSON.stringify({findings:[{title:"Missing cleanup"}]}), "review-fix"],
      ["No findings.\n[P2] Broken cancellation", "review-fix"],
      ["未发现严重问题，但需要修复取消逻辑。", "review-fix"],
      ["No findings.\nReview remains incomplete", "review-fix"],
    ]) {
      const transcript = [messages("code-review")[0], {role:"assistant",status:"complete",content}];
      assert.deepEqual(codingNextSteps(transcript, completed).steps, [step], content);
    }
  });
  test("plain review-fix requests return to review without accepting quoted or unrelated requests", () => {
    for (const heading of ["修复审查问题", "Fix code review findings"]) {
      const transcript = [{role:"user",content:heading+"\n\nVerify the findings"}, {role:"assistant",status:"complete",content:"Fixed and checked"}];
      assert.deepEqual(codingNextSteps(transcript,completed).steps,["code-review"]);
      assert.equal(codingNextSteps(transcript,completed,true),null);
      assert.equal(codingNextSteps([{...transcript[0],content:"Quoted: "+transcript[0].content},transcript[1]],completed),null);
    }
  });
  test("completed engineering actions expose the requested optional chain and outcome context", () => {
    for (const [skill, expected] of Object.entries({"to-spec":["to-tickets","implement"],"to-tickets":["implement"],implement:["code-review"],"code-review":["review-fix"]})) {
      assert.deepEqual(codingNextSteps(messages(skill), completed), {steps:expected,context:"docs/spec.md"});
    }
  });
  test("running, failed, cancelled, unrelated and newer user turns do not recommend", () => {
    assert.equal(codingNextSteps(messages("implement"), completed, true), null);
    for (const status of ["failed","cancelled"]) assert.equal(codingNextSteps(messages("implement"), {...completed,status}), null);
    assert.equal(codingNextSteps(messages("unknown"), completed), null);
    assert.equal(codingNextSteps([{role:"user",content:"/implement x"}],completed),null);
    assert.equal(codingNextSteps([...messages("implement"),{role:"user",content:"/implement again",createdAt:new Date(3000).toISOString()}],completed),null);
  });
  test("a complete final answer offers next steps after recovered errors and history restore", () => {
    const transcript = [...messages("to-spec").slice(0,1), {role:"tool",content:"Command failed",isError:true},
      {role:"assistant",status:"complete",content:"Specification saved to .scratch/project/spec.md",isError:false}];
    for (const result of [undefined,{status:"failed",finishedAt:2000},completed])
      assert.deepEqual(codingNextSteps(transcript,result).steps,["to-tickets","implement"]);
    assert.equal(codingNextSteps([...transcript,{role:"assistant",status:"error",isError:true,content:"Fatal failure"}],completed),null);
    assert.equal(codingNextSteps(transcript,completed,true),null);
    assert.equal(codingNextSteps([...transcript,{role:"assistant",status:"aborted",content:"Interrupted answer"}],completed),null);
  });
  test("persisted expanded Skill rows use their original command metadata", () => {
    const transcript = [{role:"user",command:"/skill:to-spec Finalize the agreed requirements",content:"<skill>Full expanded instructions</skill>\nFinalize the agreed requirements"},
      {role:"assistant",status:"complete",content:"Updated and reread .scratch/project/spec.md"}];
    assert.deepEqual(codingNextSteps(transcript,undefined),{steps:["to-tickets","implement"],context:"Updated and reread .scratch/project/spec.md"});
  });
} finally { await server.close(); }
