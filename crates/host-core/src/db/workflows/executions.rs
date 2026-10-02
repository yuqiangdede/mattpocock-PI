use super::*;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowExecutionPhase {
    Pending,
    Running,
    Normal,
    Failed,
    Aborted,
    Interrupted,
    Rejected,
}

impl WorkflowExecutionPhase {
    pub fn is_unsettled(self) -> bool {
        matches!(self, Self::Pending | Self::Running)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowExecution {
    pub id: String,
    pub request_id: String,
    pub project_group_id: String,
    pub run_id: String,
    pub stage_id: WorkflowStageId,
    pub stage_revision: u64,
    pub session_id: String,
    pub turn_id: Option<String>,
    pub phase: WorkflowExecutionPhase,
    pub uncertain_admission: bool,
    pub created_at: i64,
    pub started_at: Option<i64>,
    pub ended_at: Option<i64>,
    pub error_code: Option<String>,
    #[serde(default)]
    pub active_ticket_id: Option<String>,
}

pub struct WorkflowStageRequest<'a> {
    pub group: &'a str,
    pub run_id: &'a str,
    pub session: &'a str,
    pub request: &'a str,
    pub revision: u64,
    pub stage_id: WorkflowStageId,
    pub active_ticket_id: Option<&'a str>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowAdmission {
    pub execution: WorkflowExecution,
    pub history: WorkflowProjectHistory,
    pub new_reservation: bool,
}

pub(super) fn validate_executions(document: &WorkflowDocument) -> Result<()> {
    let mut identities = std::collections::HashSet::new();
    for run in &document.runs {
        for execution in &run.executions {
            if execution.id.is_empty()
                || execution.request_id.is_empty()
                || execution.session_id.is_empty()
                || execution.project_group_id != document.project_group_id
                || execution.run_id != run.id
                || execution.stage_revision == 0
                || execution.stage_revision > run.stages[execution.stage_id.index()].revision
                || !identities.insert(execution.id.as_str())
                || (execution.phase.is_unsettled()
                    && (run.outcome != WorkflowRunOutcome::Active || execution.ended_at.is_some()))
                || (!execution.phase.is_unsettled() && execution.ended_at.is_none())
                || (matches!(
                    execution.phase,
                    WorkflowExecutionPhase::Running | WorkflowExecutionPhase::Normal
                ) && execution.turn_id.is_none())
                || execution
                    .turn_id
                    .as_deref()
                    .is_some_and(|turn| turn.trim().is_empty())
            {
                return Err(anyhow!(
                    "malformed workflow execution identity or lifecycle"
                ));
            }
        }
    }
    Ok(())
}

impl Database {
    fn workflow_documents(&self, strict: bool) -> Result<Vec<WorkflowDocument>> {
        let mut statement = self
            .conn
            .prepare_cached("SELECT key, value_json FROM kv WHERE ns = ?1")?;
        let rows = statement.query_map(params![WORKFLOW_NAMESPACE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut documents = Vec::new();
        for row in rows {
            let (key, raw) = row?;
            let decoded = serde_json::from_str::<Value>(&raw)
                .map_err(anyhow::Error::from)
                .and_then(|value| decode_document(&value, &key));
            match decoded {
                Ok(document) => documents.push(document),
                Err(error) if strict => return Err(error),
                Err(error) => {
                    tracing::warn!(%key, %error, "workflow document preserved during lifecycle recovery")
                }
            }
        }
        Ok(documents)
    }

    pub(super) fn persist_workflow(&self, document: &mut WorkflowDocument) -> Result<()> {
        document.format_version = WORKFLOW_DOCUMENT_VERSION;
        document.revision = document
            .revision
            .checked_add(1)
            .ok_or_else(|| anyhow!("workflow revision exhausted"))?;
        document.updated_at = now_ms();
        self.kv_set(
            WORKFLOW_NAMESPACE,
            &document.project_group_id,
            &serde_json::to_value(&*document)?,
        )
    }

    pub(super) fn execution_document(
        &self,
        execution_id: &str,
    ) -> Result<(WorkflowDocument, usize, usize)> {
        for document in self.workflow_documents(true)? {
            for (run_index, run) in document.runs.iter().enumerate() {
                if let Some(execution_index) = run
                    .executions
                    .iter()
                    .position(|execution| execution.id == execution_id)
                {
                    return Ok((document, run_index, execution_index));
                }
            }
        }
        Err(anyhow!(
            "WORKFLOW_EXECUTION_UNAVAILABLE: execution not found"
        ))
    }

    pub fn workflow_session_reserved(
        &self,
        session_id: &str,
        matching_execution: Option<&str>,
    ) -> Result<bool> {
        Ok(self
            .workflow_documents(false)?
            .iter()
            .flat_map(|document| &document.runs)
            .flat_map(|run| &run.executions)
            .any(|execution| {
                execution.session_id == session_id
                    && execution.phase.is_unsettled()
                    && !(matching_execution == Some(execution.id.as_str())
                        && execution.turn_id.is_none())
            }))
    }

    fn eligible_workflow_session(&self, group_id: &str, session_id: &str) -> Result<String> {
        if session_id.is_empty() {
            return Err(anyhow!(
                "WORKFLOW_SESSION_REQUIRED: select an existing project session"
            ));
        }
        let group = self.require_project_group(group_id)?;
        let binding = self.conn.query_row(
            "SELECT p.path, s.mode FROM sessions s LEFT JOIN projects p ON p.id = s.project_id WHERE s.id = ?1 AND s.deleted_at IS NULL",
            params![session_id], |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, String>(1)?)),
        ).optional()?.ok_or_else(|| anyhow!("WORKFLOW_SESSION_REQUIRED: session is unavailable"))?;
        let path = binding.0.ok_or_else(|| {
            anyhow!("WORKFLOW_PROJECT_MISMATCH: session is not bound to this project")
        })?;
        if !group.roots.iter().any(|root| root.path == path) {
            return Err(anyhow!(
                "WORKFLOW_PROJECT_MISMATCH: session is not bound to this project"
            ));
        }
        if binding.1 != "agent" {
            return Err(anyhow!(
                "WORKFLOW_AGENT_MODE_REQUIRED: session must already be in Agent mode"
            ));
        }
        let approval: bool = self.conn.query_row("SELECT EXISTS(SELECT 1 FROM plan_approvals WHERE session_id = ?1 AND status = 'pending')", params![session_id], |row| row.get(0))?;
        if approval {
            return Err(anyhow!(
                "WORKFLOW_APPROVAL_PENDING: resolve the pending plan through its existing UI"
            ));
        }
        if crate::sessions::session_has_running_turn(self, session_id)? {
            return Err(anyhow!("WORKFLOW_BUSY: session has an active turn"));
        }
        Ok(path)
    }

