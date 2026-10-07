use super::*;
use crate::{sessions, turn_queue};

fn fixture() -> (tempfile::TempDir, Database, String) {
    let directory =
        tempfile::tempdir_in(std::env::var("TEMP").unwrap_or_else(|_| ".".into())).unwrap();
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    let session = sessions::create_session(&db, None, None, None, None, None).unwrap();
    (directory, db, session.id)
}

#[test]
fn navigator_hide_restore_restart_preserves_source_and_activity_state() {
    let (directory, db, session) = fixture();
    let turn = submit(&db, &session, "history", &["to-spec"]);
    let id = format!("navigator:{session}:history");
    db.conn()
        .execute("UPDATE navigator_activities SET ended_at=123", [])
        .unwrap();
    set_hidden(&db, &session, &id, true).unwrap();
    set_hidden(&db, &session, &id, true).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["hidden"],
        true
    );
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["endedAt"],
        123
    );
    assert_eq!(list(&db, &session).unwrap()["activities"][0]["version"], 1);
    sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["hidden"],
        true
    );
    set_hidden(&db, &session, &id, false).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"][0]["outcome"],
        "normal"
    );
    let messages: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id=?1",
            [&session],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(messages, 1);
    let other = sessions::create_session(&db, None, None, None, None, None).unwrap();
    assert!(set_hidden(&db, &other.id, &id, true).is_err());
    db.conn()
        .execute("UPDATE navigator_activities SET schema_version=99", [])
        .unwrap();
    assert!(set_hidden(&db, &session, &id, true).is_err());
    assert_eq!(list(&db, &session).unwrap()["unavailableCount"], 1);
}

#[test]
fn navigator_session_deletion_cascades_unknown_history_and_late_events_cannot_restore_it() {
    let (_directory, db, session) = fixture();
    let turn = submit(&db, &session, "delete", &["to-spec"]);
    db.conn()
        .execute(
            "UPDATE navigator_activities SET schema_version=99, hidden=1",
            [],
        )
        .unwrap();
    assert!(sessions::delete_session(&db, &session).unwrap());
    assert!(!sessions::delete_session(&db, &session).unwrap());
    mark_unresolved(&db, &turn).unwrap();
    cancel_queue(&db, "late-queue").unwrap();
    record_queue(&db, "late-queue", &["to-spec".into()]).unwrap();
    assert!(set_hidden(&db, &session, &format!("navigator:{session}:delete"), false).is_err());
    for table in ["navigator_activities", "navigator_requests"] {
        assert_eq!(
            db.conn()
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}
fn submit(db: &Database, session: &str, message: &str, skills: &[&str]) -> String {
    let turn = sessions::begin_turn(db, session, None, None).unwrap();
    let mentions: Vec<Value> = skills
        .iter()
        .map(|id| json!({"id":id,"start":0,"end":id.len()+1}))
        .collect();
    let user: sessions::UiMessage = serde_json::from_value(json!({"id":message,"role":"user","content":"actual submitted intent", "command":"/to-spec /code-review", "createdAt":"2026-10-07T00:00:00Z", "skillMentions":mentions})).unwrap();
    sessions::append_message(db, session, &user, Some(&turn)).unwrap();
    sessions::append_message(db, session, &user, Some(&turn)).unwrap();
    turn
}

#[test]
fn navigator_submitted_multi_skill_path_uses_native_outcomes_and_observed_evidence() {
    let (_directory, db, session) = fixture();
    let turn = submit(
        &db,
        &session,
        "request",
        &["to-spec", "code-review", "to-spec"],
    );
    let snapshot = list(&db, &session).unwrap();
    assert_eq!(snapshot["activities"].as_array().unwrap().len(), 1);
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["requestedSkills"],
        json!(["to-spec", "code-review"])
    );
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["outcome"],
        "running"
    );
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["observedSkills"],
        json!([])
    );
    let tool: sessions::UiMessage = serde_json::from_value(json!({"id":"skill-call","role":"tool","content":"instructions", "createdAt":"2026-10-07T00:00:01Z", "toolName":"Skill", "toolCallId":"skill-call", "toolArgs":{"id":"to-spec"},"toolStatus":"success"})).unwrap();
    sessions::append_message(&db, &session, &tool, Some(&turn)).unwrap();
    sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let snapshot = list(&db, &session).unwrap();
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["outcome"],
        "normal"
    );
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["observedSkills"],
        json!(["to-spec"])
    );
    assert_eq!(snapshot["activities"][0]["endedAt"], Value::Null);
}

