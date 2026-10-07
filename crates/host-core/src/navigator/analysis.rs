//! Host-owned admission lease and immutable navigation evidence snapshots.
use crate::db::{now_ms, Database};
use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension};
use serde_json::{json, Value};

pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS navigator_analyses (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL, activity_version INTEGER NOT NULL, session_seq INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('running','completed','failed','cancelled','interrupted')),
 created_at INTEGER NOT NULL, finished_at INTEGER, snapshot_json TEXT NOT NULL,
 result_json TEXT NOT NULL DEFAULT '{}', UNIQUE(session_id,request_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_navigator_one_analysis ON navigator_analyses(session_id) WHERE status='running';
"#;

pub fn reserved(db: &Database, session: &str) -> Result<bool> {
    Ok(db.conn().query_row(
        "SELECT EXISTS(SELECT 1 FROM navigator_analyses WHERE session_id=?1 AND status='running')",
        [session],
        |r| r.get(0),
    )?)
}

pub fn recover(db: &Database) -> Result<()> {
    db.conn().execute(
        "UPDATE navigator_analyses SET status='interrupted',finished_at=?1 WHERE status='running'",
        [now_ms()],
    )?;
    Ok(())
}

pub fn assert_read(db: &Database, session: &str, analysis: &str, path: &str) -> Result<()> {
    let snapshot: Option<String> = db.conn().query_row("SELECT snapshot_json FROM navigator_analyses WHERE id=?1 AND session_id=?2 AND status='running'", params![analysis,session], |r|r.get(0)).optional()?;
    let snapshot: Value =
        serde_json::from_str(&snapshot.ok_or_else(|| anyhow!("navigation analysis inactive"))?)?;
    if db
        .conn()
        .query_row(
            "SELECT schema_version FROM navigator_activities WHERE id=?1 AND session_id=?2",
            params![snapshot["activityId"].as_str(), session],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
        != Some(1)
    {
        return Err(anyhow!("unsupported activity format"));
    }
    if !snapshot["results"].as_array().is_some_and(|rows| {
        rows.iter()
            .any(|r| r["kind"] == "file" && r["path"].as_str() == Some(path))
    }) {
        return Err(anyhow!("file is outside selected navigation evidence"));
    }
    Ok(())
}

pub fn begin(
    db: &Database,
    session: &str,
    activity: &str,
    request: &str,
    expected: i64,
    selected: &[String],
) -> Result<Value> {
    if request.trim().is_empty() || request.len() > 256 || request.contains('\0') {
        return Err(anyhow!("invalid requestId"));
    }
    if selected.len() > 100 {
        return Err(anyhow!("too many selected results"));
    }
    let tx = db.conn().unchecked_transaction()?;
    let version: Option<i64> = tx.query_row("SELECT version FROM navigator_activities WHERE id=?1 AND session_id=?2 AND schema_version=1 AND ended_at IS NOT NULL AND hidden=0",params![activity,session],|r|r.get(0)).optional()?;
    if version != Some(expected) {
        return Err(anyhow!("ended activity changed or unavailable"));
    }
    let busy: bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM turns WHERE session_id=?1 AND status='running') OR EXISTS(SELECT 1 FROM turn_queue WHERE session_id=?1) OR EXISTS(SELECT 1 FROM navigator_analyses WHERE session_id=?1 AND (status='running' OR request_id=?2))",params![session,request],|r|r.get(0))?;
    if busy
        || db.workflow_session_reserved(session, None)?
        || db.free_task_session_reserved(session, None)?
        || db.free_task_project_reserved(session, None)?
    {
        return Err(anyhow!("AGENT_BUSY"));
    }
    let (seq, project, mode): (i64,Option<String>,String)=tx.query_row("SELECT s.last_seq,p.path,s.mode FROM sessions s LEFT JOIN projects p ON p.id=s.project_id WHERE s.id=?1 AND s.deleted_at IS NULL",[session],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?)))?;
    let mut stmt=tx.prepare("SELECT r.id,r.message_id,m.text FROM navigator_requests r LEFT JOIN messages m ON m.id=r.message_id AND m.session_id=r.session_id WHERE r.activity_id=?1 AND r.session_id=?2 ORDER BY r.created_at")?;
    let requests: Vec<Value>=stmt.query_map(params![activity,session],|r|Ok(json!({"id":r.get::<_,String>(0)?,"messageId":r.get::<_,String>(1)?,"content":r.get::<_,Option<String>>(2)?})))?.collect::<rusqlite::Result<_>>()?;
    drop(stmt);
    let mut results = Vec::new();
    for id in selected {
        if results.iter().any(|r: &Value| r["id"] == *id) {
            return Err(anyhow!("duplicate selected result"));
        }
        let result: Option<Value>=tx.query_row("SELECT r.id,r.kind,r.label,r.path,r.source_message_id,r.source_turn_id,r.provenance,r.verification,m.text FROM navigator_results r LEFT JOIN messages m ON m.id=r.source_message_id AND m.session_id=?3 WHERE r.id=?1 AND r.activity_id=?2 AND r.removed=0",params![id,activity,session],|r|Ok(json!({"id":r.get::<_,String>(0)?,"kind":r.get::<_,String>(1)?,"label":r.get::<_,String>(2)?,"path":r.get::<_,Option<String>>(3)?,"sourceMessageId":r.get::<_,Option<String>>(4)?,"sourceTurnId":r.get::<_,Option<String>>(5)?,"provenance":r.get::<_,String>(6)?,"verification":r.get::<_,String>(7)?,"content":r.get::<_,Option<String>>(8)?}))).optional()?;
        results.push(result.ok_or_else(|| anyhow!("selected result unavailable"))?);
    }
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_ms();
    let snapshot = json!({"analysisId":id,"requestId":request,"sessionId":session,"activityId":activity,"activityVersion":expected,"createdAt":now,"requests":requests,"results":results,"projectPath":project,"mode":mode});
    tx.execute("INSERT INTO navigator_analyses(id,session_id,activity_id,request_id,activity_version,session_seq,status,created_at,snapshot_json) VALUES(?1,?2,?3,?4,?5,?6,'running',?7,?8)",params![id,session,activity,request,expected,seq,now,serde_json::to_string(&snapshot)?])?;
    tx.commit()?;
    Ok(snapshot)
}

