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
    let version = list(&db, &session).unwrap()["activities"][0]["version"].clone();
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
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["version"],
        version
    );
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

#[test]
fn navigator_results_user_journey_curates_references_without_deleting_sources() {
    let (directory, db, session) = fixture();
    let turn = submit(&db, &session, "request-results", &["to-spec"]);
    let reply: sessions::UiMessage = serde_json::from_value(json!({"id":"reply-results","role":"assistant","content":"Tests passed according to the model", "createdAt":"2026-10-07T00:00:01Z"})).unwrap();
    sessions::append_message(&db, &session, &reply, Some(&turn)).unwrap();
    let activity = format!("navigator:{session}:request-results");
    let snapshot = results::list(&db, &session, &activity).unwrap();
    let initial = snapshot["version"].as_i64().unwrap();
    assert_eq!(snapshot["results"][0]["sourceMessageId"], "reply-results");
    assert_eq!(snapshot["results"][0]["provenance"], "native");
    assert_eq!(snapshot["results"].as_array().unwrap().len(), 1); // Never infer a passing validation from prose.
    let file = json!({"kind":"file","label":"Specification","path":"docs/spec.md"});
    let added = results::mutate(&db, &session, &activity, initial, &file, false).unwrap();
    assert_eq!(added["results"][1]["verification"], "unverified");
    assert!(results::mutate(&db, &session, &activity, initial, &file, false).is_err());
    let other = sessions::create_session(&db, None, None, None, None, None).unwrap();
    assert!(results::list(&db, &other.id, &activity).is_err());
    for path in [
        "../secret",
        "C:\\secret",
        "/secret",
        "docs/../../secret",
        "\\\\server\\file",
    ] {
        assert!(results::mutate(
            &db,
            &session,
            &activity,
            initial + 1,
            &json!({"kind":"file","label":"bad","path":path}),
            false
        )
        .is_err());
    }
    let id = added["results"][1]["id"].clone();
    let removed = results::mutate(
        &db,
        &session,
        &activity,
        initial + 1,
        &json!({"resultId":id}),
        true,
    )
    .unwrap();
    assert_eq!(removed["results"].as_array().unwrap().len(), 1);
    assert_eq!(removed["version"], initial + 2);
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(
        results::list(&db, &session, &activity).unwrap()["results"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert!(db
        .conn()
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM turns WHERE id=?1)",
            [&turn],
            |r| r.get::<_, bool>(0)
        )
        .unwrap());
    db.conn()
        .execute("DELETE FROM sessions WHERE id=?1", [&session])
        .unwrap();
    assert_eq!(
        db.conn()
            .query_row("SELECT COUNT(*) FROM navigator_results", [], |r| r
                .get::<_, i64>(0))
            .unwrap(),
        0
    );
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
    db.conn().execute_batch("DROP TABLE navigator_boundaries; DROP TABLE navigator_bindings; DROP TABLE navigator_requests; DROP TABLE navigator_activities; PRAGMA user_version=21;").unwrap();
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

fn boundary(db: &Database, session: &str, action: &str) -> Value {
    let snapshot = list(db, session).unwrap();
    let activity = &snapshot["activities"][0];
    control(
        db,
        session,
        activity["id"].as_str().unwrap(),
        activity["version"].as_i64().unwrap(),
        action,
    )
    .unwrap()
}

#[test]
fn navigator_multi_round_discussion_public_path_ends_only_on_explicit_action() {
    let (_dir, db, session) = fixture();
    let first = submit(&db, &session, "requirements", &["grill-with-docs"]);
    let original = list(&db, &session).unwrap();
    let id = original["activeActivityId"].as_str().unwrap().to_owned();
    assert!(control(&db, &session, &id, 2, "end").is_err());
    sessions::end_turn(&db, &first, "completed", None, None, false).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["endedAt"],
        Value::Null
    );
    let second = submit(&db, &session, "answer-one", &[]);
    sessions::end_turn(&db, &second, "completed", None, None, false).unwrap();
    let third = submit(&db, &session, "answer-two", &[]);
    sessions::end_turn(&db, &third, "completed", None, None, false).unwrap();
    let rounds = list(&db, &session).unwrap();
    assert_eq!(rounds["activities"].as_array().unwrap().len(), 1);
    assert_eq!(
        rounds["activities"][0]["requests"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    assert_eq!(
        rounds["activities"][0]["requests"][1]["requestedSkills"],
        json!([])
    );
    assert!(control(&db, &session, &id, 2, "end").is_err()); // stale CAS
    let ended = boundary(&db, &session, "end");
    assert!(ended["activities"][0]["endedAt"].is_number());
    assert_eq!(ended["activeActivityId"], Value::Null);
    let unrelated = submit(&db, &session, "unrelated", &[]);
    sessions::end_turn(&db, &unrelated, "completed", None, None, false).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"]
            .as_array()
            .unwrap()
            .len(),
        3
    );
    boundary(&db, &session, "continue");
    let renewed = submit(&db, &session, "new-question", &[]);
    sessions::end_turn(&db, &renewed, "completed", None, None, false).unwrap();
    let reopened = list(&db, &session).unwrap();
    assert_eq!(reopened["activities"][0]["endedAt"], Value::Null);
    assert_eq!(reopened["activities"][0]["boundaries"][0]["action"], "end");
    assert_eq!(
        reopened["activities"][0]["boundaries"][1]["action"],
        "continue"
    );
    assert_eq!(
        reopened["activities"][0]["requests"]
            .as_array()
            .unwrap()
            .len(),
        4
    );
    boundary(&db, &session, "leave");
    assert_eq!(
        list(&db, &session).unwrap()["activeActivityId"],
        Value::Null
    );
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["endedAt"],
        Value::Null
    );
}

