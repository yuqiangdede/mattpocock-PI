use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowAcceptance {
    pub execution_id: String,
    pub stage_revision: u64,
    pub accepted_at: i64,
}

impl WorkflowStageId {
    pub fn index(self) -> usize {
        match self {
            Self::Discovery => 0,
            Self::Spec => 1,
            Self::Tickets => 2,
            Self::Implement => 3,
            Self::Review => 4,
            Self::Retro => 5,
        }
    }
    pub fn skill_id(self) -> &'static str {
        match self {
            Self::Discovery => "grill-with-docs",
            Self::Spec => "to-spec",
            Self::Tickets => "to-tickets",
            Self::Implement => "implement",
            Self::Review => "code-review",
            Self::Retro => "retro",
        }
    }
}

impl WorkflowRunRecord {
    pub(super) fn latest_stage_execution(
        &self,
        stage_id: WorkflowStageId,
    ) -> Option<&WorkflowExecution> {
        let revision = self.stages[stage_id.index()].revision;
        self.executions.iter().rev().find(|execution| {
            execution.stage_id == stage_id && execution.stage_revision == revision
        })
    }
}

pub(super) fn validate_stage_state(run: &WorkflowRunRecord) -> Result<()> {
    for (index, stage) in run.stages.iter().enumerate() {
        let mut accepted_revisions = std::collections::HashSet::new();
        for accepted in &stage.acceptance_history {
            if accepted.stage_revision >= stage.revision
                || !accepted_revisions.insert(accepted.stage_revision)
                || !run.executions.iter().any(|execution| {
                    execution.id == accepted.execution_id
                        && execution.stage_id == stage.id
                        && execution.stage_revision == accepted.stage_revision
                        && execution.phase == WorkflowExecutionPhase::Normal
                })
            {
                return Err(anyhow!("malformed historical workflow acceptance"));
            }
        }
        let latest = run.latest_stage_execution(stage.id);
        let unlocked = index == 0 || run.stages[index - 1].acceptance.is_some();
        let expected = if !unlocked {
            WorkflowStageStatus::Locked
        } else if let Some(acceptance) = &stage.acceptance {
            if acceptance.stage_revision != stage.revision
                || !latest.is_some_and(|execution| {
                    execution.id == acceptance.execution_id
                        && execution.phase == WorkflowExecutionPhase::Normal
                })
            {
                return Err(anyhow!("malformed workflow acceptance identity"));
            }
            WorkflowStageStatus::Completed
        } else {
            match latest.map(|execution| execution.phase) {
                Some(WorkflowExecutionPhase::Pending) => WorkflowStageStatus::Pending,
                Some(WorkflowExecutionPhase::Running) => WorkflowStageStatus::Running,
                Some(WorkflowExecutionPhase::Normal) | None => WorkflowStageStatus::Ready,
                _ => WorkflowStageStatus::Failed,
            }
        };
        let awaiting = unlocked
            && stage.acceptance.is_none()
            && latest.is_some_and(|execution| execution.phase == WorkflowExecutionPhase::Normal);
        if stage.status != expected
            || stage.awaiting_confirmation != awaiting
            || (!unlocked && stage.acceptance.is_some())
        {
            return Err(anyhow!("malformed workflow stage projection"));
        }
    }
    if (run.outcome == WorkflowRunOutcome::Done)
        != run.stages.iter().all(|stage| stage.acceptance.is_some())
    {
        return Err(anyhow!("malformed workflow completion outcome"));
    }
    Ok(())
}

