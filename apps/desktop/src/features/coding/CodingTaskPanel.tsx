import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FreeTask, FreeTaskAction, ProjectInitPreview, UserSkillRecord } from "@pi-desktop/shared";
import { FREE_TASK_SKILLS } from "@pi-desktop/shared";
import { Button, Checkbox, Field, Input, SegmentedControl, Select, Textarea, portalOverlay } from "../../components/ui";
import { api } from "../../lib/api";
import { useAppStore } from "../../stores/app-store";
import { useBlockingOverlay } from "../../lib/blocking-overlay";
import { Markdown } from "../../components/Markdown";
import { type CodingDraft, emptyCodingDraft, useCodingDrafts } from "./coding-drafts";

export function CodingTaskPanel({ action, draftKey, projectPath, busy, onClose, onStart }: {
  action: FreeTaskAction; draftKey: string; projectPath: string; busy: boolean;
  onClose: () => void; onStart: (draft: CodingDraft, wait: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  useBlockingOverlay();
  const projectDialogOpen = useAppStore((state) => state.createProjectDialogOpen);
  const draft = useCodingDrafts((state) => state.drafts[draftKey] ?? emptyCodingDraft);
  const update = useCodingDrafts((state) => state.update);
  const patch = (value: Partial<CodingDraft>) => update(draftKey, { ...(useCodingDrafts.getState().drafts[draftKey] ?? emptyCodingDraft), ...value });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextPreview, setContextPreview] = useState<FreeTask[]>([]);
  useEffect(() => {
    let disposed = false;
    const ids = draft.references.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("task:")).map((line) => line.slice(5));
    if (!ids.length) { setContextPreview([]); return; }
    void Promise.all(ids.slice(0, 32).map((id) => api.readFreeTask(id))).then((results) => { if (!disposed) setContextPreview(results); }, (cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { disposed = true; };
  }, [draft.references]);
  const [skillState, setSkillState] = useState<{ skill: UserSkillRecord | null; level: "global" | "project" } | null>(null);
  useEffect(() => {
    let disposed = false;
    const id = FREE_TASK_SKILLS[action];
    if (!id) return;
    void Promise.all([api.listUserSkills({ level: "global" }), projectPath ? api.listUserSkills({ level: "project", projectPath }) : Promise.resolve({ skills: [] as UserSkillRecord[] })]).then(([global, project]) => {
      if (disposed) return;
      const local = project.skills.find((skill) => skill.id === id);
      const fallback = global.skills.find((skill) => skill.id === id);
      setSkillState({ skill: local ?? fallback ?? null, level: local ? "project" : "global" });
    }, (cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { disposed = true; };
  }, [action, projectPath]);
  const [preview, setPreview] = useState<ProjectInitPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const projectMode = draft.initializationMode ?? "existing";
  const parentPath = draft.parentPath ?? "";
  const newName = draft.newName ?? "";
  const nativeReference = action === "initialize" ? draft.references.split("\n").find((reference) => reference.startsWith("init:"))?.slice(5) : undefined;
  useEffect(() => {
    if (!nativeReference) return;
    let disposed = false;
    void api.readProjectInit(nativeReference).then((result) => {
      if (disposed) return;
      if (result.projectPath !== projectPath) { setError(t("coding.projectMismatch")); return; }
      setPreview(result);
      setSelected(result.outcomes?.length ? result.outcomes.filter((item) => item.status === "failed").map((item) => item.path) : useCodingDrafts.getState().drafts[draftKey]?.initializationSelected ?? result.files.filter((file) => file.before === null).map((file) => file.path));
    }, (cause) => { if (!disposed) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { disposed = true; };
  }, [nativeReference, projectPath, t]);
  const dialog = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  useEffect(() => {
    if (projectDialogOpen) return;
    const previous = document.activeElement;
    dialog.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (useAppStore.getState().createProjectDialogOpen) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]") ?? [])];
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [onClose, projectDialogOpen]);
  const perform = async (work: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setStarting(true); setError(null);
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { locked.current = false; setStarting(false); }
  };
  const initPreview = async () => {
    const sessionId = useAppStore.getState().activeSessionId;
    if (!sessionId) throw new Error(t("coding.chooseProject"));
    const result = await api.previewProjectInit(sessionId, projectPath, draft.description);
    const selection = result.files.filter((file) => file.before === null).map((file) => file.path);
    setPreview(result); setSelected(selection);
    patch({ references: [...draft.references.split("\n").filter((reference) => reference && !reference.startsWith("init:")), `init:${result.id}`].join("\n"), initializationSelected: selection });
  };
  if (projectDialogOpen) return null;
  return portalOverlay(<div className="overlay coding-overlay">
    <div ref={dialog} className="dialog coding-task-panel" role="dialog" aria-modal="true" aria-labelledby="coding-task-title">
      <h2 id="coding-task-title">{t(`coding.${action}`)}</h2>
      <p>{t(`coding.${action}Hint`)}</p>
      {FREE_TASK_SKILLS[action] && <code>{FREE_TASK_SKILLS[action]}</code>}
      {skillState && !skillState.skill?.enabled && <>
        <p role="status">{t("coding.skillMissing")}</p>
        <Button onClick={() => {
          if (skillState.skill) void perform(async () => {
            await api.setUserSkillEnabled(skillState.skill!.id, true, { level: skillState.level, ...(skillState.level === "project" ? { projectPath } : {}) });
            setSkillState({ ...skillState, skill: { ...skillState.skill!, enabled: true } });
          });
          else { const store = useAppStore.getState(); store.setSettingsTab("skills"); store.setPage("settings"); onClose(); }
        }}>{t(skillState.skill ? "coding.enableSkill" : "coding.installSkill")}</Button>
      </>}
      <Field label={t("coding.project")}><Input value={projectPath} readOnly /></Field>
      {!projectPath && <Button onClick={() => void useAppStore.getState().openProject()}>{t("coding.chooseProject")}</Button>}
      <Field label={t("coding.description")}><Textarea value={draft.description} onChange={(event) => { patch({ description: event.target.value, references: draft.references.split("\n").filter((reference) => !reference.startsWith("init:")).join("\n"), initializationSelected: undefined }); setPreview(null); }} /></Field>
      <Field label={t("coding.context")}><Textarea value={draft.references} onChange={(event) => patch({ references: event.target.value })} /></Field>
      {contextPreview.map((task) => <details key={task.id}><summary>{t("coding.result")}: {task.description}</summary>
        <p>{t(`coding.${task.phase}`)}</p>
        {task.result && <Markdown source={task.result} renderDiagrams={false} />}
        <Button onClick={() => patch({ references: draft.references.split("\n").filter((line) => line.trim() !== `task:${task.id}`).join("\n") })}>{t("coding.removeContext")}</Button>
      </details>)}
      {action !== "initialize" && <Field label={t("coding.destination")}><Select value={draft.destination} onChange={(event) => patch({ destination: event.target.value === "new" ? "new" : "current" })}>
        <option value="current">{t("coding.current")}</option><option value="new">{t("coding.newSession")}</option>
      </Select></Field>}
      {busy && action !== "initialize" && draft.destination === "current" && <p role="status">{t("coding.busy")}</p>}
      {action === "initialize" && <>
        <p>{t("coding.initializationNote")}</p>
        <SegmentedControl label={t("coding.initialize")} value={projectMode} onChange={(value) => patch({ initializationMode: value })} options={[{value: "existing", label: t("coding.adopt")}, {value: "new", label: t("coding.newProject")}]} />
        {projectMode === "existing" ? <Button onClick={() => void useAppStore.getState().openProject()}>{t("coding.chooseProject")}</Button> : <>
          <Field label={t("coding.parentDirectory")}><Input value={parentPath} readOnly /></Field>
          <Button disabled={starting} onClick={() => void perform(async () => { const result = await api.pickProjectFolders(); if (!result.canceled && result.folders[0]) patch({ parentPath: result.folders[0] }); })}>{t("coding.chooseParent")}</Button>
          <Field label={t("coding.projectName")}><Input value={newName} onChange={(event) => patch({ newName: event.target.value })} /></Field>
          <Button disabled={starting || !parentPath || !newName.trim()} onClick={() => void perform(async () => {
            const created = await api.createInitializationDirectory(parentPath, newName.trim());
            await api.createProjectGroup(newName.trim(), [created.projectPath]);
            const current = useAppStore.getState().sessions.find((item) => item.id === useAppStore.getState().activeSessionId);
            const next = await api.createSession({ projectPath: created.projectPath, title: newName.trim(), providerId: current?.providerId, modelId: current?.modelId, thinkingLevel: current?.thinkingLevel });
            patch({ initializationMode: "existing", references: draft.references.split("\n").filter((reference) => !reference.startsWith("init:")).join("\n"), initializationSelected: undefined });
            await useAppStore.getState().refreshSessions(); await useAppStore.getState().selectSession(next.session.id);
          })}>{t("coding.createDirectory")}</Button>
        </>}
        {preview && <><p>{t("coding.stack")}: {preview.stack}</p>{preview.files.map((file) => <section key={file.path}>
          <Checkbox disabled={preview.outcomes?.some((item) => item.path === file.path && item.status === "completed")} label={`${selected.includes(file.path) ? t(file.before === null ? "coding.add" : "coding.modify") : t("coding.keep")}: ${file.path}`} checked={selected.includes(file.path)} onChange={(event) => { const next = event.target.checked ? [...selected, file.path] : selected.filter((path) => path !== file.path); setSelected(next); patch({ initializationSelected: next }); }} />
          <details><summary>{t("coding.before")} / {t("coding.after")}</summary><pre>{file.before ?? ""}</pre><pre>{file.after}</pre></details>
          {preview.outcomes?.filter((item) => item.path === file.path).map((item) => <p role="status" key={item.path}>{t(item.status === "kept" ? "coding.keep" : `coding.${item.status}`)} {item.error}</p>)}
        </section>)}</>}
      </>}
      {error && <p role="alert">{error}</p>}
      {error && <Button onClick={() => { const store = useAppStore.getState(); store.setSettingsTab(/skill/i.test(error) ? "skills" : "ai"); store.setPage("settings"); onClose(); }}>{t(/skill/i.test(error) ? "coding.installSkill" : "coding.configureModel")}</Button>}
      <div className="coding-actions">
        <Button onClick={onClose}>{t("coding.close")}</Button>
        {action === "initialize" ? <>
          <Button disabled={starting || !projectPath || !draft.description.trim()} onClick={() => void perform(initPreview)}>{t("coding.preview")}</Button>
          {preview && <Button disabled={starting || selected.length === 0} onClick={() => void perform(async () => setPreview(await api.applyProjectInit(preview.id, selected)))}>{t("coding.apply")}</Button>}
        </> : <Button disabled={starting || !draft.description.trim() || !projectPath || Boolean(skillState && !skillState.skill?.enabled)} onClick={() => void perform(async () => { await onStart(draft, busy && draft.destination === "current"); onClose(); })}>{busy && draft.destination === "current" ? t("coding.wait") : t("coding.start")}</Button>}
      </div>
    </div>
  </div>);
}
