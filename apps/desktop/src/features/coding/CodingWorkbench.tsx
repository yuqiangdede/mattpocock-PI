import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ENGINEERING_SHORTCUTS, CodingActionError, CodingActionRegistry, resolveCodingAction, codingPromptActions, type ComposerCommand } from "@pi-desktop/shared";
import { TaskGraphViewer } from "./TaskGraphViewer";
import { activateCodingShortcut } from "./coding-shortcut-activation";
import { codingShortcutTooltip } from "./coding-shortcut-tooltip";
import { groupCodingShortcuts, codingShortcutMenu, type CodingShortcut } from "./coding-shortcut-menu";
import { api } from "../../lib/api";
import { Button, TooltipButton } from "../../components/ui";
import { AnchoredMenu } from "../../components/settings/AnchoredMenu";
import { useAppStore } from "../../stores/app-store";
import { loadCodingActions, useCodingActions } from "../extensions/coding-action-state";
import { INTERACTION_IMAGE_PROMPT_ID } from "./interaction-image-prompt";
import { REVIEW_FIX_PROMPT_ID } from "./review-fix-prompt";
import { GrillWorkspace } from "./GrillWorkspace";
import { loadGrill, parseGrillReply } from "./grill-workspace-model";
import { codingNextSteps } from "./coding-next-steps";

import { DOCUMENT_SHORTCUTS } from "./document-shortcuts";

const EMPTY_GRILL_MESSAGES: Array<{ role?: string; content?: string }> = [];