    pub fn check_discovery(&self, group_id: &str, run_id: &str, session_id: &str) -> Result<Value> {
        self.check_workflow_stage(group_id, run_id, session_id, WorkflowStageId::Discovery)
    }

    pub fn check_workflow_stage(
        &self,
        group_id: &str,
        run_id: &str,
        session_id: &str,
        stage_id: WorkflowStageId,
    ) -> Result<Value> {
        let project_path = self.eligible_workflow_session(group_id, session_id)?;
        let queued: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM turn_queue WHERE session_id = ?1)",
            params![session_id],
            |row| row.get(0),
        )?;
        if queued {
            return Err(anyhow!("WORKFLOW_QUEUED: session has queued work"));
        }
        let document = self.workflow_document(group_id)?;
        let run = document
            .runs
            .iter()
            .find(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        if run.outcome != WorkflowRunOutcome::Active {
            return Err(anyhow!("WORKFLOW_READ_ONLY: run is immutable"));
        }
        let index = stage_id.index();
        if index > 0 && run.stages[index - 1].acceptance.is_none() {
            return Err(anyhow!(
                "WORKFLOW_PREREQUISITE: prerequisite is not accepted"
            ));
        }
        if run.stages[index].acceptance.is_some() {
            return Err(anyhow!("WORKFLOW_READ_ONLY: stage is already accepted"));
        }
        if run
            .executions
            .iter()
            .any(|execution| execution.phase.is_unsettled())
            || self.workflow_session_reserved(session_id, None)?
        {
            return Err(anyhow!(
                "WORKFLOW_BUSY: workflow execution is pending or running"
            ));
        }
        Ok(
            serde_json::json!({"projectPath": project_path, "skillId": stage_id.skill_id(), "revision": document.revision}),
        )
    }

