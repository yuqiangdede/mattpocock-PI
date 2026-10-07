//! Conversation-owned navigation metadata. Native turns remain the outcome authority.
use crate::db::{now_ms, Database};
use crate::transcripts::MessageRecord;
use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::{json, Value};
pub mod analysis;
pub mod results;
#[cfg(test)]
mod tests;

pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS navigator_activities (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 schema_version INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, ended_at INTEGER, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_navigator_session ON navigator_activities(session_id, created_at);
CREATE TABLE IF NOT EXISTS navigator_bindings (
 session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
 activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS navigator_boundaries (
 activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE,
 version INTEGER NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(activity_id, version)
);
CREATE TABLE IF NOT EXISTS navigator_requests (
 id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL, turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
 queue_id TEXT, fallback_outcome TEXT NOT NULL DEFAULT 'unresolved', recovered INTEGER NOT NULL DEFAULT 0,
 requested_skills_json TEXT NOT NULL, observed_skills_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
 UNIQUE(session_id, message_id)
);
CREATE TABLE IF NOT EXISTS navigator_results (
 id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, label TEXT NOT NULL, path TEXT, source_message_id TEXT, source_turn_id TEXT,
 provenance TEXT NOT NULL, verification TEXT NOT NULL, removed INTEGER NOT NULL DEFAULT 0
);
"#;

/// Called in the same transaction as the native message index, never at draft selection.
pub fn record_submission(
    tx: &Transaction<'_>,
    session: &str,
    turn: Option<&str>,
    record: &MessageRecord,
) -> Result<()> {
    if record.role == "assistant" {
        if let Some(turn) = turn {
            results::record_reply(tx, session, turn, record)?;
        }
        return Ok(());
    }
    if record.role == "tool"
        && record.tool_name.as_deref() == Some("Skill")
        && !record.is_error
        && turn.is_some()
        && record
            .meta
            .as_ref()
            .and_then(|m| m.get("parentToolCallId"))
            .is_none()
    {
        if let Some(block) = record.blocks.as_array().and_then(|blocks| {
            blocks
                .iter()
                .find(|b| b["type"] == "tool_call" && b["status"] == "success")
        }) {
            if let Some(skill) = block
                .get("args")
                .and_then(|args| args.get("id"))
                .and_then(Value::as_str)
            {
                tx.execute("UPDATE navigator_requests SET observed_skills_json=json_insert(observed_skills_json, '$[#]', ?3) WHERE session_id=?1 AND turn_id=?2 AND EXISTS(SELECT 1 FROM json_each(requested_skills_json) WHERE value=?3) AND NOT EXISTS(SELECT 1 FROM json_each(observed_skills_json) WHERE value=?3)", params![session, turn, skill])?;
            }
        }
        return Ok(());
    }
    if record.role != "user" || turn.is_none() {
        return Ok(());
    }
    let mentions = record
        .meta
        .as_ref()
        .and_then(|m| m.get("skillMentions"))
        .and_then(Value::as_array);
    let mut skills: Vec<String> = Vec::new();
    for mention in mentions.into_iter().flatten() {
        if let Some(id) = mention
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty() && id.len() <= 256 && !id.contains('\0'))
        {
            if !skills.iter().any(|known| known == id) {
                skills.push(id.to_string());
            }
        }
    }
    let bound = tx.execute("UPDATE navigator_requests SET turn_id=?3 WHERE session_id=?1 AND message_id=?2 AND turn_id IS NULL", params![session, record.id, turn])?;
    if bound > 0 {
        return Ok(());
    }
    let id = format!("navigator:{}:{}", session, record.id);
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM navigator_requests WHERE session_id=?1 AND message_id=?2)",
        params![session, record.id],
        |r| r.get::<_, bool>(0),
    )? {
        return Ok(());
    }
    let activity = selected_activity(tx, session)?;
    if skills.is_empty() && activity.is_none() {
        return Ok(());
    }
    let now = now_ms();
    let activity = activity.unwrap_or_else(|| id.clone());
    tx.execute("INSERT OR IGNORE INTO navigator_activities(id, session_id, created_at) VALUES (?1, ?2, ?3)", params![activity, session, now])?;
    tx.execute("INSERT INTO navigator_requests(id, activity_id, session_id, message_id, turn_id, requested_skills_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![id, activity, session, record.id, turn, serde_json::to_string(&skills)?, now])?;
    tx.execute(
        "UPDATE navigator_activities SET version=version+1 WHERE id=?1",
        [&activity],
    )?;
    tx.execute("INSERT INTO navigator_bindings(session_id,activity_id) VALUES (?1,?2) ON CONFLICT(session_id) DO UPDATE SET activity_id=excluded.activity_id", params![session,activity])?;
    Ok(())
}

