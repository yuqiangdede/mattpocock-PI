import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repositoryRoot, resolveElectronBinary } from "../../../scripts/e2e/boot.mjs";

const root = repositoryRoot();
const { build } = createRequire(join(root, "packages/agent-runtime/package.json"))("esbuild");
const rendererSource = String.raw`
import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { I18nextProvider, initReactI18next } from "react-i18next";
import i18n from "i18next";
import { zhCN } from "@pi-desktop/i18n";
import { CodingActionSettingsPage } from "../../apps/desktop/src/features/extensions/CodingActionSettingsPage";
import { CodingWorkbench } from "../../apps/desktop/src/features/coding/CodingWorkbench";
import { useCodingActionLauncher } from "../../apps/desktop/src/features/coding/useCodingActionLauncher";
import { loadCodingActions } from "../../apps/desktop/src/features/extensions/coding-action-state";
import { Textarea } from "../../apps/desktop/src/components/ui";
import { useAppStore } from "../../apps/desktop/src/stores/app-store";
import { newGrill, saveGrill, loadGrill } from "../../apps/desktop/src/features/coding/grill-workspace-model";
import { api } from "../../apps/desktop/src/lib/api";
import { useGrillComposer } from "../../apps/desktop/src/features/coding/useGrillComposer";
import { interactionImagePrompt } from "../../apps/desktop/src/features/coding/interaction-image-prompt";
import "../../apps/desktop/src/styles/ui-kit.css";
import "../../apps/desktop/src/styles/base.css";
import "../../apps/desktop/src/styles/tokens.css";
import "../../apps/desktop/src/styles/coding-workbench.css";
const root = createRoot(document.getElementById("root"));
const initialDraft = "Keep my draft\nfile \uFFFC";
function DraftComposer() {
  const [draft, setDraft] = useState(initialDraft);
  const references = useRef([{ id: "retained", path: "fixture.txt" }]);
  const launcher = useCodingActionLauncher({ sessionId: null, projectPath: "", blocked: false, draftKey: "fixture",
    readLiveDraft: () => draft, invalidatePromptEnhancement() {}, fileReferencesRef: references,
    applyEditorDraft(text, files) { if (files !== references.current) throw new Error("Attachments lost"); setDraft(text); },
  });
  return <><CodingWorkbench disabled={false} error={launcher.error} onExecute={launcher.execute} onSelectSkill={launcher.selectSkill} onSelectPrompt={launcher.selectPrompt} /><Textarea aria-label="Draft" value={draft} onChange={event => setDraft(event.target.value)} /></>;
}
let externalSends = 0;
function ExternalTopicComposer() {
  const [topic, setTopic] = useState("");
  const visual = useGrillComposer(async (content, draft, sessionId, accepted) => {
    externalSends++;
    if (!content.includes("grill-workspace-result") || draft.text !== topic) throw new Error("Topic request lost");
    const id = sessionId ?? "materialized-visual";
    useAppStore.setState({activeSessionId:id,messages:[]});
    accepted(id); return true;
  }, "external-fixture", () => { throw new Error("Checkpoint failed"); });
  return <><CodingWorkbench disabled={false} error={null} onExecute={()=>{}} onSelectSkill={()=>{}} onSelectPrompt={()=>{}}
    onPrepareVisual={visual.prepare} visualStart={visual.visualStart}/>
    {visual.preparing && <span>{visual.hint}</span>}
    <Textarea aria-label="External topic" value={topic} onChange={e=>setTopic(e.target.value)}/>
    <button onClick={()=>void visual.sendPrompt(topic,{text:topic,fileReferences:[]},undefined)}>External Send</button></>;
}
const render = element => flushSync(() => root.render(<I18nextProvider i18n={i18n}>{element}</I18nextProvider>));
const field = key => document.querySelector('[aria-label="' + i18n.t("codingActions." + key) + '"]');
// Hidden Electron windows may pause animation frames; yield through the task queue.
const nextTask = () => new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = () => { channel.port1.close(); channel.port2.close(); resolve(); }; channel.port2.postMessage(null); });
const until = async (read, description = read.toString()) => { const end = performance.now() + 8000; while (performance.now() < end) { const value = await read(); if (value) return value; await nextTask(); } throw new Error("Timed out waiting for " + description + ": " + document.body.textContent); };
const click = async label => { const button = await until(() => [...document.querySelectorAll("button")].find(item => item.textContent.trim() === label && !item.disabled), "enabled button: " + label); button.click(); await nextTask(); };
const fill = async (key, value) => { const input = await until(() => field(key)); const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); await nextTask(); };
const check = (value, message) => { if (!value) throw new Error(message); };
window.promptButtonsProbe = async () => {
  await i18n.use(initReactI18next).init({ lng: "zh-CN", resources: { "zh-CN": { translation: zhCN } }, interpolation: { escapeValue: false } });
  await loadCodingActions();
  render(<CodingActionSettingsPage />);
  await until(() => field("promptName") && !field("promptName").disabled);
  check(field("promptName").value === i18n.t("codingActions.commitCode"), "Legacy default missing");
  await fill("promptName", "My commit");
  await fill("promptText", "Build first, commit with Git or SVN");
  await click(i18n.t("codingActions.save"));
  await until(() => document.body.textContent.includes(i18n.t("codingActions.saved")));
  await fill("promptName", "Unsaved name");
  await click(i18n.t("codingActions.cancel"));
  await until(() => field("promptName").value === "My commit");
  await loadCodingActions(true);
  render(<DraftComposer />);
  await until(() => document.querySelector('[aria-label="Draft"]'));
  const toolbarToggle = () => document.querySelector('.coding-shortcuts-toggle');
  check(toolbarToggle()?.getAttribute('aria-expanded') === 'true', "Toolbar starts expanded");
  const draftBeforeCollapse = document.querySelector('[aria-label="Draft"]').value;
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await until(() => document.querySelector('.coding-requirements-menu'));
  toolbarToggle().click();
  await until(() => toolbarToggle().getAttribute('aria-expanded') === 'false');
  check(!document.querySelector('.coding-shortcuts-primary') && !document.querySelector('.coding-shortcuts-secondary'), "Collapse hides both rows");
  check(!document.querySelector('.coding-requirements-menu'), "Collapse closes the open requirements menu");
  check(document.querySelector('[aria-label="Draft"]').value === draftBeforeCollapse, "Collapse retains the draft");
  toolbarToggle().click();
  await until(() => document.querySelector('.coding-shortcuts-secondary'));
  check(toolbarToggle().getAttribute('aria-expanded') === 'true', "Expand restores both rows");
  const labels = [...document.querySelectorAll('.coding-shortcuts-primary button')].map(button => button.textContent);
  check(labels.indexOf(i18n.t("codingActions.compileProject")) < labels.indexOf(i18n.t("codingActions.continueTask")), "Compile precedes Continue");
  const repairButton = () => [...document.querySelectorAll('.coding-shortcuts-primary button')].find(button => button.textContent === i18n.t("codingActions.reviewFix"));
  check(repairButton()?.disabled, "Repair starts disabled before a completed review");
  const primaryButtons = [...document.querySelectorAll('.coding-shortcuts-primary button')];
  check(primaryButtons.indexOf(repairButton()) === primaryButtons.findIndex(button => button.textContent === i18n.t("codingActions.walkthrough")) + 1, "Repair immediately follows Code review");
  await click(i18n.t("codingActions.requirementsDiscussion"));
  const visualTrigger = await until(() => [...document.querySelectorAll('.coding-requirements-menu button')].find(button => button.textContent === i18n.t("codingActions.visualRequirements")));
  check(visualTrigger.disabled, "Native visual discussion requires an existing session");
  check(document.querySelector('.coding-requirements-menu').textContent.includes(i18n.t("codingActions.discussRequirementsText")), "Text and visual modes share one dropdown");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => !document.querySelector('.coding-requirements-menu'));
  await click(i18n.t("codingActions.more"));
  const moreMenu = await until(() => document.querySelector('.coding-more-menu[role="menu"]'));
  check(![...moreMenu.querySelectorAll("button")].some(button => button.textContent === i18n.t("codingActions.discussRequirementsText")), "Discussion has a dedicated dropdown");
  check(moreMenu.textContent.includes("Create specification"), "Specification belongs in More");
  check(moreMenu.textContent.includes("Create tickets"), "Tickets belong in More");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await until(() => !document.querySelector('.coding-more-menu[role="menu"]'));
  await click("My commit");
  await until(() => document.querySelector('[aria-label="Draft"]').value === "Build first, commit with Git or SVN\n\n" + initialDraft + "\n\n" + i18n.t("codingActions.noCompilePrompt"));
  check([...document.querySelectorAll("button")].find(button => button.textContent === i18n.t("codingActions.compileProject")).nextElementSibling.textContent === i18n.t("codingActions.continueTask"), "Continue immediately follows Compile");
  await click(i18n.t("codingActions.continueTask"));
  await until(() => document.querySelector('[aria-label="Draft"]').value === i18n.t("codingActions.continuePrompt") + "\n\n" + i18n.t("codingActions.noCompilePrompt") + "\n\nBuild first, commit with Git or SVN\n\n" + initialDraft + "\n\n" + i18n.t("codingActions.noCompilePrompt"));
  check(document.querySelector(".coding-shortcuts-secondary button"), "Document shortcuts retain their separate row");
  const actionRow = document.querySelector('.coding-shortcuts-primary');
  actionRow.style.width = "360px";
  await nextTask();
  check([...actionRow.querySelectorAll('button')].every(button => button.getBoundingClientRect().right <= actionRow.getBoundingClientRect().right + 1), "Unified row wraps without horizontal overflow");
  actionRow.style.width = "";
  check([...actionRow.querySelectorAll('button')].findIndex(button => button.textContent === "My commit") < [...actionRow.querySelectorAll('button')].findIndex(button => button.textContent === i18n.t("codingActions.more")), "Commit precedes More");
  render(<CodingActionSettingsPage />);
  await until(() => field("promptText")?.value === "Build first, commit with Git or SVN");
  await click(i18n.t("codingActions.addPrompt"));
  await fill("promptName", "Summary"); await fill("promptText", "Summarize my changes");
  await click(i18n.t("codingActions.save"));
  await until(() => document.body.textContent.includes(i18n.t("codingActions.saved")));
  await loadCodingActions(true);
  render(<DraftComposer />);
  await until(() => document.querySelector('[aria-label="Draft"]'));
  await click("Summary");
  await until(() => document.querySelector('[aria-label="Draft"]').value === "Summarize my changes\n\n" + initialDraft + "\n\n" + i18n.t("codingActions.noCompilePrompt"));
  render(<DraftComposer key="compile-fixture" />);
  await click(i18n.t("codingActions.compileProject"));
  await until(() => document.querySelector('[aria-label="Draft"]').value === i18n.t("codingActions.compilePrompt") + "\n\n" + initialDraft);
  check(!document.querySelector('[aria-label="Draft"]').value.includes(i18n.t("codingActions.noCompilePrompt")), "Compile does not carry a conflicting no-build instruction");
  const originalCommands = api.composerCommands;
  api.composerCommands = async () => ({ commands: [{ kind:"skill", name:"grill-with-docs", skillId:"grill-with-docs", description:"Text interview" }] });
  render(<DraftComposer key="text-mode-fixture" />);
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.discussRequirementsText"));
  await until(() => document.querySelector('[aria-label="Draft"]').value.startsWith("/grill-with-docs"));
  check(document.querySelector('[aria-label="Draft"]').value.includes(initialDraft) && document.querySelector('[aria-label="Draft"]').value.includes(i18n.t("codingActions.noCompilePrompt")), "Text discussion preserves draft and disables compilation");
  check(!document.querySelector('.coding-requirements-menu'), "Selecting text closes the dropdown");
  api.composerCommands = originalCommands;
  render(<DraftComposer key="visual-mode-fixture" />);
  const pending = { id: "auto-open-fixture", kind: "round", text: "", submittedAt: new Date().toISOString() };
  saveGrill({ ...newGrill("visual-fixture", "Visual interview"), pending });
  useAppStore.setState({ activeSessionId: "visual-fixture", messages: [] });
  await nextTask();
  check(!document.querySelector('.grill-dialog'), "No automatic opening before a correlated reply");
  const reply = requestId => '<grill-workspace-result>' + JSON.stringify({ requestId, kind: "questions", questions: [{title:"Fixture question",body:"Choose a scope\n".repeat(160),options:[{key:"A",label:"Local"},{key:"B",label:"Remote"}],recommended:["A"],why:"Keep the first slice small",multi:false}] }) + '</grill-workspace-result>';
  useAppStore.setState({ messages: [{ role: "assistant", content: reply("unrelated") }] });
  await nextTask();
  check(!document.querySelector('.grill-dialog'), "Unrelated response must not open the panel");
  useAppStore.setState({ messages: [{ role: "assistant", content: reply(pending.id) }] });
  const panel = await until(() => document.querySelector('.grill-dialog'));
  await until(() => panel.textContent.includes("Fixture question"));
  for (const selector of ['.grill-question-detail h3', '.grill-question-scroll > p', '.grill-options .btn', '.grill-recommend p']) {
    check(getComputedStyle(panel.querySelector(selector)).webkitUserSelect === "text", "Discussion text must be selectable: " + selector);
  }
  check(panel.getBoundingClientRect().width > 800, "Visual interview must override the generic 440px dialog width");
  const interviewButton = label => [...document.querySelectorAll('.grill-meta-actions button')].find(button => button.textContent === label);
  check(interviewButton("完成访谈").disabled, "Finish must be disabled while questions remain");
  const scroll = panel.querySelector('.grill-question-scroll');
  const footer = panel.querySelector('.grill-question-footer');
  check(scroll && footer && !scroll.contains(footer), "Decision footer must be outside the question scroller");
  check(scroll.scrollHeight > scroll.clientHeight, "Long questions must scroll independently");
  const footerTop = footer.getBoundingClientRect().top;
  scroll.scrollTop = scroll.scrollHeight;
  await nextTask();
  check(scroll.scrollTop > 0 && Math.abs(footer.getBoundingClientRect().top - footerTop) < 1, "Scrolling question content must not move the footer");
  for (const label of ["确认本题", "暂缓本题"]) {
    const bounds = [...footer.querySelectorAll('button')].find(button => button.textContent === label).getBoundingClientRect();
    check(bounds.top >= footerTop && bounds.bottom <= panel.querySelector('.grill-questions').getBoundingClientRect().bottom, "Decision buttons remain visible: " + label);
  }
  await click("暂缓本题");
  await until(() => loadGrill("visual-fixture")?.questions[0].status === "deferred");
  await click("重新讨论");
  await until(() => loadGrill("visual-fixture")?.questions[0].status === "open");
  await click(i18n.t("codingActions.visualOther"));
  check([...panel.querySelectorAll('button')].find(button=>button.textContent === "确认本题").disabled, "Empty custom alternative cannot be confirmed");
  const customInput = panel.querySelector('[aria-label="'+i18n.t("codingActions.visualOtherAnswer")+'"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(customInput,"Use separate fields for name and number");
  customInput.dispatchEvent(new Event("input",{bubbles:true}));
  await nextTask();
  await click("确认本题");
  await until(() => loadGrill("visual-fixture")?.questions[0].status === "confirmed");
  check(loadGrill("visual-fixture").questions[0].customAnswer === "Use separate fields for name and number", "Custom alternative persists with confirmation");
  await click("关闭");
  await until(() => !document.querySelector('.grill-dialog'));
  useAppStore.setState({ messages: [{ role: "assistant", content: reply(pending.id) }] });
  await nextTask();
  check(!document.querySelector('.grill-dialog'), "Closing a completed reply must not reopen it");
  const followup = { id: "followup-fixture", kind: "discuss", questionId: "q1", text: "Which database field?", submittedAt: new Date().toISOString() };
  const saved = loadGrill("visual-fixture");
  saveGrill({ ...saved, pending: followup, questions: saved.questions.map(q => q.id === "q1" ? { ...q, thread: [{id:followup.id,who:"user",text:followup.text,at:followup.submittedAt}] } : q) });
  api.getSession = async () => ({ session: { messages: [{role:"user",content:followup.id}, {role:"assistant",content:"Still inspecting the schema",status:"complete"}] } });
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  await until(() => document.querySelector('.grill-pending')?.textContent.includes("没有返回有效"));
  let releaseHistory;
  api.getSession = () => new Promise(resolve => { releaseHistory = resolve; });
  useAppStore.setState({ messages: [{role:"assistant",content:"Still inspecting the schema"}] });
  await until(() => releaseHistory);
  const fence = String.fromCharCode(96).repeat(3);
  const followupReply = "Here is the result:\n" + fence + "json\n" + JSON.stringify({requestId:followup.id,kind:"discussion",questionId:"q1",reply:"The field is eventSerialNo."}).replace(/}$/, ",}") + "\n" + fence;
  useAppStore.setState({ messages: [{role:"assistant",content:followupReply}] });
  await until(() => document.querySelector('.grill-thread-log')?.textContent.includes("The field is eventSerialNo."));
  check(getComputedStyle(document.querySelector('.grill-thread-entry.agent p')).webkitUserSelect === "text", "Agent reply must be selectable");
  check(!document.querySelector('.grill-pending'), "A late valid reply clears the pending follow-up");
  releaseHistory({ session: { messages: [{role:"user",content:followup.id},{role:"assistant",content:"Old intermediate response",status:"complete"}] } });
  await nextTask();
  check(!document.querySelector('.grill-pending'), "Stale Host history must not restore an invalid result after acceptance");
  await click("关闭");
  await until(() => !document.querySelector('.grill-dialog'));
  api.composerCommands = async () => ({commands:["to-spec","to-tickets","implement","code-review"].map(skillId => ({kind:"skill",name:"skill:"+skillId,skillId}))});
  await click(i18n.t("codingActions.recheck"));
  await until(() => [...document.querySelectorAll('.coding-shortcuts-primary button')].some(button => button.textContent === "Implement" && !button.disabled));
  useAppStore.setState({messages:[{role:"user",command:"/skill:to-spec Finalize requirements",content:"<skill>Expanded specification instructions</skill>\nFinalize requirements"},{role:"tool",content:"Recovered command failure",isError:true},{role:"assistant",status:"complete",content:"PROGRESS_ONLY ".repeat(1000)},{role:"assistant",status:"complete",content:"Artifact: docs/requirements.md\nConfirmed: keep local storage.\nPending: confirm retention.\n" + fence + "ts\nCODE_ONLY\n" + fence}],latestTurnResults:{"visual-fixture":{status:"failed",turnId:"spec-turn",finishedAt:Date.now()}}});
  await until(() => document.querySelector('.coding-shortcuts-primary .coding-action-recommended[aria-haspopup="menu"]'));
  check(document.querySelectorAll('.coding-shortcuts-primary .coding-action-recommended').length === 2, "Specification highlights implementation and More");
  check(getComputedStyle(document.querySelector('.coding-shortcuts-primary .coding-action-recommended')).boxShadow !== "none", "Recommended buttons render a visible accent ring with real theme tokens");
  check(!document.querySelector('.coding-next-steps[role="group"]'), "No separate recommendation row remains");
  await click(i18n.t("codingActions.more"));
  const recommendedTickets = await until(() => [...document.querySelectorAll('.coding-more-menu .coding-action-recommended')].find(button=>button.textContent === "Create tickets"));
  recommendedTickets.click();
  await until(() => document.querySelector('[aria-label="Draft"]').value.startsWith("/skill:to-tickets "));
  check(document.querySelector('[aria-label="Draft"]').value.includes("Artifact: docs/requirements.md"), "Recommendation carries the artifact context");
  check(document.querySelector('[aria-label="Draft"]').value.includes(initialDraft), "Recommendation preserves the editable draft");
  const handoffDraft = document.querySelector('[aria-label="Draft"]').value;
  check(handoffDraft.includes("Confirmed: keep local storage.") && handoffDraft.includes("Pending: confirm retention."), "Handoff retains decisions and unresolved work");
  check(!handoffDraft.includes("PROGRESS_ONLY") && !handoffDraft.includes("CODE_ONLY"), "Handoff excludes verbose progress and code");

  useAppStore.setState({messages:[{role:"user",content:"/skill:code-review Review changes"},{role:"assistant",content:"No findings."}],latestTurnResults:{"visual-fixture":{status:"completed",turnId:"review-turn",finishedAt:Date.now()}}});
  await until(() => [...document.querySelectorAll('.coding-shortcuts-primary .coding-action-recommended')].some(button=>button.textContent === "My commit"));
  [...document.querySelectorAll('.coding-shortcuts-primary .coding-action-recommended')].find(button=>button.textContent === "My commit").click();
  await until(() => document.querySelector('[aria-label="Draft"]').value.startsWith("Build first, commit with Git or SVN"));
  check(document.querySelector('[aria-label="Draft"]').value.includes("No findings."), "Commit draft carries review evidence");
  useAppStore.setState({messages:[{role:"user",command:"/skill:code-review Review changes",content:"Expanded review instructions"},{role:"assistant",status:"complete",content:"[P1] Lost updates in save.ts"}]});
  await until(() => repairButton() && !repairButton().disabled);
  check(![...document.querySelectorAll('.coding-shortcuts-primary .coding-action-recommended')].some(button => button.textContent === "My commit"), "Review findings never recommend Commit");
  const reviewMessages = useAppStore.getState().messages;
  flushSync(() => useAppStore.setState({messages:[...reviewMessages,{role:"user",content:"Please also check cancellation"},{role:"assistant",status:"complete",content:"[P2] Missing cancellation cleanup"}]}));
  const repair = await until(() => repairButton() && !repairButton().disabled && repairButton());
  const beforeRepair = document.querySelector('[aria-label="Draft"]').value;
  repair.click();
  await until(() => document.querySelector('[aria-label="Draft"]').value.startsWith("修复审查问题\n"));
  check(document.querySelector('[aria-label="Draft"]').value.includes("[P1] Lost updates in save.ts") && document.querySelector('[aria-label="Draft"]').value.includes(initialDraft), "Repair draft carries findings and preserves existing text");
  check(document.querySelector('[aria-label="Draft"]').value.includes("Missing cancellation cleanup") && document.querySelector('[aria-label="Draft"]').value.includes("核实本会话"), "Repair summarizes findings and the follow-up discussion");
  check(document.querySelector('[aria-label="Draft"]').value.length - beforeRepair.length < 900, "Repair adds only a concise instruction and handoff");
  check(!document.querySelector('.coding-more-menu[role="menu"]'), "Repair selection closes More without sending");
  const repairRequest = document.querySelector('[aria-label="Draft"]').value;
  const beforeFencedRepair = document.querySelector('[aria-label="Draft"]').value;
  flushSync(() => useAppStore.setState({messages:[reviewMessages[0],{role:"assistant",status:"complete",content:fence + 'json\n{"findings":[{"title":"[P2] Missing cleanup"}]}\n' + fence}]}));
  check(!repairButton().disabled, "A completed fenced-only review keeps Repair enabled even with an empty summary");
  repairButton().click();
  await until(() => document.querySelector('[aria-label="Draft"]').value.length > beforeFencedRepair.length);

  useAppStore.setState({activeSessionId:"unreviewed-session",messages:[]});
  await until(() => repairButton()?.disabled);
  useAppStore.setState({activeSessionId:"visual-fixture",messages:reviewMessages});
  await until(() => repairButton() && !repairButton().disabled);
  useAppStore.setState({messages:[{role:"user",content:repairRequest},{role:"assistant",status:"complete",content:"Fixed save cancellation and regression tests pass"}]});
  await until(() => [...document.querySelectorAll('.coding-shortcuts-primary .coding-action-recommended')].some(button => button.textContent === i18n.t("codingActions.walkthrough")));
  const finished = loadGrill("visual-fixture");
  saveGrill({...finished,pending:null,finished:true,finishNote:"Design document: docs/design.md"});
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  const finishNext = await until(() => document.querySelector('.grill-dialog .coding-next-steps button'));
  finishNext.click();
  await until(() => !document.querySelector('.grill-dialog') && document.querySelector('[aria-label="Draft"]').value.startsWith("/skill:to-spec "));
  check(document.querySelector('[aria-label="Draft"]').value.includes("docs/design.md"), "Finished interview hands off the design document");
  useAppStore.setState({activeSessionId:null,messages:[]});
  render(<ExternalTopicComposer/>);
  await until(() => document.querySelector('[aria-label="External topic"]'));
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  check(externalSends === 0 && !document.querySelector('.grill-dialog'), "Preparing a visual topic must not send or open an empty dialog");
  const topicInput = document.querySelector('[aria-label="External topic"]');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(topicInput,"Search alerts by resource number");
  topicInput.dispatchEvent(new Event("input",{bubbles:true}));
  await nextTask();
  await click("External Send");
  const started = await until(() => loadGrill("materialized-visual"));
  await until(() => document.querySelector('.grill-dialog')?.textContent.includes("Search alerts by resource number"));
  check(externalSends === 1 && started.pending.kind === "round", "One manual Send starts one native interview in the materialized session");
  useAppStore.setState({messages:[{role:"assistant",content:reply(started.pending.id)}]});
  await until(() => document.querySelector('.grill-question-detail')?.textContent.includes("Fixture question"));
  await click("A. Local");
  await click("确认本题");
  const nativeBeforeRound = useAppStore.getState().sendPrompt;
  useAppStore.setState({sendPrompt:async()=>{
    const pending = loadGrill("materialized-visual").pending;
    useAppStore.setState({messages:[{role:"assistant",content:JSON.stringify({requestId:pending.id,kind:"questions",questions:[]})}]});
    return true;
  }});
  await click("下一轮问题");
  await until(() => document.querySelector('.grill-guidance[role="status"]')?.textContent.includes("无后续问题，请完成访谈"));
  check(loadGrill("materialized-visual").questions[0].status === "confirmed", "An empty next round preserves confirmed answers");
  check(interviewButton("下一轮问题").disabled && !interviewButton("完成访谈").disabled, "No further questions enables only Finish");
  await click("重新讨论");
  await until(() => loadGrill("materialized-visual").questions[0].status === "open");
  check(interviewButton("完成访谈").disabled && document.querySelector('.grill-guidance').textContent.includes("请确认或暂缓"), "Reopened questions block Finish and show decision guidance even after exhaustion");
  await click("确认本题");
  useAppStore.setState({sendPrompt:nativeBeforeRound});
  await click("关闭");
  const baseline = loadGrill("materialized-visual");
  const autoState = { ...baseline, sessionId:"automatic-fixture", noMoreQuestions:false,
    questions:[baseline.questions[0], {...baseline.questions[0],id:"q2",status:"deferred",selected:[],recommended:["B"]}] };
  saveGrill(autoState);
  let automaticRounds = 0;
  const automaticKinds = [];
  useAppStore.setState({activeSessionId:"automatic-fixture",messages:[],sendPrompt:async()=>{
    const checkpoint = loadGrill("automatic-fixture");
    const pending = checkpoint.pending;
    automaticKinds.push(pending.kind);
    check(checkpoint.questions.every(q => q.status === "confirmed"), "Automatic requests carry confirmed recommendations");
    check(checkpoint.questions[0].selected.join() === "A", "Automatic mode preserves manually confirmed answer");
    check(checkpoint.questions[1].selected.join() === "B", "Automatic mode accepts deferred recommendation");
    const content = pending.kind === "finish" ? JSON.stringify({requestId:pending.id,kind:"finished",note:"Automatic design outcome"})
      : automaticRounds++ === 0 ? reply(pending.id) : JSON.stringify({requestId:pending.id,kind:"questions",questions:[]});
    useAppStore.setState({messages:[{role:"assistant",content}]});
    return true;
  }});
  render(<DraftComposer/>);
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  await click(i18n.t("codingActions.visualAutoAccept"));
  await until(() => loadGrill("automatic-fixture")?.finished);
  check(automaticKinds.join() === "round,round,finish", "One click accepts future questions, checks exhaustion and finishes exactly once");
  await until(() => interviewButton("已完成"));
  await click("关闭");
  saveGrill({...autoState,sessionId:"automatic-stop"});
  let automaticSends = 0;
  useAppStore.setState({activeSessionId:"automatic-stop",messages:[],sendPrompt:async()=>{automaticSends++;return true;}});
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  await click(i18n.t("codingActions.visualAutoAccept"));
  await until(() => loadGrill("automatic-stop")?.pending);
  await click(i18n.t("codingActions.visualAutoStop"));
  const stoppedOperation = loadGrill("automatic-stop").pending;
  useAppStore.setState({messages:[{role:"assistant",content:JSON.stringify({requestId:stoppedOperation.id,kind:"questions",questions:[]})}]});
  await until(() => !loadGrill("automatic-stop").pending);
  check(automaticSends === 1 && !loadGrill("automatic-stop").finished, "Stopping prevents automatic finish after the pending reply");
  await click("关闭");
  saveGrill({...autoState,sessionId:"automatic-failure"});
  useAppStore.setState({activeSessionId:"automatic-failure",messages:[],sendPrompt:async()=>false});
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  await click(i18n.t("codingActions.visualAutoAccept"));
  await until(() => document.querySelector('.grill-error')?.textContent.includes("未接收请求"));
  check(!document.body.textContent.includes(i18n.t("codingActions.visualAutoStop")), "Rejected sends stop automatic mode instead of looping");
  await click("关闭");
  useAppStore.setState({sendPrompt:nativeBeforeRound});
  const originalNativeSend = useAppStore.getState().sendPrompt;
  let autoRetries = 0;
  const retryOperation = {id:"retry-original",kind:"round",text:"",submittedAt:new Date().toISOString()};
  saveGrill({...newGrill("retry-fixture","Bounded retries"),pending:retryOperation});
  api.getSession = async () => {
    const pending = loadGrill("retry-fixture").pending;
    return {session:{messages:[{role:"user",content:pending.id},{role:"assistant",content:"Invalid plain answer",status:"complete"}]}};
  };
  useAppStore.setState({activeSessionId:"retry-fixture",messages:[],latestTurnResults:{"retry-fixture":{status:"completed",turnId:"initial-invalid",finishedAt:Date.now()}},sendPrompt:async()=>{
    autoRetries++;
    useAppStore.setState({latestTurnResults:{"retry-fixture":{status:"completed",turnId:"retry-"+autoRetries,finishedAt:Date.now()}},messages:[{role:"assistant",content:"Invalid plain answer"}]});
    return true;
  }});
  await click(i18n.t("codingActions.requirementsDiscussion"));
  await click(i18n.t("codingActions.visualRequirements"));
  await until(() => document.querySelector('.grill-pending')?.textContent.includes("自动重试已达 3 次"));
  check(autoRetries === 3 && loadGrill("retry-fixture").pending.retryCount === 3, "Automatic retry stops at three and persists its budget");
  useAppStore.setState({messages:[{role:"assistant",content:"Another invalid answer"}]});
  await nextTask();
  check(autoRetries === 3, "Transcript updates cannot restart an exhausted retry budget");
  useAppStore.setState({sendPrompt:originalNativeSend});
  render(<DraftComposer key="image-menu"/>);
  await until(() => document.querySelector('[aria-label="Draft"]')?.value === initialDraft);
  check(![...document.querySelectorAll('.coding-shortcuts-primary > button')].some(button => button.textContent === i18n.t("codingActions.interactionImage")), "Image prompt is absent from the primary row");
  await click(i18n.t("codingActions.more"));
  check([...document.querySelectorAll('.coding-more-menu [role="menuitem"]')].some(button => button.textContent === i18n.t("codingActions.interactionImage")), "Image prompt is reachable as a More menu item");
  await click(i18n.t("codingActions.interactionImage"));
  await until(() => document.querySelector('[aria-label="Draft"]').value === interactionImagePrompt("zh-CN") + "\n\n" + i18n.t("codingActions.noCompilePrompt") + "\n\n" + initialDraft);
  check(!document.querySelector('.coding-more-menu[role="menu"]'), "Selecting the image prompt closes More and retains the editable draft");
  root.unmount(); return { ok: true };
};
`;