export function CodingWorkbench({ disabled, error, onExecute, onSelectSkill, onSelectPrompt, onPrepareVisual, visualStart }: {
  disabled: boolean; error: string | null; onExecute: (actionId: string) => void; onSelectSkill: (skillId: string, context?: string) => void; onSelectPrompt: (id: string, context?: string) => void;
  onPrepareVisual?: () => void; visualStart?: { sessionId: string; requestId: string } | null;
}) {
  const { t } = useTranslation();
  const projectPath = useAppStore(state => state.workspace?.path ?? "");
  const sessionId = useAppStore(state => state.activeSessionId);
  const messages = useAppStore(state => state.messages ?? EMPTY_GRILL_MESSAGES);
  const revealedReplies = useRef(new Set<string>());
  const result = useAppStore(state => sessionId ? state.latestTurnResults[sessionId] : undefined);
  const running = useAppStore(state => sessionId ? state.runningSessions[sessionId] ?? false : false);
  const recommendation = codingNextSteps(messages, result, running);
  const { configuration, diagnostic } = useCodingActions();
  const [moreOpen, setMoreOpen] = useState(false);
  const [nativeGrillOpen, setNativeGrillOpen] = useState(false);
  useEffect(() => { if (visualStart && visualStart.sessionId === sessionId) setNativeGrillOpen(true); }, [visualStart, sessionId]);
  const [taskGraphOpen, setTaskGraphOpen] = useState(false);
  const workbenchRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState<ComposerCommand[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogVersion, setCatalogVersion] = useState(0);
  useEffect(() => {
    let active = true;
    void api.composerCommands().then(({ commands }) => { if (active) { setCatalog(commands); setCatalogError(null); } })
      .catch(cause => { if (active) { setCatalog([]); setCatalogError(String(cause)); } });
    return () => { active = false; };
  }, [projectPath, sessionId, configuration, catalogVersion]);
  useEffect(() => { void loadCodingActions(); }, []);
  useEffect(() => { if (disabled) { setMoreOpen(false); } }, [disabled]);
  useEffect(() => {
    if (!sessionId) return;
    const pending = loadGrill(sessionId)?.pending;
    if (!pending) return;
    const key = `${sessionId}:${pending.id}`;
    if (revealedReplies.current.has(key)) return;
    if (!messages.some(message => message.role === "assistant" && parseGrillReply(message.content ?? "", pending))) return;
    revealedReplies.current.add(key);
    setNativeGrillOpen(true);
  }, [sessionId, messages]);
  const { primary, more: overflow } = codingShortcutMenu(configuration, catalog, { ask: t("codingActions.askNext"), diagnose: t("codingActions.diagnose"), skillLabels: Object.fromEntries(ENGINEERING_SHORTCUTS.map(entry => [entry.action, t(`coding.${entry.action}`)])) });
  const more = [...primary.filter(shortcut => shortcut.action.skillId === "grill-with-docs"), ...overflow];
  const documentActions: CodingShortcut[] = DOCUMENT_SHORTCUTS.map(doc => ({
    configured: false,
    action: { id: `catalog:${doc.skillId}`, skillId: doc.skillId, label: t(`codingActions.${doc.labelKey}`) },
  }));
  const actions = [...primary, ...documentActions, ...overflow];
  const reason = ({ action }: CodingShortcut) => {
    if (action.skillId === "implement-spec") return "";
    if (catalogError) return t("codingActions.executeFailed", { detail: catalogError });
    try { resolveCodingAction(action.id, new CodingActionRegistry({ schemaVersion: 1, actions: [action] }), catalog); return ""; }
    catch (cause) { return cause instanceof CodingActionError ? t(`codingActions.${cause.code === "SKILL_MISSING" ? "skillMissing" : cause.code}`, { skillId: action.skillId }) : t("codingActions.executeFailed", { detail: String(cause) }); }
  };
  const plainActions = codingPromptActions(configuration, t("codingActions.commitCode")).filter(action => action.enabled !== false);
  // Fixed launcher order is presentation-only: never rewrite user configuration.
  const orderedPromptActions = [...plainActions.filter(action => action.id === "commit-code"), ...plainActions.filter(action => action.id !== "commit-code")];
  const isRecommended = (id: string) => Boolean(recommendation?.steps.some(step => step === id));
  const recommendedMore = isRecommended(REVIEW_FIX_PROMPT_ID) || more.some(shortcut => isRecommended(shortcut.action.skillId));
  const tooltipLine = (when: string, example: string) => `${t("codingActions.tooltipWhen", { defaultValue: "什么时候使用" })}：${when}\n${t("codingActions.tooltipExample", { defaultValue: "具体例子" })}：${example}`;
  const renderAction = (shortcut: CodingShortcut, menu = false) => {
    const { action } = shortcut;
    const unavailable = reason(shortcut);
    const note = codingShortcutTooltip(shortcut, catalog, t);
    if (!menu && action.skillId === "grill-with-docs") {
      const tooltip = tooltipLine(t("codingActions.visualTooltipWhen"), t("codingActions.visualTooltipExample"));
      return <TooltipButton key={action.id} className="btn btn-secondary" ariaLabel={t("codingActions.visualRequirements")} aria-description={tooltip} tooltip={tooltip} disabled={onPrepareVisual ? disabled : !sessionId} onClick={() => onPrepareVisual ? onPrepareVisual() : setNativeGrillOpen(true)}>{t("codingActions.visualRequirements")}</TooltipButton>;
    }
    const label = menu && action.skillId === "grill-with-docs"
      ? t("codingActions.discussRequirementsText", { defaultValue: "需求讨论-文本" })
      : action.label;
    return <TooltipButton key={action.id} disabled={(disabled && action.skillId !== "implement-spec") || Boolean(unavailable)} className={(menu ? "btn btn-ghost context-menu-item" : "btn btn-secondary") + (isRecommended(action.skillId) ? " coding-action-recommended" : "")}
      role={menu ? "menuitem" : undefined} ariaLabel={label} tooltip={isRecommended(action.skillId) ? t("codingActions.recommendedNext") + " · " + note : note} aria-description={isRecommended(action.skillId) ? t("codingActions.recommendedNext") + " · " + note : note}
      tooltipClassName="ui-tooltip-help coding-skill-tooltip" onClick={event => { if (action.skillId === "implement-spec") returnFocusRef.current = menu ? workbenchRef.current?.querySelector<HTMLButtonElement>(`button[aria-haspopup="menu"]`) ?? null : event.currentTarget; setMoreOpen(false); if (isRecommended(action.skillId)) { onSelectSkill(action.skillId, recommendation?.context); return; } activateCodingShortcut(shortcut, { openTaskGraph: () => setTaskGraphOpen(true), execute: onExecute, selectSkill: onSelectSkill }); }}>{label}</TooltipButton>;
  };
  const configure = () => { const store = useAppStore.getState(); store.setSettingsTab("codingActions"); store.setPage("settings"); };

  const renderDocumentAction = (shortcut: CodingShortcut, index: number) => {
    const doc = DOCUMENT_SHORTCUTS[index];
    const conversionMissing = doc.helpKey === "mergeConvert" && !catalog.some(command => command.kind === "skill" && command.skillId === "pi-desktop:markdown-to-docx");
    const tooltip = tooltipLine(t(`codingActions.${doc.helpKey}TooltipWhen`), t(`codingActions.${doc.helpKey}TooltipExample`));
    return <TooltipButton key={shortcut.action.id} className="btn btn-secondary" disabled={disabled || Boolean(reason(shortcut)) || conversionMissing}
      ariaLabel={shortcut.action.label} aria-description={tooltip} tooltip={tooltip} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
      onClick={() => onSelectSkill(doc.skillId)}>{shortcut.action.label}</TooltipButton>;
  };

  return <section ref={workbenchRef} className="coding-workbench" aria-label={t("codingActions.title")}>
    <div className="coding-shortcuts coding-shortcuts-primary">{primary.filter(shortcut => ["setup-matt-pocock-skills", "ask-matt", "grill-with-docs"].includes(shortcut.action.skillId)).map(action => renderAction(action))}
      {primary.filter(shortcut => !["setup-matt-pocock-skills", "ask-matt", "grill-with-docs"].includes(shortcut.action.skillId)).map(action => renderAction(action))}
        {orderedPromptActions.map(action => {
          const tooltip = tooltipLine(t(action.id === "commit-code" ? "codingActions.commitTooltipWhen" : "codingActions.promptTooltipWhen"), t(action.id === "commit-code" ? "codingActions.commitTooltipExample" : "codingActions.promptTooltipExample"));
          const description = isRecommended(action.id) ? `${t("codingActions.recommendedNext")} · ${tooltip}` : tooltip;
          return <TooltipButton key={action.id} className={`btn btn-secondary${isRecommended(action.id) ? " coding-action-recommended" : ""}`} aria-description={description} tooltip={tooltip} disabled={disabled} onClick={() => onSelectPrompt(action.id, isRecommended(action.id) ? recommendation?.context : undefined)}>{action.label}</TooltipButton>;
        })}

      <AnchoredMenu open={moreOpen} onClose={() => setMoreOpen(false)} role="menu" side="top" restoreFocus={!disabled || more.some(shortcut => shortcut.action.skillId === "implement-spec")} label={t("codingActions.more")} menuClassName="context-menu coding-more-menu"
        trigger={ref => {
          const tooltip = tooltipLine(t("codingActions.moreTooltipWhen"), t("codingActions.moreTooltipExample"));
          const description = recommendedMore ? `${t("codingActions.recommendedNext")} · ${tooltip}` : tooltip;
          return <TooltipButton ref={ref} className={`btn btn-ghost${recommendedMore ? " coding-action-recommended" : ""}`} ariaLabel={t("codingActions.more")} aria-description={description} tooltip={tooltip} disabled={disabled && !more.some(shortcut => shortcut.action.skillId === "implement-spec")} aria-haspopup="menu" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)}>{t("codingActions.more")}</TooltipButton>;
        }}>
        <TooltipButton className="btn btn-ghost context-menu-item" role="menuitem" disabled={disabled}
          ariaLabel={t("codingActions.interactionImage")} tooltip={t("codingActions.interactionImageHint")}
          tooltipClassName="ui-tooltip-help coding-skill-tooltip"
          onClick={() => { setMoreOpen(false); onSelectPrompt(INTERACTION_IMAGE_PROMPT_ID); }}>{t("codingActions.interactionImage")}</TooltipButton>
        <TooltipButton className={"btn btn-ghost context-menu-item" + (isRecommended(REVIEW_FIX_PROMPT_ID) ? " coding-action-recommended" : "")}
          role="menuitem" disabled={disabled} ariaLabel={t("codingActions.reviewFix")}
          aria-description={isRecommended(REVIEW_FIX_PROMPT_ID) ? t("codingActions.recommendedNext") : undefined}
          tooltip={t("codingActions.reviewFixHint")} tooltipClassName="ui-tooltip-help coding-skill-tooltip"
          onClick={() => { setMoreOpen(false); onSelectPrompt(REVIEW_FIX_PROMPT_ID, isRecommended(REVIEW_FIX_PROMPT_ID) ? recommendation?.context : undefined); }}>{t("codingActions.reviewFix")}</TooltipButton>
        {groupCodingShortcuts(more).map(group => <div key={group.id} role="group" aria-label={t(`codingActions.groups.${group.id}`)}>
          <div className="coding-menu-group-label" aria-hidden="true">{t(`codingActions.groups.${group.id}`)}</div>
          {group.shortcuts.map(action => renderAction(action, true))}
        </div>)}
      </AnchoredMenu>
    </div>
    <div className="coding-shortcuts coding-shortcuts-secondary">
      {documentActions.map((shortcut, index) => renderDocumentAction(shortcut, index))}
    </div>
    {actions.some(action => reason(action)) && <div role="status">{actions.filter(action => reason(action)).map(shortcut => `${shortcut.action.label}：${reason(shortcut)}`).join("；")}<Button onClick={() => setCatalogVersion(value => value + 1)}>{t("codingActions.recheck")}</Button></div>}
    {(error || diagnostic) && <div className="coding-shortcut-error" role="alert"><span>{error || t("codingActions.diagnostic", { detail: diagnostic })}</span><Button onClick={configure}>{t("codingActions.configure")}</Button></div>}
    {taskGraphOpen && <TaskGraphViewer onClose={() => setTaskGraphOpen(false)} returnFocus={returnFocusRef.current} />}
    {nativeGrillOpen && sessionId && <GrillWorkspace key={sessionId} sessionId={sessionId} onClose={() => setNativeGrillOpen(false)} onNext={context => { setNativeGrillOpen(false); onSelectSkill("to-spec", context); }} />}
  </section>;
}