pub fn record_queue(db: &Database, queue: &str, skills: &[String]) -> Result<()> {
    if skills.len() > 50
        || skills
            .iter()
            .any(|id| id.is_empty() || id.len() > 256 || id.contains('\0'))
    {
        return Err(anyhow!("invalid requested Skills"));
    }
    let tx = db.conn().unchecked_transaction()?;
    let row: Option<(String, Option<String>)> = tx
        .query_row(
            "SELECT session_id, user_message_id FROM turn_queue WHERE id=?1",
            [queue],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()?;
    // Dispatch may already have claimed the queue. Its appended message owns the record.
    let Some((session, Some(message))) = row else {
        return Ok(());
    };
    let id = format!("navigator:{}:{}", session, message);
    if tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM navigator_requests WHERE session_id=?1 AND message_id=?2)",
        params![session, message],
        |r| r.get::<_, bool>(0),
    )? {
        return Ok(());
    }
    let activity = selected_activity(&tx, &session)?;
    if skills.is_empty() && activity.is_none() {
        return Ok(());
    }
    let activity = activity.unwrap_or_else(|| id.clone());
    let now = now_ms();
    tx.execute("INSERT OR IGNORE INTO navigator_activities(id, session_id, created_at) VALUES (?1, ?2, ?3)", params![activity, session, now])?;
    tx.execute("INSERT INTO navigator_requests(id, activity_id, session_id, message_id, queue_id, requested_skills_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)", params![id, activity, session, message, queue, serde_json::to_string(skills)?, now])?;
    tx.execute(
        "UPDATE navigator_activities SET version=version+1 WHERE id=?1",
        [&activity],
    )?;
    tx.execute("INSERT INTO navigator_bindings(session_id,activity_id) VALUES (?1,?2) ON CONFLICT(session_id) DO UPDATE SET activity_id=excluded.activity_id", params![session,activity])?;
    tx.commit()?;
    Ok(())
}

pub fn cancel_queue(db: &Database, queue: &str) -> Result<()> {
    db.conn().execute("UPDATE navigator_requests SET fallback_outcome='cancelled' WHERE queue_id=?1 AND turn_id IS NULL", [queue])?;
    Ok(())
}

pub fn recover(db: &Database) -> Result<()> {
    analysis::recover(db)?;
    db.conn().execute("UPDATE navigator_requests SET recovered=1 WHERE turn_id IN (SELECT id FROM turns WHERE status='running')", [])?;
    Ok(())
}

pub fn mark_unresolved(db: &Database, turn: &str) -> Result<()> {
    db.conn().execute(
        "UPDATE navigator_requests SET recovered=1 WHERE turn_id=?1",
        [turn],
    )?;
    Ok(())
}

pub fn list(db: &Database, session: &str) -> Result<Value> {
    let exists: bool = db.conn().query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id=?1)",
        [session],
        |r| r.get(0),
    )?;
    if !exists {
        return Err(anyhow!("session not found"));
    }
    let mut stmt = db.conn().prepare("SELECT a.id, a.created_at, a.ended_at, a.hidden, a.version, a.schema_version, r.id, r.message_id, r.turn_id, r.requested_skills_json, COALESCE(CASE WHEN r.recovered=1 THEN 'unresolved' ELSE t.status END, CASE WHEN q.id IS NOT NULL THEN 'waiting' ELSE r.fallback_outcome END), t.error_code, r.observed_skills_json FROM navigator_activities a JOIN navigator_requests r ON r.activity_id=a.id LEFT JOIN turns t ON t.id=r.turn_id AND t.session_id=r.session_id LEFT JOIN turn_queue q ON q.id=r.queue_id AND q.session_id=r.session_id WHERE a.session_id=?1 ORDER BY a.created_at DESC, r.created_at ASC")?;
    let rows = stmt.query_map([session], |r| {
        Ok((
            r.get::<_, String>(0)?,
            r.get::<_, i64>(1)?,
            r.get::<_, Option<i64>>(2)?,
            r.get::<_, bool>(3)?,
            r.get::<_, i64>(4)?,
            r.get::<_, i64>(5)?,
            r.get::<_, String>(6)?,
            r.get::<_, String>(7)?,
            r.get::<_, Option<String>>(8)?,
            r.get::<_, String>(9)?,
            r.get::<_, Option<String>>(10)?,
            r.get::<_, Option<String>>(11)?,
            r.get::<_, String>(12)?,
        ))
    })?;
    let mut activities: Vec<Value> = Vec::new();
    let mut unavailable_count = 0;
    for row in rows {
        let (
            id,
            created,
            ended,
            hidden,
            version,
            schema,
            request,
            message,
            turn,
            skills_json,
            status,
            error,
            observed_json,
        ) = row?;
        let skills = serde_json::from_str::<Vec<String>>(&skills_json);
        let observed = serde_json::from_str::<Vec<String>>(&observed_json);
        if schema != 1 || skills.is_err() || observed.is_err() {
            unavailable_count += 1;
            continue;
        }
        let outcome = match (status.as_deref(), error.as_deref()) {
            (Some("waiting"), _) => "waiting",
            (Some("running"), _) => "running",
            (Some("completed"), _) => "normal",
            (Some("error" | "failed"), _) => "failed",
            (Some("aborted" | "cancelled"), _) => "cancelled",
            _ => "unresolved",
        };
        let request = json!({"id":request,"messageId":message,"turnId":turn,"requestedSkills":skills?,"outcome":outcome,"observedSkills":observed?,"errorCode":error});
        if let Some(activity) = activities.iter_mut().find(|a| a["id"] == id) {
            if let Some(requests) = activity["requests"].as_array_mut() {
                requests.push(request);
            }
        } else {
            activities.push(json!({"id":id,"sessionId":session,"version":version,"createdAt":created,"endedAt":ended,"hidden":hidden,"requests":[request]}));
        }
    }
    for activity in &mut activities {
        let mut boundaries = db.conn().prepare("SELECT version, action, created_at FROM navigator_boundaries WHERE activity_id=?1 ORDER BY version")?;
        let events = boundaries.query_map([activity["id"].as_str().unwrap_or_default()], |r| Ok(json!({"version":r.get::<_,i64>(0)?,"action":r.get::<_,String>(1)?,"createdAt":r.get::<_,i64>(2)?})))?.collect::<rusqlite::Result<Vec<_>>>()?;
        activity["boundaries"] = json!(events);
    }
    let active = selected_activity(db.conn(), session)?;
    Ok(
        json!({"activities":activities,"unavailableCount":unavailable_count,"activeActivityId":active}),
    )
}

