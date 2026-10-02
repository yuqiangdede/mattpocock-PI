use super::*;

#[test]
fn malformed_normal_outcome_without_an_admitted_turn_is_preserved_and_cannot_be_accepted() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let admission = db
        .reserve_discovery(&group, &run, &session, "normal", 1)
        .unwrap();
    let turn = db
        .begin_workflow_turn(&admission.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let mut invalid = db.kv_get(WORKFLOW_NAMESPACE, &group).unwrap().unwrap();
    invalid["runs"][0]["executions"][0]["turnId"] = Value::Null;
    db.kv_set(WORKFLOW_NAMESPACE, &group, &invalid).unwrap();
    assert!(db.read_workflow_history(&group).is_err());
    db.recover_workflow_executions().unwrap();
    assert_eq!(
        db.kv_get(WORKFLOW_NAMESPACE, &group).unwrap(),
        Some(invalid)
    );
}

#[test]
fn a_supervised_runtime_crash_is_interrupted_even_when_the_turn_status_is_aborted() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let reserved = db
        .reserve_discovery(&group, &run, &session, "crash", 1)
        .unwrap();
    let turn = db
        .begin_workflow_turn(&reserved.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(
        &db,
        &turn,
        "aborted",
        Some("AGENT_SIDECAR_CRASHED"),
        None,
        false,
    )
    .unwrap();
    let history = db.read_workflow_history(&group).unwrap();
    assert_eq!(
        history.runs[0].executions[0].phase,
        WorkflowExecutionPhase::Interrupted
    );
    assert!(!history.runs[0].stages[0].awaiting_confirmation);
    assert!(db.check_discovery(&group, &run, &session).is_ok());
}