#[test]
fn navigator_ordinary_and_stale_cross_session_messages_do_not_create_activities() {
    let (_directory, db, session) = fixture();
    let turn = submit(&db, &session, "ordinary", &[]);
    assert_eq!(list(&db, &session).unwrap()["activities"], json!([]));
    let other = sessions::create_session(&db, None, None, None, None, None).unwrap();
    let user: sessions::UiMessage = serde_json::from_value(json!({"id":"stale","role":"user","content":"/to-spec", "createdAt":"2026-10-07T00:00:00Z", "skillMentions":[{"id":"to-spec","start":0,"end":8}]})).unwrap();
    sessions::append_message(&db, &other.id, &user, Some(&turn)).unwrap();
    assert_eq!(list(&db, &other.id).unwrap()["activities"], json!([]));
}

#[test]
fn navigator_restore_preserves_history_marks_unverified_turn_and_never_replays() {
    let (directory, db, session) = fixture();
    submit(&db, &session, "pending", &["discuss-requirements"]);
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"][0]["outcome"],
        "unresolved"
    );
    assert!(turn_queue::list(&db, Some(&session)).unwrap().is_empty());
    db.conn()
        .execute("UPDATE navigator_activities SET schema_version=99", [])
        .unwrap();
    let snapshot = list(&db, &session).unwrap();
    assert_eq!(snapshot["unavailableCount"], 1);
    assert_eq!(
        db.conn()
            .query_row("SELECT COUNT(*) FROM navigator_activities", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        1
    );
}

#[test]
fn navigator_queue_waiting_binds_native_dispatch_and_cancel_is_truthful() {
    let (_directory, db, session) = fixture();
    let input: turn_queue::QueuedTurnInput = serde_json::from_value(json!({"sessionId":session,"principal":"desktop","inputHash":"hash","content":"/to-spec","permissionMode":"ask","userMessageId":"queued-user"})).unwrap();
    let queue = turn_queue::push(&db, input).unwrap();
    record_queue(&db, &queue.id, &["to-spec".into()]).unwrap();
    record_queue(&db, &queue.id, &["to-spec".into()]).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"][0]["outcome"],
        "waiting"
    );
    turn_queue::remove(&db, &queue.id).unwrap();
    let turn = submit(&db, &session, "queued-user", &["to-spec"]);
    cancel_queue(&db, &queue.id).unwrap();
    let snapshot = list(&db, &session).unwrap();
    assert_eq!(snapshot["activities"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["activities"][0]["requests"][0]["turnId"], turn);
    assert_eq!(
        snapshot["activities"][0]["requests"][0]["outcome"],
        "running"
    );
    sessions::end_turn(&db, &turn, "error", Some("MODEL_FAILURE"), None, false).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"][0]["outcome"],
        "failed"
    );
    let turn = submit(&db, &session, "stop-user", &["to-spec"]);
    sessions::end_turn(&db, &turn, "aborted", Some("TURN_ABORTED"), None, false).unwrap();
    let stopped = list(&db, &session).unwrap();
    let request = stopped["activities"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|activity| activity["requests"].as_array().unwrap())
        .find(|request| request["messageId"] == "stop-user")
        .unwrap();
    assert_eq!(request["outcome"], "cancelled");
    sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let stopped = list(&db, &session).unwrap();
    let request = stopped["activities"]
        .as_array()
        .unwrap()
        .iter()
        .flat_map(|activity| activity["requests"].as_array().unwrap())
        .find(|request| request["messageId"] == "stop-user")
        .unwrap();
    assert_eq!(request["outcome"], "cancelled");
}

#[test]
fn navigator_v21_upgrade_preserves_sessions_and_is_idempotent() {
    let (directory, db, session) = fixture();
    db.conn().execute_batch("DROP TABLE navigator_requests; DROP TABLE navigator_activities; PRAGMA user_version=21;").unwrap();
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(list(&db, &session).unwrap()["activities"], json!([]));
    submit(&db, &session, "new", &["to-spec"]);
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}