impl Database {
    pub(super) fn workflow_bound_session_idle(&self, session: &str) -> Result<()> {
        let exists: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1 AND deleted_at IS NULL)",
            params![session],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(anyhow!(
                "WORKFLOW_SESSION_REQUIRED: bound session is unavailable"
            ));
        }
        self.workflow_session_idle(session)
    }

    pub(super) fn workflow_session_idle(&self, session: &str) -> Result<()> {
        let queued: bool = self.conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM turn_queue WHERE session_id=?1)",
            params![session],
            |row| row.get(0),
        )?;
        if queued {
            return Err(anyhow!("WORKFLOW_QUEUED: bound session has queued work"));
        }
        if self.workflow_session_reserved(session, None)?
            || crate::sessions::session_has_running_turn(self, session)?
        {
            return Err(anyhow!("WORKFLOW_BUSY: bound session has active work"));
        }
        Ok(())
    }

    pub fn accept_workflow_stage(
        &self,
        group: &str,
        run_id: &str,
        stage_id: WorkflowStageId,
        revision: u64,
    ) -> Result<WorkflowProjectHistory> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        self.require_project_group(group)?;
        let mut document = self.workflow_document(group)?;
        if document.revision != revision {
            return Err(anyhow!("WORKFLOW_CONFLICT: workflow history changed"));
        }
        let run = document
            .runs
            .iter_mut()
            .find(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        if run.outcome != WorkflowRunOutcome::Active {
            return Err(anyhow!("WORKFLOW_READ_ONLY: run is immutable"));
        }
        if run
            .executions
            .iter()
            .any(|execution| execution.phase.is_unsettled())
        {
            return Err(anyhow!("WORKFLOW_BUSY: workflow execution is unsettled"));
        }
        let index = stage_id.index();
        if index > 0 && run.stages[index - 1].acceptance.is_none() {
            return Err(anyhow!(
                "WORKFLOW_PREREQUISITE: prerequisite is not accepted"
            ));
        }
        let stage = &run.stages[index];
        if stage.acceptance.is_some() {
            return Err(anyhow!("WORKFLOW_READ_ONLY: stage is already accepted"));
        }
        let execution = run.latest_stage_execution(stage_id).ok_or_else(|| {
            anyhow!("WORKFLOW_NOT_CONFIRMABLE: current revision requires a recorded execution")
        })?;
        if execution.phase != WorkflowExecutionPhase::Normal {
            return Err(anyhow!(
                "WORKFLOW_NOT_CONFIRMABLE: the latest execution did not end normally"
            ));
        }
        self.workflow_bound_session_idle(&execution.session_id)?;
        run.stages[index].acceptance = Some(WorkflowAcceptance {
            execution_id: execution.id.clone(),
            stage_revision: stage.revision,
            accepted_at: now_ms(),
        });
        run.stages[index].status = WorkflowStageStatus::Completed;
        run.stages[index].awaiting_confirmation = false;
        if index + 1 < STAGES.len() {
            run.stages[index + 1].status = WorkflowStageStatus::Ready;
        } else {
            run.outcome = WorkflowRunOutcome::Done;
        }
        run.updated_at = now_ms();
        self.persist_workflow(&mut document)?;
        transaction.commit()?;
        self.read_workflow_history(group)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_later_unsuccessful_attempt_cannot_fall_back_to_an_earlier_normal_execution() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project");
        std::fs::create_dir_all(&path).unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        let session = crate::sessions::create_session(
            &db,
            None,
            None,
            None,
            None,
            Some(path.to_string_lossy().into_owned()),
        )
        .unwrap();
        let group = db
            .project_group_for_path(path.to_str().unwrap())
            .unwrap()
            .unwrap();
        let run = db
            .create_workflow_run(&group.id, "Continuation failure", 0)
            .unwrap()
            .runs[0]
            .id
            .clone();
        let first = db
            .reserve_discovery(&group.id, &run, &session.id, "normal", 1)
            .unwrap();
        let turn = db
            .begin_workflow_turn(&first.execution.id, &session.id, None, None)
            .unwrap();
        crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
        let history = db.read_workflow_history(&group.id).unwrap();
        let next = db
            .reserve_discovery(&group.id, &run, &session.id, "continue", history.revision)
            .unwrap();
        let turn = db
            .begin_workflow_turn(&next.execution.id, &session.id, None, None)
            .unwrap();
        crate::sessions::end_turn(&db, &turn, "error", Some("PROVIDER_FAILURE"), None, false)
            .unwrap();
        let before = db.kv_get(WORKFLOW_NAMESPACE, &group.id).unwrap();
        let history = db.read_workflow_history(&group.id).unwrap();
        assert!(db
            .accept_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Discovery,
                history.revision
            )
            .unwrap_err()
            .to_string()
            .starts_with("WORKFLOW_NOT_CONFIRMABLE"));
        assert_eq!(before, db.kv_get(WORKFLOW_NAMESPACE, &group.id).unwrap());
        assert!(
            !db.read_workflow_history(&group.id).unwrap().runs[0].stages[0].awaiting_confirmation
        );
    }

    #[test]
    fn six_stages_require_current_normal_execution_and_explicit_acceptance() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project");
        std::fs::create_dir_all(&path).unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        let session = crate::sessions::create_session(
            &db,
            None,
            None,
            None,
            None,
            Some(path.to_string_lossy().into_owned()),
        )
        .unwrap();
        let group = db
            .project_group_for_path(path.to_str().unwrap())
            .unwrap()
            .unwrap();
        let mut history = db.create_workflow_run(&group.id, "Six stages", 0).unwrap();
        let run = history.runs[0].id.clone();
        for (index, stage) in STAGES.iter().enumerate() {
            for successor in &STAGES[index + 1..] {
                assert!(db
                    .check_workflow_stage(&group.id, &run, &session.id, *successor)
                    .is_err());
            }
            assert!(db
                .accept_workflow_stage(&group.id, &run, *stage, history.revision)
                .is_err());
            let admission = db
                .reserve_workflow_stage(WorkflowStageRequest {
                    group: &group.id,
                    run_id: &run,
                    session: &session.id,
                    request: &format!("request-{index}"),
                    revision: history.revision,
                    stage_id: *stage,
                    active_ticket_id: (*stage == WorkflowStageId::Implement).then_some("ticket-17"),
                })
                .unwrap();
            assert!(db
                .accept_workflow_stage(&group.id, &run, *stage, admission.history.revision)
                .is_err());
            let turn = db
                .begin_workflow_turn(&admission.execution.id, &session.id, None, None)
                .unwrap();
            crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
            history = db.read_workflow_history(&group.id).unwrap();
            if *stage == WorkflowStageId::Implement {
                assert_eq!(
                    admission.execution.active_ticket_id.as_deref(),
                    Some("ticket-17")
                );
            }
            assert!(history.runs[0].stages[index].awaiting_confirmation);
            if index < 5 {
                assert_eq!(
                    history.runs[0].stages[index + 1].status,
                    WorkflowStageStatus::Locked
                );
            }
            history = db
                .accept_workflow_stage(&group.id, &run, *stage, history.revision)
                .unwrap();
            assert_eq!(
                history.runs[0].stages[index].status,
                WorkflowStageStatus::Completed
            );
            assert!(history.runs[0].stages[index].acceptance.is_some());
            if index < 5 {
                assert_eq!(
                    history.runs[0].stages[index + 1].status,
                    WorkflowStageStatus::Ready
                );
            }
        }
        assert_eq!(history.runs[0].outcome, WorkflowRunOutcome::Done);
        assert!(db
            .reopen_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Discovery,
                history.revision,
                true
            )
            .is_err());
        assert!(db
            .archive_workflow_run(&group.id, &run, history.revision)
            .is_err());
        assert!(db.check_discovery(&group.id, &run, &session.id).is_err());
        let next = db
            .create_workflow_run(&group.id, "Next effort", history.revision)
            .unwrap();
        assert_eq!(next.runs.len(), 2);
    }
}