    pub fn reserve_discovery(
        &self,
        group: &str,
        run_id: &str,
        session: &str,
        request: &str,
        revision: u64,
    ) -> Result<WorkflowAdmission> {
        self.reserve_workflow_stage(WorkflowStageRequest {
            group,
            run_id,
            session,
            request,
            revision,
            stage_id: WorkflowStageId::Discovery,
            active_ticket_id: None,
        })
    }

    pub fn reserve_workflow_stage(
        &self,
        input: WorkflowStageRequest<'_>,
    ) -> Result<WorkflowAdmission> {
        let WorkflowStageRequest {
            group,
            run_id,
            session,
            request,
            revision,
            stage_id,
            active_ticket_id,
        } = input;
        if active_ticket_id.is_some_and(|ticket| ticket.trim().is_empty() || ticket.len() > 256)
            || (active_ticket_id.is_some() && stage_id != WorkflowStageId::Implement)
        {
            return Err(anyhow!(
                "WORKFLOW_INVALID_REQUEST: ticket association is reserved for Implement"
            ));
        }
        if request.trim().is_empty() || request.len() > 128 {
            return Err(anyhow!(
                "WORKFLOW_INVALID_REQUEST: request identity required"
            ));
        }
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let mut document = self.workflow_document(group)?;
        let run_index = document
            .runs
            .iter()
            .position(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        if let Some(previous) = document.runs[run_index]
            .executions
            .iter()
            .find(|execution| execution.request_id == request)
        {
            if previous.session_id != session
                || previous.stage_id != stage_id
                || previous.active_ticket_id.as_deref() != active_ticket_id
            {
                return Err(anyhow!(
                    "WORKFLOW_CONFLICT: request identity was used for another session"
                ));
            }
            return Ok(WorkflowAdmission {
                execution: previous.clone(),
                history: self.read_workflow_history(group)?,
                new_reservation: false,
            });
        }
        if document.revision != revision {
            return Err(anyhow!("WORKFLOW_CONFLICT: workflow history changed"));
        }
        self.check_workflow_stage(group, run_id, session, stage_id)?;
        // Corrupt documents must not be overwritten or hide a reservation.
        self.workflow_documents(true)?;
        let run = &mut document.runs[run_index];
        let execution = WorkflowExecution {
            id: Uuid::new_v4().to_string(),
            request_id: request.to_string(),
            project_group_id: group.to_string(),
            run_id: run_id.to_string(),
            stage_id,
            stage_revision: run.stages[stage_id.index()].revision,
            session_id: session.to_string(),
            turn_id: None,
            phase: WorkflowExecutionPhase::Pending,
            uncertain_admission: false,
            created_at: now_ms(),
            started_at: None,
            ended_at: None,
            error_code: None,
            active_ticket_id: active_ticket_id.map(str::to_string),
        };
        run.executions.push(execution.clone());
        run.stages[stage_id.index()].status = WorkflowStageStatus::Pending;
        run.stages[stage_id.index()].awaiting_confirmation = false;
        self.persist_workflow(&mut document)?;
        transaction.commit()?;
        Ok(WorkflowAdmission {
            execution,
            history: self.read_workflow_history(group)?,
            new_reservation: true,
        })
    }

    pub fn workflow_execution_context(
        &self,
        execution_id: &str,
        session_id: &str,
    ) -> Result<Value> {
        let (document, run_index, execution_index) = self.execution_document(execution_id)?;
        let run = &document.runs[run_index];
        let execution = &run.executions[execution_index];
        if execution.session_id != session_id
            || !execution.phase.is_unsettled()
            || execution.turn_id.is_some()
            || run.outcome != WorkflowRunOutcome::Active
            || execution.stage_revision != run.stages[execution.stage_id.index()].revision
        {
            return Err(anyhow!(
                "WORKFLOW_CONFLICT: execution reservation is no longer eligible"
            ));
        }
        let path = self.eligible_workflow_session(&document.project_group_id, session_id)?;
        Ok(
            serde_json::json!({"projectPath": path, "skillId": execution.stage_id.skill_id(), "prompt": format!("/{} Work on the {:?} stage for Workflow Run: {}. Stage acceptance requires an explicit user decision.", execution.stage_id.skill_id(), execution.stage_id, run.title)}),
        )
    }

    pub fn begin_workflow_turn(
        &self,
        execution_id: &str,
        session_id: &str,
        provider: Option<&str>,
        model: Option<&str>,
    ) -> Result<String> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        self.workflow_execution_context(execution_id, session_id)?;
        let (mut document, run_index, execution_index) = self.execution_document(execution_id)?;
        let turn_id = crate::sessions::begin_turn_inner(
            self,
            session_id,
            provider,
            model,
            Some(execution_id),
        )?;
        document.runs[run_index].executions[execution_index].turn_id = Some(turn_id.clone());
        self.persist_workflow(&mut document)?;
        transaction.commit()?;
        Ok(turn_id)
    }