#[test]
fn navigator_binding_survives_v22_restart_and_never_crosses_sessions() {
    let (directory, db, session) = fixture();
    let turn = submit(&db, &session, "requirements", &["grill-with-docs"]);
    let id = list(&db, &session).unwrap()["activeActivityId"]
        .as_str()
        .unwrap()
        .to_owned();
    sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
    let other = sessions::create_session(&db, None, None, None, None, None).unwrap();
    assert!(control(&db, &other.id, &id, 2, "continue").is_err());
    let ordinary = submit(&db, &other.id, "other-answer", &[]);
    sessions::end_turn(&db, &ordinary, "completed", None, None, false).unwrap();
    assert_eq!(list(&db, &other.id).unwrap()["activities"], json!([]));
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(list(&db, &session).unwrap()["activeActivityId"], id);
    db.conn()
        .execute(
            "UPDATE navigator_activities SET hidden=1 WHERE id=?1",
            [&id],
        )
        .unwrap();
    assert_eq!(list(&db, &session).unwrap()["activeActivityId"], id);
    boundary(&db, &session, "leave");
    db.conn()
        .execute_batch("DROP TABLE navigator_bindings")
        .unwrap();
    drop(db);
    let db = Database::open(&directory.path().join("navigator.sqlite")).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        list(&db, &session).unwrap()["activeActivityId"],
        Value::Null
    );
}

#[test]
fn navigator_queued_answer_freezes_binding_and_blocks_boundaries_until_resolved() {
    let (_dir, db, session) = fixture();
    let first = submit(&db, &session, "requirements", &["grill-with-docs"]);
    sessions::end_turn(&db, &first, "completed", None, None, false).unwrap();
    let input: turn_queue::QueuedTurnInput = serde_json::from_value(json!({"sessionId":session,"principal":"desktop","inputHash":"answer","content":"ordinary answer","permissionMode":"ask","userMessageId":"queued-answer"})).unwrap();
    let queue = turn_queue::push(&db, input).unwrap();
    record_queue(&db, &queue.id, &[]).unwrap();
    let before = list(&db, &session).unwrap();
    let activity = &before["activities"][0];
    assert!(control(
        &db,
        &session,
        activity["id"].as_str().unwrap(),
        activity["version"].as_i64().unwrap(),
        "leave"
    )
    .is_err());
    assert_eq!(activity["requests"].as_array().unwrap().len(), 2);
    turn_queue::remove(&db, &queue.id).unwrap();
    let dispatch = submit(&db, &session, "queued-answer", &[]);
    sessions::end_turn(&db, &dispatch, "completed", None, None, false).unwrap();
    assert_eq!(
        list(&db, &session).unwrap()["activities"][0]["requests"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    boundary(&db, &session, "end");
}