#[test]
fn stop_retry_and_continue_preserve_bound_attempts_and_withdraw_confirmation() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let first = db
        .reserve_discovery(&group, &run, &session, "first", 1)
        .unwrap();
    let turn = db
        .begin_workflow_turn(&first.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(&db, &turn, "aborted", Some("TURN_ABORTED"), None, false).unwrap();
    let history = db.read_workflow_history(&group).unwrap();
    assert_eq!(
        serde_json::to_value(history.runs[0].executions[0].phase).unwrap(),
        "aborted"
    );
    assert!(db.check_discovery(&group, &run, &session).is_ok());
    let second = db
        .reserve_discovery(&group, &run, &session, "retry", history.revision)
        .unwrap();
    assert_ne!(first.execution.id, second.execution.id);
    let turn = db
        .begin_workflow_turn(&second.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let history = db.read_workflow_history(&group).unwrap();
    assert!(history.runs[0].stages[0].awaiting_confirmation);
    let third = db
        .reserve_discovery(&group, &run, &session, "continue", history.revision)
        .unwrap();
    assert!(!third.history.runs[0].stages[0].awaiting_confirmation);
    let turn = db
        .begin_workflow_turn(&third.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(&db, &turn, "error", Some("PROVIDER_FAILURE"), None, false).unwrap();
    let history = db.read_workflow_history(&group).unwrap();
    assert_eq!(history.runs[0].executions.len(), 3);
    assert_eq!(history.runs[0].executions[0].session_id, session);
    assert!(!history.runs[0].stages[0].awaiting_confirmation);
    assert_eq!(
        history.runs[0].stages[1].status,
        WorkflowStageStatus::Locked
    );
}

fn fixture(db: &Database, path: &Path) -> (String, String, String) {
    std::fs::create_dir_all(path).unwrap();
    let session = crate::sessions::create_session(
        db,
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
    let history = db
        .create_workflow_run(&group.id, "Discovery effort", 0)
        .unwrap();
    (group.id, history.runs[0].id.clone(), session.id)
}

#[test]
fn retry_can_bind_another_existing_group_session_without_rebinding_history() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let path = dir.path().join("project");
    let (group, run, first_session) = fixture(&db, &path);
    let first = db
        .reserve_discovery(&group, &run, &first_session, "first", 1)
        .unwrap();
    db.reconcile_workflow_execution(&first.execution.id, Some("WORKFLOW_SKILL_UNAVAILABLE"))
        .unwrap();
    let second_session = crate::sessions::create_session(
        &db,
        None,
        None,
        None,
        None,
        Some(path.to_string_lossy().into_owned()),
    )
    .unwrap();
    let history = db.read_workflow_history(&group).unwrap();
    let second = db
        .reserve_discovery(&group, &run, &second_session.id, "retry", history.revision)
        .unwrap();
    assert_eq!(
        second.history.runs[0].executions[0].session_id,
        first_session
    );
    assert_eq!(second.execution.session_id, second_session.id);
    assert!(!second.history.runs[0].stages[0].awaiting_confirmation);
    assert!(db
        .archive_workflow_run(&group, &run, second.history.revision)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_BUSY"));
    assert!(db
        .reserve_discovery(
            &group,
            &run,
            &first_session,
            "third",
            second.history.revision
        )
        .is_err());
}

#[test]
fn discovery_reserves_an_existing_project_session_without_accepting_spec() {
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
    let group = db.list_project_groups().unwrap().pop().unwrap();
    let history = db
        .create_workflow_run(&group.id, "Discovery effort", 0)
        .unwrap();
    let admission = db
        .reserve_discovery(&group.id, &history.runs[0].id, &session.id, "request-1", 1)
        .unwrap();
    assert!(admission.new_reservation);
    assert_eq!(admission.execution.phase, WorkflowExecutionPhase::Pending);
    assert!(admission.execution.turn_id.is_none());
    assert_eq!(
        admission.history.runs[0].stages[1].status,
        WorkflowStageStatus::Locked
    );
}

#[test]
fn normal_terminal_before_admission_reply_is_durable_idempotent_and_never_accepts_spec() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let reserved = db
        .reserve_discovery(&group, &run, &session, "req", 1)
        .unwrap();
    assert!(crate::sessions::begin_turn(&db, &session, None, None).is_err());
    let turn = db
        .begin_workflow_turn(&reserved.execution.id, &session, None, None)
        .unwrap();
    crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let settled = db
        .mark_workflow_running(&reserved.execution.id, &turn)
        .unwrap();
    assert_eq!(
        settled.runs[0].executions[0].phase,
        WorkflowExecutionPhase::Normal
    );
    assert!(settled.runs[0].stages[0].awaiting_confirmation);
    assert_eq!(
        settled.runs[0].stages[1].status,
        WorkflowStageStatus::Locked
    );
    crate::sessions::end_turn(&db, &turn, "error", Some("UNRELATED"), None, false).unwrap();
    assert_eq!(
        db.read_workflow_history(&group).unwrap().revision,
        settled.revision
    );
    let ordinary = crate::sessions::begin_turn(&db, &session, None, None).unwrap();
    crate::sessions::end_turn(&db, &ordinary, "error", None, None, false).unwrap();
    assert_eq!(
        db.read_workflow_history(&group).unwrap().revision,
        settled.revision
    );
}

#[test]
fn busy_and_queued_sessions_are_rejected_without_changing_the_ordinary_queue() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let ordinary = crate::sessions::begin_turn(&db, &session, None, None).unwrap();
    assert!(db
        .reserve_discovery(&group, &run, &session, "req", 1)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_BUSY"));
    crate::sessions::end_turn(&db, &ordinary, "completed", None, None, false).unwrap();
    let input = serde_json::from_value::<crate::turn_queue::QueuedTurnInput>(serde_json::json!({"sessionId":session,"principal":"desktop","inputHash":"fixed","content":"ordinary queued work","permissionMode":"ask"})).unwrap();
    crate::turn_queue::push(&db, input).unwrap();
    assert!(db
        .reserve_discovery(&group, &run, &session, "req", 1)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_QUEUED"));
    let count: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM turn_queue WHERE session_id=?1",
            params![session],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
    assert!(db.read_workflow_history(&group).unwrap().runs[0]
        .executions
        .is_empty());
}

#[test]
fn duplicate_requests_never_dispatch_twice_and_later_ordinary_input_remains_queued() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let (group, run, session) = fixture(&db, &dir.path().join("project"));
    let first = db
        .reserve_discovery(&group, &run, &session, "req", 1)
        .unwrap();
    let duplicate = db
        .reserve_discovery(&group, &run, &session, "req", 1)
        .unwrap();
    assert!(!duplicate.new_reservation);
    assert_eq!(first.execution.id, duplicate.execution.id);
    assert!(db
        .reserve_discovery(&group, &run, &session, "second", first.history.revision)
        .is_err());
    let input = serde_json::from_value::<crate::turn_queue::QueuedTurnInput>(serde_json::json!({"sessionId":session,"principal":"desktop","inputHash":"race","content":"queued during reservation","permissionMode":"ask"})).unwrap();
    crate::turn_queue::push(&db, input).unwrap();
    let turn = db
        .begin_workflow_turn(&first.execution.id, &session, None, None)
        .unwrap();
    assert_eq!(
        crate::turn_queue::list(&db, Some(&session)).unwrap().len(),
        1
    );
    crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let settled = db.read_workflow_history(&group).unwrap();
    assert_eq!(
        settled.runs[0].executions[0].phase,
        WorkflowExecutionPhase::Normal
    );
    assert_eq!(
        settled.runs[0].stages[1].status,
        WorkflowStageStatus::Locked
    );
}

#[test]
fn uncertain_admission_rehydrates_live_state_and_full_restart_interrupts_without_replay() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pi.sqlite");
    let (group, execution, turn) = {
        let db = Database::open(&path).unwrap();
        let (group, run, session) = fixture(&db, &dir.path().join("project"));
        let admission = db
            .reserve_discovery(&group, &run, &session, "req", 1)
            .unwrap();
        let turn = db
            .begin_workflow_turn(&admission.execution.id, &session, None, None)
            .unwrap();
        let state = db
            .reconcile_workflow_execution(&admission.execution.id, None)
            .unwrap();
        assert!(state.runs[0].executions[0].uncertain_admission);
        assert_eq!(
            state.runs[0].executions[0].turn_id.as_deref(),
            Some(turn.as_str())
        );
        assert_eq!(
            db.read_workflow_history(&group).unwrap().runs[0].executions[0].phase,
            WorkflowExecutionPhase::Pending
        );
        (group, admission.execution.id, turn)
    };
    let db = Database::open(&path).unwrap();
    let recovered = db.read_workflow_history(&group).unwrap();
    assert_eq!(recovered.runs[0].executions[0].id, execution);
    assert_eq!(
        recovered.runs[0].executions[0].phase,
        WorkflowExecutionPhase::Interrupted
    );
    assert_eq!(
        recovered.runs[0].stages[1].status,
        WorkflowStageStatus::Locked
    );
    let count: i64 = db
        .conn
        .query_row(
            "SELECT COUNT(*) FROM turns WHERE id=?1",
            params![turn],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1);
}

#[test]
fn project_mode_approval_and_stale_revision_blockers_preserve_workflow_data() {
    let dir = tempfile::tempdir().unwrap();
    let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
    let project = dir.path().join("a");
    let (group, run, session) = fixture(&db, &project);
    assert!(db
        .check_discovery(&group, &run, "")
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_SESSION_REQUIRED"));
    let other = crate::sessions::create_session(
        &db,
        None,
        None,
        None,
        None,
        Some(dir.path().join("b").to_string_lossy().into_owned()),
    )
    .unwrap();
    assert!(db
        .check_discovery(&group, &run, &other.id)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_PROJECT_MISMATCH"));
    let plan = crate::sessions::create_session(
        &db,
        None,
        Some("plan".into()),
        None,
        None,
        Some(project.to_string_lossy().into_owned()),
    )
    .unwrap();
    assert!(db
        .check_discovery(&group, &run, &plan.id)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_AGENT_MODE_REQUIRED"));
    db.conn.execute("INSERT INTO plan_approvals(request_id,session_id,turn_id,tool_call_id,plan_json,status,created_at,updated_at) VALUES('approval',?1,'fixture-turn','fixture-call','{}','pending',1,1)", params![session]).unwrap();
    assert!(db
        .check_discovery(&group, &run, &session)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_APPROVAL_PENDING"));
    assert!(db
        .reserve_discovery(&group, &run, &session, "req", 0)
        .unwrap_err()
        .to_string()
        .starts_with("WORKFLOW_CONFLICT"));
    assert!(db.read_workflow_history(&group).unwrap().runs[0]
        .executions
        .is_empty());
}

#[test]
fn simultaneous_discovery_requests_have_one_persisted_reservation() {
    use std::sync::{Arc, Barrier};
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("pi.sqlite");
    let (group, run, session) = {
        let db = Database::open(&path).unwrap();
        fixture(&db, &dir.path().join("project"))
    };
    let barrier = Arc::new(Barrier::new(2));
    let workers = (0..2)
        .map(|index| {
            let path = path.clone();
            let group = group.clone();
            let run = run.clone();
            let session = session.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let db = Database::open(&path).unwrap();
                barrier.wait();
                db.reserve_discovery(&group, &run, &session, &format!("request-{index}"), 1)
                    .is_ok()
            })
        })
        .collect::<Vec<_>>();
    assert_eq!(
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|success| *success)
            .count(),
        1
    );
    let db = Database::open(&path).unwrap();
    assert_eq!(
        db.read_workflow_history(&group).unwrap().runs[0]
            .executions
            .len(),
        1
    );
}