test("Electron settings save and cancel names/prompts, reload persistence, and insert plain drafts with retained attachments", {
  timeout: 120_000,
  skip: process.platform === "linux" && !process.env.DISPLAY ? "Electron requires a display" : false,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-plain-prompts-"));
  try {
    await build({ stdin: { contents: rendererSource, resolveDir: join(root, "scripts/e2e"), loader: "tsx" },
      outfile: join(directory, "renderer.js"), bundle: true, platform: "browser", format: "esm", jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"', "import.meta.env.DEV": "false" },
      alias: { "@pi-desktop/shared": join(root, "packages/shared/src/index.ts"), "@pi-desktop/i18n": join(root, "packages/i18n/src/index.ts"), react: join(root, "apps/desktop/node_modules/react"), "react-dom": join(root, "apps/desktop/node_modules/react-dom") },
      nodePaths: [join(root, "apps/desktop/node_modules")],
    });
    await build({ stdin: { contents: `
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { CodingActionStore } from "${join(root, "apps/desktop/electron/main/extensions/coding-action-store.ts").replaceAll("\\", "/")}";
import { IPC } from "@pi-desktop/shared";
const directory = import.meta.dirname;
app.setPath("userData", join(directory, "profile"));
let sends = 0;
ipcMain.handle("prompt-fixture", async (_event, method, ...args) => {
  const store = new CodingActionStore(join(directory, "data"));
  if (method === IPC.invoke.codingActionsGet) return store.load();
  if (method === IPC.invoke.codingActionsSave) return store.save(args[0], args[1]);
  if (method === IPC.invoke.codingActionsReset) return store.reset();
  if (method === IPC.invoke.composerCommands) return { commands: [] };
  sends++; throw new Error("Unexpected Host request: " + method);
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 800, webPreferences: { preload: join(directory, "preload.cjs"), sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on("console-message", event => console.error(event.message));
  try { await win.loadFile(join(directory, "index.html")); const result = await win.webContents.executeJavaScript("window.promptButtonsProbe()");
    if (sends !== 0) throw new Error("Selection unexpectedly called the Host");
    console.log("PLAIN_PROMPT_PROBE " + JSON.stringify(result)); app.exit(0);
  } catch (error) { console.error(error.stack); app.exit(1); }
});`, resolveDir: root, loader: "ts" }, outfile: join(directory, "main.mjs"), bundle: true, platform: "node", format: "esm", external: ["electron"], alias: { "@pi-desktop/shared": join(root, "packages/shared/src/index.ts") } });
    await writeFile(join(directory, "preload.cjs"), 'const {contextBridge,ipcRenderer}=require("electron"); contextBridge.exposeInMainWorld("piDesktop",{invoke:async(method,...args)=>{try{return {ok:true,data:await ipcRenderer.invoke("prompt-fixture",method,...args)}}catch(error){return {ok:false,error:{message:error.message}}}},on:()=>()=>{}});');
    await writeFile(join(directory, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script type="module" src="renderer.js"></script></body></html>`);
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(resolveElectronBinary(root).electronBinary, [join(directory, "main.mjs")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", data => { output += data; });
    const timeout = setTimeout(() => child.kill(), 100_000);
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearTimeout(timeout));
    assert.equal(code, 0, output);
    assert.ok(output.includes('PLAIN_PROMPT_PROBE {"ok":true}'), output);
    const saved = JSON.parse(await readFile(join(directory, "data/extensions/coding-actions.json"), "utf8"));
    assert.deepEqual(saved.promptActions.map(action => [action.label, action.prompt]), [["My commit", "Build first, commit with Git or SVN"], ["Summary", "Summarize my changes"]]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