fn selected_activity(conn: &rusqlite::Connection, session: &str) -> Result<Option<String>> {
    Ok(conn.query_row("SELECT a.id FROM navigator_bindings b JOIN navigator_activities a ON a.id=b.activity_id AND a.session_id=b.session_id WHERE b.session_id=?1 AND a.ended_at IS NULL AND a.schema_version=1", [session], |r| r.get(0)).optional()?)
}

/// Explicit user boundary, serialized with native message indexing by Host's DB owner.
pub fn control(
    db: &Database,
    session: &str,
    activity: &str,
    version: i64,
    action: &str,
) -> Result<Value> {
    if !matches!(action, "continue" | "end" | "leave") {
        return Err(anyhow!("invalid activity action"));
    }
    let tx = db.conn().unchecked_transaction()?;
    let busy: bool = tx.query_row("SELECT EXISTS(SELECT 1 FROM turns WHERE session_id=?1 AND status='running') OR EXISTS(SELECT 1 FROM turn_queue WHERE session_id=?1)", [session], |r| r.get(0))?;
    if busy || analysis::reserved(db, session)? {
        return Err(anyhow!("conversation busy; wait before changing activity"));
    }
    let changed = tx.execute("UPDATE navigator_activities SET version=version+1, ended_at=CASE WHEN ?4='end' THEN ?5 WHEN ?4='continue' THEN NULL ELSE ended_at END WHERE session_id=?1 AND id=?2 AND version=?3 AND schema_version=1", params![session,activity,version,action,now_ms()])?;
    if changed != 1 {
        return Err(anyhow!(
            "activity changed or unavailable; refresh before retrying"
        ));
    }
    tx.execute("INSERT INTO navigator_boundaries(activity_id,version,action,created_at) VALUES (?1,?2,?3,?4)", params![activity,version+1,action,now_ms()])?;
    if action == "continue" {
        tx.execute("INSERT INTO navigator_bindings(session_id,activity_id) VALUES (?1,?2) ON CONFLICT(session_id) DO UPDATE SET activity_id=excluded.activity_id", params![session,activity])?;
    } else {
        tx.execute(
            "DELETE FROM navigator_bindings WHERE session_id=?1 AND activity_id=?2",
            params![session, activity],
        )?;
    }
    tx.commit()?;
    list(db, session)
}

/// Presentation-only change. Unknown formats and foreign activity identities are immutable.
pub fn set_hidden(db: &Database, session: &str, activity: &str, hidden: bool) -> Result<Value> {
    let tx = db.conn().unchecked_transaction()?;
    let schema: Option<i64> = tx
        .query_row(
            "SELECT schema_version FROM navigator_activities WHERE id=?1 AND session_id=?2",
            params![activity, session],
            |r| r.get(0),
        )
        .optional()?;
    match schema {
        Some(1) => {}
        Some(_) => return Err(anyhow!("unsupported activity format")),
        None => return Err(anyhow!("activity not found")),
    }
    tx.execute(
        "UPDATE navigator_activities SET hidden=?3 WHERE id=?1 AND session_id=?2",
        params![activity, session, hidden],
    )?;
    tx.commit()?;
    Ok(json!({"ok":true}))
}
