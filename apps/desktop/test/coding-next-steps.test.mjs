import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const server = await createServer({ root: dirname(dirname(fileURLToPath(import.meta.url))), configFile: false,
  resolve: { alias: { "@pi-desktop/shared": fileURLToPath(new URL("../../../packages/shared/src/index.ts", import.meta.url)), "@pi-desktop/i18n": fileURLToPath(new URL("../../../packages/i18n/src/index.ts", import.meta.url)) } },
  server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom", optimizeDeps: { noDiscovery: true } });
try {
  const { codingNextSteps } = await server.ssrLoadModule("/src/features/coding/coding-next-steps.ts");
  const { startGrillFromComposer } = await server.ssrLoadModule("/src/features/coding/grill-composer-start.ts");
  const { skillHandoff } = await server.ssrLoadModule("/src/features/coding/skill-handoff.ts");
  const { buildSkillShortcutDraft } = await server.ssrLoadModule("/src/features/chat/composer/skill-shortcut-draft.ts");
  const { catalogs } = await server.ssrLoadModule("../../packages/i18n/src/index.ts");
  test("launcher handoffs preserve the user goal after localized default instructions", () => {
    for (const catalog of Object.values(catalogs)) {
      const command = buildSkillShortcutDraft("skill:to-spec", catalog.coding.prompts.spec, "Add offline search");
      const context = codingNextSteps([{role:"user",command,content:"Expanded Skill"},{role:"assistant",status:"complete",content:"Artifact: docs/search.md"}]).context;
      assert.match(context,/Add offline search/);
      assert.ok(!context.includes(catalog.coding.prompts.spec));
    }
  });
  test("custom launcher prompts are removed exactly while manual constraints retain the goal", () => {
    const prompt = "Prepare a specification\nwith my custom rules";
    const command = buildSkillShortcutDraft("skill:to-spec", prompt, "Add offline search");
    const reply = {role:"assistant",status:"complete",content:"Saved docs/search.md"};
    assert.match(codingNextSteps([{role:"user",command},reply],undefined,false,[prompt]).context,/Add offline search/);
    assert.doesNotMatch(codingNextSteps([{role:"user",command},reply],undefined,false,[prompt]).context,/custom rules/);
    assert.match(codingNextSteps([{role:"user",command:"/skill:to-spec Add offline search\n\nKeep storage local."},reply]).context,/Add offline search/);
    for (const catalog of Object.values(catalogs)) {
      const command = buildSkillShortcutDraft("skill:to-spec", catalog.coding.prompts.spec, "") + "\n\n" + catalog.codingActions.noCompilePrompt;
      assert.equal(codingNextSteps([{role:"user",command},reply]).context,"- Saved docs/search.md");
    }
  });
  test("small review budgets retain a heading's conclusion after large earlier facts", () => {
    const summary = skillHandoff("", "Confirmed: " + "x".repeat(180) + "\nArtifact: " + "y".repeat(180) + "\n## Remaining risks\nNone.", 350);
    assert.match(summary,/risks[^\n]*None\./);
    assert.ok(Array.from(summary).length<=350);
  });
  test("prioritized headings retain their conclusions", () => {
    const context = skillHandoff("Add search", ["## Confirmed decisions","Use the local index.",
      "## Artifact", "docs/search.md", "## Remaining risks", "- None."].join("\n"));
    assert.match(context,/Remaining risks[^\n]*None\./);
  });
  test("literal globs and asterisks survive cleanup", () => {
    assert.match(skillHandoff("", "Confirmed: update `apps/**/*.test.ts` and a*b."),/apps\/\*\*\/\*\.test\.ts/);
    assert.match(skillHandoff("", "Confirmed: update `apps/**/*.test.ts` and a*b."),/a\*b/);
  });
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
  test("repair to review drafts inspect current changes without recycling repair commands or stale findings", () => {
    for (const [language, heading] of [["zh-CN", "修复审查问题"], ["en", "Fix code review findings"]]) {
      const transcript = [{role:"user",content:heading+"\n\nVerify the latest review"},
        {role:"assistant",status:"complete",content:"[P2] STALE_FINDING\nUnresolved: OLD_STATUS"}];
      const recommendation = codingNextSteps(transcript, completed);
      assert.deepEqual(recommendation.steps,["code-review"]);
      const draft = buildSkillShortcutDraft("skill:code-review", catalogs[language].coding.prompts.review, recommendation.context);
      assert.doesNotMatch(draft,/修复审查问题|Fix code review findings|STALE_FINDING|OLD_STATUS/);
      assert.match(recommendation.context,language === "en" ? /changed files.*diff/i : /修改.*文件.*差异/);
      assert.match(recommendation.context,language === "en" ? /original requirements/i : /原始需求/);
    }
  });
  test("completed engineering actions expose the requested optional chain and outcome context", () => {
    for (const [skill, expected] of Object.entries({"to-spec":["to-tickets","implement"],"to-tickets":["implement"],implement:["code-review"],"code-review":["review-fix"]})) {
      assert.deepEqual(codingNextSteps(messages(skill), completed), {steps:expected,context:"- Do this\n- docs/spec.md"});
    }
  });
  test("handoffs extract a short goal and final facts without copying progress, code or duplicates", () => {
    const transcript = [{role:"user",command:"/skill:to-spec Add offline search",content:"Expanded Skill"},
      {role:"assistant",content:"PROCESS_ONLY ".repeat(1000)},
      {role:"tool",content:"TOOL_ONLY"},
      {role:"assistant",status:"complete",content:[
        "Background explanation ".repeat(500),
        "Confirmed: use the local index.", "Artifact: docs/search.md", "Artifact: docs/search.md",
        "Pending: confirm the retention period.", "```ts", "CODE_ONLY", "```",
      ].join("\n")}];
    const {context, steps} = codingNextSteps(transcript, completed);
    assert.deepEqual(steps,["to-tickets","implement"]);
    assert.ok(Array.from(context).length <= 600);
    assert.match(context,/Add offline search/);
    assert.match(context,/Confirmed: use the local index/);
    assert.match(context,/docs\/search.md/);
    assert.match(context,/Pending: confirm/);
    assert.equal(context.match(/docs\/search.md/g).length,1);
    assert.doesNotMatch(context,/PROCESS_ONLY|TOOL_ONLY|CODE_ONLY|Background explanation|Expanded Skill/);
    const repeated = codingNextSteps([{role:"user",content:"/skill:implement Continue\n\n"+context},
      {role:"assistant",status:"complete",content:"Implemented docs/search.md"}],completed).context;
    assert.doesNotMatch(repeated,/Pending: confirm/);
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
    assert.deepEqual(codingNextSteps(transcript,undefined),{steps:["to-tickets","implement"],context:"- Finalize the agreed requirements\n- Updated and reread .scratch/project/spec.md"});
  });
} finally { await server.close(); }
