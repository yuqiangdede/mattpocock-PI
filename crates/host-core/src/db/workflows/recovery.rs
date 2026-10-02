use super::*;

impl Database {
    /// Resolve cancellation from the durable execution, never the visible chat.
    /// A reservation without a turn can be retired atomically before admission.
    pub fn workflow_stop_target(&self, execution_id: &str) -> Result<Value> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let (mut document, run_index, execution_index) = self.execution_document(execution_id)?;
        let run = &mut document.runs[run_index];
        let execution = &mut run.executions[execution_index];
        let session = execution.session_id.clone();
        let mut turn = None;
        if execution.phase.is_unsettled() {
            if let Some(turn_id) = &execution.turn_id {
                let status: Option<String> = self
                    .conn
                    .query_row(
                        "SELECT status FROM turns WHERE id = ?1 AND session_id = ?2",
                        params![turn_id, session],
                        |row| row.get(0),
                    )
                    .optional()?;
                if status.as_deref() == Some("running") {
                    turn = Some(turn_id.clone());
                }
            } else {
                execution.phase = WorkflowExecutionPhase::Aborted;
                execution.ended_at = Some(now_ms());
                execution.uncertain_admission = false;
                execution.error_code = Some("TURN_ABORTED".into());
                run.stages[execution.stage_id.index()].status = WorkflowStageStatus::Failed;
                run.stages[execution.stage_id.index()].awaiting_confirmation = false;
                self.persist_workflow(&mut document)?;
            }
        }
        transaction.commit()?;
        Ok(serde_json::json!({ "sessionId": session, "turnId": turn }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stopping_a_pending_reservation_prevents_dispatch_and_preserves_history() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        let path = dir.path().join("project");
        std::fs::create_dir_all(&path).unwrap();
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
            .create_workflow_run(&group.id, "Stop pending", 0)
            .unwrap()
            .runs[0]
            .id
            .clone();
        let attempt = db
            .reserve_discovery(&group.id, &run, &session.id, "req", 1)
            .unwrap();
        let target = db.workflow_stop_target(&attempt.execution.id).unwrap();
        assert!(target["turnId"].is_null());
        assert!(db
            .begin_workflow_turn(&attempt.execution.id, &session.id, None, None)
            .is_err());
        let history = db.read_workflow_history(&group.id).unwrap();
        assert_eq!(
            history.runs[0].executions[0].phase,
            WorkflowExecutionPhase::Aborted
        );
        assert!(!db.workflow_session_reserved(&session.id, None).unwrap());
        let ordinary = crate::sessions::begin_turn(&db, &session.id, None, None).unwrap();
        assert!(db.workflow_stop_target(&attempt.execution.id).unwrap()["turnId"].is_null());
        assert!(crate::sessions::session_has_running_turn(&db, &session.id).unwrap());
        crate::sessions::end_turn(&db, &ordinary, "completed", None, None, false).unwrap();
    }
}
