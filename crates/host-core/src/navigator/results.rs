//! Attributed result references; removing a reference never deletes its source.
use crate::{db::Database, transcripts::MessageRecord};
use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension, Transaction};
use serde_json::{json, Value};

pub fn record_reply(
    tx: &Transaction<'_>,
    session: &str,
    turn: &str,
    record: &MessageRecord,
) -> Result<()> {
    // Child-agent messages are not the conversation's final response evidence.
    if record
        .meta
        .as_ref()
        .and_then(|m| m.get("parentToolCallId"))
        .is_some()
    {
        return Ok(());
    }
    if !record.blocks.as_array().is_some_and(|blocks| {
        blocks.iter().any(|b| {
            b["type"] == "text" && b["text"].as_str().is_some_and(|s| !s.trim().is_empty())
        })
    }) {
        return Ok(());
    }
    let changed = tx.execute("INSERT OR IGNORE INTO navigator_results(id,activity_id,kind,label,source_message_id,source_turn_id,provenance,verification) SELECT ?3,r.activity_id,'reply','',?4,?2,'native','observed' FROM navigator_requests r JOIN turns t ON t.id=r.turn_id AND t.session_id=r.session_id WHERE r.session_id=?1 AND r.turn_id=?2", params![session, turn, format!("reply:{session}:{}",record.id), record.id])?;
    if changed > 0 {
        tx.execute("UPDATE navigator_activities SET version=version+1 WHERE id IN (SELECT activity_id FROM navigator_requests WHERE session_id=?1 AND turn_id=?2)",params![session,turn])?;
    }
    Ok(())
}

fn version(db: &Database, session: &str, activity: &str) -> Result<i64> {
    db.conn().query_row("SELECT version FROM navigator_activities WHERE id=?1 AND session_id=?2 AND schema_version=1",params![activity,session],|r| r.get(0)).optional()?.ok_or_else(|| anyhow!("activity unavailable"))
}

pub fn list(db: &Database, session: &str, activity: &str) -> Result<Value> {
    let version = version(db, session, activity)?;
    let mut stmt = db.conn().prepare("SELECT id,kind,label,path,source_message_id,source_turn_id,provenance,verification FROM navigator_results WHERE activity_id=?1 AND removed=0 ORDER BY rowid")?;
    let rows = stmt.query_map([activity], |r| Ok(json!({"id":r.get::<_,String>(0)?,"kind":r.get::<_,String>(1)?,"label":r.get::<_,String>(2)?,"path":r.get::<_,Option<String>>(3)?,"sourceMessageId":r.get::<_,Option<String>>(4)?,"sourceTurnId":r.get::<_,Option<String>>(5)?,"provenance":r.get::<_,String>(6)?,"verification":r.get::<_,String>(7)?})))?;
    let results: Vec<Value> = rows.collect::<rusqlite::Result<_>>()?;
    Ok(json!({"results":results,"version":version}))
}

pub fn mutate(
    db: &Database,
    session: &str,
    activity: &str,
    expected: i64,
    input: &Value,
    remove: bool,
) -> Result<Value> {
    if super::analysis::reserved(db, session)? {
        return Err(anyhow!("AGENT_BUSY"));
    }
    let tx = db.conn().unchecked_transaction()?;
    let changed = tx.execute("UPDATE navigator_activities SET version=version+1 WHERE id=?1 AND session_id=?2 AND version=?3 AND schema_version=1",params![activity,session,expected])?;
    if changed != 1 {
        return Err(anyhow!("activity changed or unavailable; refresh required"));
    }
    let text = |key: &str| -> Result<&str> {
        input
            .get(key)
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty() && s.len() <= 4096 && !s.contains('\0'))
            .ok_or_else(|| anyhow!("invalid {key}"))
    };
    if remove {
        if tx.execute(
            "UPDATE navigator_results SET removed=1 WHERE id=?1 AND activity_id=?2 AND removed=0",
            params![text("resultId")?, activity],
        )? != 1
        {
            return Err(anyhow!("result unavailable"));
        }
    } else {
        let kind = text("kind")?;
        if kind != "file" && kind != "validation" {
            return Err(anyhow!("invalid result kind"));
        }
        let path = if kind == "file" {
            let value = text("path")?;
            // References are project-relative. The existing reader additionally enforces canonical containment/permissions.
            if value.starts_with(['/', '\\'])
                || value.contains(':')
                || value.split(['/', '\\']).any(|p| p == "..")
            {
                return Err(anyhow!("file reference must be project-relative"));
            }
            Some(value)
        } else {
            None
        };
        tx.execute("INSERT INTO navigator_results(id,activity_id,kind,label,path,provenance,verification) VALUES(?1,?2,?3,?4,?5,'user','unverified')",params![uuid::Uuid::new_v4().to_string(),activity,kind,text("label")?,path])?;
    }
    tx.commit()?;
    list(db, session, activity)
}
