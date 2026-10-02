use super::*;

impl Database {
    pub fn reopen_workflow_stage(
        &self,
        group: &str,
        run_id: &str,
        stage_id: WorkflowStageId,
        revision: u64,
        confirmed: bool,
    ) -> Result<WorkflowProjectHistory> {
        if !confirmed {
            return Err(anyhow!(
                "WORKFLOW_CONFIRMATION_REQUIRED: confirm the affected stages"
            ));
        }
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
        if run.stages[index].acceptance.is_none() {
            return Err(anyhow!(
                "WORKFLOW_NOT_ACCEPTED: only accepted stages can be reopened"
            ));
        }
        for stage in STAGES {
            if let Some(execution) = run.latest_stage_execution(stage) {
                self.workflow_session_idle(&execution.session_id)?;
            }
        }
        for (offset, stage) in run.stages[index..].iter_mut().enumerate() {
            stage.revision = stage
                .revision
                .checked_add(1)
                .ok_or_else(|| anyhow!("workflow stage revision exhausted"))?;
            if let Some(acceptance) = stage.acceptance.take() {
                stage.acceptance_history.push(acceptance);
            }
            stage.awaiting_confirmation = false;
            stage.status = if offset == 0 {
                WorkflowStageStatus::Ready
            } else {
                WorkflowStageStatus::Locked
            };
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
    fn reopening_implement_withdraws_only_it_and_successors_and_retains_prior_attempts() {
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
        let mut history = db
            .create_workflow_run(&group.id, "Reopen effort", 0)
            .unwrap();
        let run = history.runs[0].id.clone();
        for (index, stage) in STAGES[..4].iter().enumerate() {
            let admission = db
                .reserve_workflow_stage(WorkflowStageRequest {
                    group: &group.id,
                    run_id: &run,
                    session: &session.id,
                    request: &format!("req-{index}"),
                    revision: history.revision,
                    stage_id: *stage,
                    active_ticket_id: None,
                })
                .unwrap();
            let turn = db
                .begin_workflow_turn(&admission.execution.id, &session.id, None, None)
                .unwrap();
            crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
            history = db.read_workflow_history(&group.id).unwrap();
            history = db
                .accept_workflow_stage(&group.id, &run, *stage, history.revision)
                .unwrap();
        }
        let mut document = db.workflow_document(&group.id).unwrap();
        document.runs[0]
            .artifact_references
            .push(references::WorkflowArtifactReference {
                id: "reference-1".into(),
                run_id: run.clone(),
                stage_id: WorkflowStageId::Implement,
                stage_revision: 1,
                kind: references::WorkflowArtifactKind::Ticket,
                workspace_root: path.to_string_lossy().into_owned(),
                relative_path: "docs/ticket-17.md".into(),
                ticket_id: Some("ticket-17".into()),
            });
        db.persist_workflow(&mut document).unwrap();
        history = db.read_workflow_history(&group.id).unwrap();
        let before = db.kv_get(WORKFLOW_NAMESPACE, &group.id).unwrap();
        assert!(db
            .reopen_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Implement,
                history.revision,
                false
            )
            .is_err());
        assert_eq!(before, db.kv_get(WORKFLOW_NAMESPACE, &group.id).unwrap());
        let reopened = db
            .reopen_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Implement,
                history.revision,
                true,
            )
            .unwrap();
        for index in 0..3 {
            assert_eq!(
                serde_json::to_value(&reopened.runs[0].stages[index]).unwrap(),
                serde_json::to_value(&history.runs[0].stages[index]).unwrap()
            );
        }
        for index in 3..6 {
            assert_eq!(reopened.runs[0].stages[index].revision, 2);
            assert!(reopened.runs[0].stages[index].acceptance.is_none());
        }
        assert_eq!(
            reopened.runs[0].stages[3].status,
            WorkflowStageStatus::Ready
        );
        assert_eq!(
            reopened.runs[0].stages[4].status,
            WorkflowStageStatus::Locked
        );
        assert_eq!(reopened.runs[0].stages[3].acceptance_history.len(), 1);
        assert_eq!(
            serde_json::to_value(&reopened.runs[0].artifact_references).unwrap(),
            serde_json::to_value(&history.runs[0].artifact_references).unwrap()
        );
        assert_eq!(
            serde_json::to_value(&reopened.runs[0].executions).unwrap(),
            serde_json::to_value(&history.runs[0].executions).unwrap()
        );
        assert!(db
            .accept_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Implement,
                reopened.revision
            )
            .is_err());
        assert!(db
            .reopen_workflow_stage(
                &group.id,
                &run,
                WorkflowStageId::Spec,
                history.revision,
                true
            )
            .is_err());
        db.finish_workflow_turn(
            history.runs[0].executions[3].turn_id.as_deref().unwrap(),
            "error",
            Some("DELAYED_OLD_EVENT"),
        )
        .unwrap();
        assert_eq!(
            reopened.revision,
            db.read_workflow_history(&group.id).unwrap().revision
        );
    }
}