    pub fn mark_workflow_running(
        &self,
        execution_id: &str,
        turn_id: &str,
    ) -> Result<WorkflowProjectHistory> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let (mut document, run_index, execution_index) = self.execution_document(execution_id)?;
        let run = &mut document.runs[run_index];
        let execution = &mut run.executions[execution_index];
        if execution.turn_id.as_deref() != Some(turn_id) {
            return Err(anyhow!("WORKFLOW_CONFLICT: admitted turn identity differs"));
        }
        if execution.phase.is_unsettled() {
            execution.phase = WorkflowExecutionPhase::Running;
            execution.started_at = Some(now_ms());
            execution.uncertain_admission = false;
            if execution.stage_revision == run.stages[execution.stage_id.index()].revision {
                run.stages[execution.stage_id.index()].status = WorkflowStageStatus::Running;
            }
            self.persist_workflow(&mut document)?;
        }
        transaction.commit()?;
        self.read_workflow_history(&document.project_group_id)
    }

    pub fn finish_workflow_turn(
        &self,
        turn_id: &str,
        status: &str,
        error_code: Option<&str>,
    ) -> Result<()> {
        for mut document in self.workflow_documents(false)? {
            let mut changed = false;
            for run in &mut document.runs {
                for execution in &mut run.executions {
                    if execution.turn_id.as_deref() == Some(turn_id)
                        && execution.phase.is_unsettled()
                    {
                        execution.phase = if status == "completed" {
                            WorkflowExecutionPhase::Normal
                        } else if matches!(
                            error_code,
                            Some(
                                "AGENT_SIDECAR_CRASHED"
                                    | "AGENT_SIDECAR_OOM"
                                    | "PLAN_EXECUTION_INTERRUPTED"
                            )
                        ) {
                            WorkflowExecutionPhase::Interrupted
                        } else if status == "aborted" {
                            WorkflowExecutionPhase::Aborted
                        } else {
                            WorkflowExecutionPhase::Failed
                        };
                        execution.ended_at = Some(now_ms());
                        execution.error_code = error_code.map(str::to_string);
                        execution.uncertain_admission = false;
                        if execution.stage_revision
                            == run.stages[execution.stage_id.index()].revision
                        {
                            run.stages[execution.stage_id.index()].status = if status == "completed"
                            {
                                WorkflowStageStatus::Ready
                            } else {
                                WorkflowStageStatus::Failed
                            };
                            run.stages[execution.stage_id.index()].awaiting_confirmation =
                                status == "completed";
                        }
                        changed = true;
                    }
                }
            }
            if changed {
                self.persist_workflow(&mut document)?;
            }
        }
        Ok(())
    }

    pub fn reconcile_workflow_execution(
        &self,
        execution_id: &str,
        rejected: Option<&str>,
    ) -> Result<WorkflowProjectHistory> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let (mut document, run_index, execution_index) = self.execution_document(execution_id)?;
        let execution = &document.runs[run_index].executions[execution_index];
        if execution.phase.is_unsettled() {
            if let Some(turn_id) = execution.turn_id.clone() {
                let status: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT status FROM turns WHERE id = ?1",
                        params![turn_id],
                        |row| row.get(0),
                    )
                    .optional()?;
                match status.as_deref() {
                    Some("completed" | "error" | "aborted") => self.finish_workflow_turn(
                        &turn_id,
                        status.as_deref().unwrap_or("error"),
                        rejected,
                    )?,
                    None => {
                        let run = &mut document.runs[run_index];
                        let execution = &mut run.executions[execution_index];
                        execution.phase = WorkflowExecutionPhase::Interrupted;
                        execution.uncertain_admission = false;
                        execution.ended_at = Some(now_ms());
                        execution.error_code = Some("WORKFLOW_TURN_UNAVAILABLE".into());
                        run.stages[execution.stage_id.index()].status = WorkflowStageStatus::Failed;
                        run.stages[execution.stage_id.index()].awaiting_confirmation = false;
                        self.persist_workflow(&mut document)?;
                    }
                    _ => {
                        document.runs[run_index].executions[execution_index].uncertain_admission =
                            true;
                        self.persist_workflow(&mut document)?;
                    }
                }
            } else if let Some(code) = rejected {
                let run = &mut document.runs[run_index];
                let execution = &mut run.executions[execution_index];
                execution.phase = WorkflowExecutionPhase::Rejected;
                execution.error_code = Some(code.to_string());
                execution.ended_at = Some(now_ms());
                run.stages[execution.stage_id.index()].status = WorkflowStageStatus::Failed;
                run.stages[execution.stage_id.index()].awaiting_confirmation = false;
                self.persist_workflow(&mut document)?;
            } else {
                document.runs[run_index].executions[execution_index].uncertain_admission = true;
                self.persist_workflow(&mut document)?;
            }
        }
        transaction.commit()?;
        self.read_workflow_history(&document.project_group_id)
    }

    pub fn recover_workflow_executions(&self) -> Result<()> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        for mut document in self.workflow_documents(false)? {
            let mut changed = false;
            for run in &mut document.runs {
                for execution in &mut run.executions {
                    if execution.phase.is_unsettled() {
                        execution.phase = WorkflowExecutionPhase::Interrupted;
                        execution.ended_at = Some(now_ms());
                        execution.uncertain_admission = false;
                        execution.error_code = Some("WORKFLOW_INTERRUPTED".into());
                        if execution.stage_revision
                            == run.stages[execution.stage_id.index()].revision
                        {
                            run.stages[execution.stage_id.index()].status =
                                WorkflowStageStatus::Failed;
                            run.stages[execution.stage_id.index()].awaiting_confirmation = false;
                        }
                        changed = true;
                    }
                }
            }
            if changed {
                self.persist_workflow(&mut document)?;
            }
        }
        transaction.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