pub fn finish(
    db: &Database,
    session: &str,
    activity: &str,
    analysis: &str,
    input: &Value,
) -> Result<Value> {
    let status = input["status"]
        .as_str()
        .ok_or_else(|| anyhow!("status required"))?;
    if !matches!(status, "completed" | "failed" | "cancelled") {
        return Err(anyhow!("invalid analysis status"));
    }
    let request = input["requestId"]
        .as_str()
        .ok_or_else(|| anyhow!("requestId required"))?;
    if input.get("rawText").is_some_and(|v| !v.is_string())
        || input
            .get("diagnostic")
            .is_some_and(|v| !v.is_null() && !v.is_string())
        || input
            .get("provenance")
            .is_some_and(|v| !v.is_null() && !v.is_object())
    {
        return Err(anyhow!("invalid analysis result"));
    }
    let suggestions = input.get("suggestions").cloned().unwrap_or(json!([]));
    let rows = suggestions
        .as_array()
        .ok_or_else(|| anyhow!("invalid suggestions"))?;
    if rows.len() > 4
        || rows.iter().any(|s| {
            !s["skillId"]
                .as_str()
                .is_some_and(|v| !v.trim().is_empty() && v.len() <= 256)
                || !s["reason"]
                    .as_str()
                    .is_some_and(|v| !v.trim().is_empty() && v.len() <= 4096)
                || !s["basis"].as_array().is_some_and(|basis| {
                    basis.len() <= 20
                        && basis.iter().all(|v| {
                            v.as_str()
                                .is_some_and(|v| !v.trim().is_empty() && v.len() <= 4096)
                        })
                })
        })
    {
        return Err(anyhow!("invalid suggestions"));
    }
    let result = json!({"rawText":input.get("rawText").cloned().unwrap_or(json!("")),"suggestions":suggestions,"diagnostic":input.get("diagnostic"),"provenance":input.get("provenance")});
    let encoded = serde_json::to_string(&result)?;
    if encoded.len() > 1_048_576 {
        return Err(anyhow!("analysis result too large"));
    }
    let changed=db.conn().execute("UPDATE navigator_analyses SET status=?5,finished_at=?6,result_json=?7 WHERE id=?1 AND session_id=?2 AND activity_id=?3 AND request_id=?4 AND status='running'",params![analysis,session,activity,request,status,now_ms(),encoded])?;
    Ok(json!({"ok":changed==1}))
}

pub fn list(db: &Database, session: &str, activity: &str) -> Result<Value> {
    super::results::list(db, session, activity)?;
    let mut stmt=db.conn().prepare("SELECT n.id,n.status,n.created_at,n.finished_at,n.activity_version,n.result_json,n.snapshot_json,(a.version!=n.activity_version OR s.last_seq!=n.session_seq) FROM navigator_analyses n JOIN navigator_activities a ON a.id=n.activity_id JOIN sessions s ON s.id=n.session_id WHERE n.session_id=?1 AND n.activity_id=?2 ORDER BY n.created_at DESC")?;
    let rows = stmt.query_map(params![session, activity], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, i64>(2)?,
            r.get::<_, Option<i64>>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, String>(5)?,
            r.get::<_, String>(6)?,
            r.get::<_, bool>(7)?,
        ))
    })?;
    let mut analyses = Vec::new();
    for row in rows {
        let (id, status, created, finished, version, result, snapshot, stale) = row?;
        let mut value: Value = serde_json::from_str(&result)?;
        let object = value
            .as_object_mut()
            .ok_or_else(|| anyhow!("invalid persisted analysis"))?;
        object.entry("rawText").or_insert(json!(""));
        object.entry("suggestions").or_insert(json!([]));
        object.entry("diagnostic").or_insert(Value::Null);
        object.entry("provenance").or_insert(Value::Null);
        let snapshot: Value = serde_json::from_str(&snapshot)?;
        object.extend(json!({"id":id,"requestId":snapshot["requestId"],"sessionId":session,"activityId":activity,"status":status,"createdAt":created,"finishedAt":finished,"activityVersion":version,"snapshot":snapshot,"stale":stale}).as_object().cloned().unwrap_or_default());
        analyses.push(value);
    }
    Ok(json!({"analyses":analyses}))
}
