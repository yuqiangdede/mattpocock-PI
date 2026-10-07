//! Conversation-owned navigation metadata. Native turns remain the outcome authority.
use crate::db::{now_ms, Database};
use crate::transcripts::MessageRecord;
use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::{json, Value};
#[cfg(test)]
mod tests;

pub const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS navigator_activities (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 schema_version INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL, ended_at INTEGER, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_navigator_session ON navigator_activities(session_id, created_at);
CREATE TABLE IF NOT EXISTS navigator_requests (
 id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES navigator_activities(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL, turn_id TEXT REFERENCES turns(id) ON DELETE SET NULL,
 queue_id TEXT, fallback_outcome TEXT NOT NULL DEFAULT 'unresolved', recovered INTEGER NOT NULL DEFAULT 0,
 requested_skills_json TEXT NOT NULL, observed_skills_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
 UNIQUE(session_id, message_id)
);
"#;

/// Called in the same transaction as the native message index, never at draft selection.
pub fn record_submission(
    tx: &Transaction<'_>,
    session: &str,
    turn: Option<&str>,
    record: &MessageRecord,
) -> Result<()> {
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
    let Some(mentions) = record
        .meta
        .as_ref()
        .and_then(|m| m.get("skillMentions"))
        .and_then(Value::as_array)
    else {
        return Ok(());
    };
    let mut skills: Vec<String> = Vec::new();
    for mention in mentions {
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
    if skills.is_empty() {
        return Ok(());
    }
    let bound = tx.execute("UPDATE navigator_requests SET turn_id=?3 WHERE session_id=?1 AND message_id=?2 AND turn_id IS NULL", params![session, record.id, turn])?;
    if bound > 0 {
        return Ok(());
    }
    let id = format!("navigator:{}:{}", session, record.id);
    let now = now_ms();
    tx.execute("INSERT OR IGNORE INTO navigator_activities(id, session_id, created_at) VALUES (?1, ?2, ?3)", params![id, session, now])?;
    tx.execute("INSERT OR IGNORE INTO navigator_requests(id, activity_id, session_id, message_id, turn_id, requested_skills_json, created_at) VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)", params![id, session, record.id, turn, serde_json::to_string(&skills)?, now])?;
    Ok(())
}

pub fn record_queue(db: &Database, queue: &str, skills: &[String]) -> Result<()> {
    if skills.is_empty() {
        return Ok(());
    }
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
    let now = now_ms();
    tx.execute("INSERT OR IGNORE INTO navigator_activities(id, session_id, created_at) VALUES (?1, ?2, ?3)", params![id, session, now])?;
    tx.execute("INSERT OR IGNORE INTO navigator_requests(id, activity_id, session_id, message_id, queue_id, requested_skills_json, created_at) VALUES (?1, ?1, ?2, ?3, ?4, ?5, ?6)", params![id, session, message, queue, serde_json::to_string(skills)?, now])?;
    tx.commit()?;
    Ok(())
}

pub fn cancel_queue(db: &Database, queue: &str) -> Result<()> {
    db.conn().execute("UPDATE navigator_requests SET fallback_outcome='cancelled' WHERE queue_id=?1 AND turn_id IS NULL", [queue])?;
    Ok(())
}

pub fn recover(db: &Database) -> Result<()> {
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
    Ok(json!({"activities":activities,"unavailableCount":unavailable_count}))
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
