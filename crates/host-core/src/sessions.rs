use anyhow::{anyhow, Result};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::db::{ms_to_ts, now_ms, ts_to_ms, Database};
use crate::notifications::{self, Notification};

/// Values accepted by the persisted per-session thinking selector.  Keep this
/// list in the host boundary so old clients cannot write arbitrary provider
/// options into the session row.
pub const THINKING_LEVELS: [&str; 7] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

pub fn is_valid_thinking_level(level: &str) -> bool {
    THINKING_LEVELS.contains(&level)
}

fn default_thinking_level() -> String {
    "off".to_string()
}

/// Per-session permission mode (D115). `inherit` defers to the global
/// default in settings; the rest override it for this session only.
pub const PERMISSION_MODES: [&str; 4] = ["inherit", "ask", "accept-edits", "auto"];

pub fn is_valid_permission_mode(mode: &str) -> bool {
    PERMISSION_MODES.contains(&mode)
}

fn default_permission_mode() -> String {
    "inherit".to_string()
}

fn validate_permission_mode(mode: &str) -> Result<()> {
    if is_valid_permission_mode(mode) {
        Ok(())
    } else {
        Err(anyhow!(
            "permissionMode must be one of {}",
            PERMISSION_MODES.join(", ")
        ))
    }
}

fn validate_thinking_level(level: &str) -> Result<()> {
    if is_valid_thinking_level(level) {
        Ok(())
    } else {
        Err(anyhow!(
            "thinkingLevel must be one of {}",
            THINKING_LEVELS.join(", ")
        ))
    }
}

/// Wire format is unchanged from v1: RFC3339 timestamps, `projectPath`
/// resolved from the projects table, flat tool fields on messages. Storage is
/// schema v3 (block-array transcripts, integer times, per-session `seq`, and
/// persisted thinking level).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub project_path: Option<String>,
    pub model_id: Option<String>,
    pub provider_id: Option<String>,
    pub mode: String,
    #[serde(default = "default_thinking_level")]
    pub thinking_level: String,
    #[serde(default = "default_permission_mode")]
    pub permission_mode: String,
    pub updated_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageUsage {
    pub input_tokens: i64,
    pub output_tokens: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_tokens: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_tokens: Option<i64>,
    pub total_tokens: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiMessage {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<MessageUsage>,
    /// Structured AppError for an assistant turn that failed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Value>,
    /// Stable regenerate-family key shared across rewritten user prompts.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision_root_id: Option<String>,
    /// For user messages that own regenerate history: total revision count.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revision_count: Option<i64>,
    /// 1-based active revision index for the branch rooted at this user turn.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_revision: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_args: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_completed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_duration_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetail {
    #[serde(flatten)]
    pub summary: SessionSummary,
    pub messages: Vec<UiMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub session_id: String,
    pub session_title: String,
    pub message_id: String,
    pub role: String,
    pub snippet: String,
    pub created_at: String,
}

fn is_default_title(title: &str) -> bool {
    matches!(
        title.trim(),
        "" | "New task" | "New chat" | "新建任务" | "新对话"
    )
}

// ---- UiMessage ⇄ storage row mapping ----------------------------------------

/// (text, content_json, meta_json) for a wire message.
fn ui_to_storage(message: &UiMessage) -> (Option<String>, String, Option<String>) {
    let mut meta_obj = serde_json::Map::new();
    if let Some(status) = &message.status {
        meta_obj.insert("status".into(), json!(status));
    }
    if let Some(model_id) = &message.model_id {
        meta_obj.insert("modelId".into(), json!(model_id));
    }
    if let Some(provider_id) = &message.provider_id {
        meta_obj.insert("providerId".into(), json!(provider_id));
    }
    if let Some(usage) = &message.usage {
        meta_obj.insert(
            "usage".into(),
            json!({
                "inputTokens": usage.input_tokens,
                "outputTokens": usage.output_tokens,
                "cacheReadTokens": usage.cache_read_tokens,
                "cacheWriteTokens": usage.cache_write_tokens,
                "reasoningTokens": usage.reasoning_tokens,
                "totalTokens": usage.total_tokens,
            }),
        );
    }
    if let Some(error) = &message.error {
        meta_obj.insert("error".into(), error.clone());
    }
    if let Some(root_id) = &message.revision_root_id {
        meta_obj.insert("revisionRootId".into(), json!(root_id));
    }
    if let Some(count) = message.revision_count {
        meta_obj.insert("revisionCount".into(), json!(count));
    }
    if let Some(active) = message.active_revision {
        meta_obj.insert("activeRevision".into(), json!(active));
    }
    let meta = if meta_obj.is_empty() {
        None
    } else {
        Some(Value::Object(meta_obj).to_string())
    };
    if message.role == "tool" {
        let mut blocks = Vec::new();
        if let Some(thinking) = &message.thinking {
            blocks.push(json!({ "type": "thinking", "text": thinking }));
        }
        let mut block = serde_json::Map::new();
        block.insert("type".into(), json!("tool_call"));
        if let Some(v) = &message.tool_call_id {
            block.insert("callId".into(), json!(v));
        }
        if let Some(v) = &message.tool_name {
            block.insert("name".into(), json!(v));
        }
        if let Some(v) = &message.tool_args {
            block.insert("args".into(), v.clone());
        }
        if let Some(v) = &message.tool_result {
            block.insert("result".into(), v.clone());
        }
        if let Some(v) = &message.tool_completed_at {
            block.insert("completedAt".into(), json!(v));
        }
        if let Some(v) = message.tool_duration_ms {
            block.insert("durationMs".into(), json!(v));
        }
        if let Some(v) = &message.tool_status {
            block.insert("status".into(), json!(v));
        }
        if message.is_error.unwrap_or(false) {
            block.insert("isError".into(), json!(true));
        }
        if !message.content.is_empty() {
            block.insert("text".into(), json!(message.content));
        }
        blocks.push(Value::Object(block));
        (None, Value::Array(blocks).to_string(), meta)
    } else {
        let mut blocks = Vec::with_capacity(2);
        if let Some(thinking) = &message.thinking {
            blocks.push(json!({ "type": "thinking", "text": thinking }));
        }
        blocks.push(json!({ "type": "text", "text": message.content }));
        (
            Some(message.content.clone()),
            Value::Array(blocks).to_string(),
            meta,
        )
    }
}

struct MessageRow {
    id: String,
    role: String,
    tool_name: Option<String>,
    is_error: i64,
    text: Option<String>,
    content_json: String,
    meta_json: Option<String>,
    created_at: i64,
}

fn row_to_ui(row: MessageRow) -> UiMessage {
    let blocks: Vec<Value> = serde_json::from_str(&row.content_json).unwrap_or_default();
    let meta: Value = row
        .meta_json
        .as_deref()
        .and_then(|raw| serde_json::from_str(raw).ok())
        .unwrap_or(Value::Null);
    let status = meta
        .get("status")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let model_id = meta
        .get("modelId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let provider_id = meta
        .get("providerId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let usage = meta.get("usage").and_then(|value| {
        let input_tokens = value.get("inputTokens").and_then(|v| v.as_i64())?;
        let output_tokens = value.get("outputTokens").and_then(|v| v.as_i64())?;
        let total_tokens = value
            .get("totalTokens")
            .and_then(|v| v.as_i64())
            .unwrap_or(input_tokens + output_tokens);
        Some(MessageUsage {
            input_tokens,
            output_tokens,
            cache_read_tokens: value.get("cacheReadTokens").and_then(|v| v.as_i64()),
            cache_write_tokens: value.get("cacheWriteTokens").and_then(|v| v.as_i64()),
            reasoning_tokens: value.get("reasoningTokens").and_then(|v| v.as_i64()),
            total_tokens,
        })
    });
    let error = meta.get("error").cloned();
    let revision_root_id = meta
        .get("revisionRootId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let revision_count = meta.get("revisionCount").and_then(|v| v.as_i64());
    let active_revision = meta.get("activeRevision").and_then(|v| v.as_i64());
    let thinking = blocks
        .iter()
        .filter_map(|b| {
            (b.get("type").and_then(|t| t.as_str()) == Some("thinking"))
                .then(|| b.get("text").and_then(|v| v.as_str()))
                .flatten()
        })
        .collect::<Vec<_>>();
    let thinking = (!thinking.is_empty()).then(|| thinking.concat());

    if row.role == "tool" {
        let block = blocks
            .iter()
            .find(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_call"))
            .cloned()
            .unwrap_or(Value::Null);
        let text = block
            .get("text")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .unwrap_or_default();
        UiMessage {
            id: row.id,
            role: row.role,
            content: text,
            created_at: ms_to_ts(row.created_at),
            thinking,
            status,
            model_id,
            provider_id,
            usage,
            error: error.clone(),
            revision_root_id: revision_root_id.clone(),
            revision_count,
            active_revision,
            tool_name: row.tool_name,
            tool_call_id: block
                .get("callId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            tool_status: block
                .get("status")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            tool_args: block.get("args").cloned(),
            tool_result: block.get("result").cloned(),
            tool_completed_at: block
                .get("completedAt")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            tool_duration_ms: block.get("durationMs").and_then(|v| v.as_i64()),
            is_error: if row.is_error != 0 { Some(true) } else { None },
        }
    } else {
        let content = row.text.unwrap_or_else(|| {
            blocks
                .iter()
                .filter_map(|b| match b.get("type").and_then(|t| t.as_str()) {
                    Some("text") => b.get("text").and_then(|v| v.as_str()),
                    _ => None,
                })
                .collect::<Vec<_>>()
                .join("")
        });
        UiMessage {
            id: row.id,
            role: row.role,
            content,
            created_at: ms_to_ts(row.created_at),
            thinking,
            status,
            model_id,
            provider_id,
            usage,
            error,
            revision_root_id: revision_root_id.clone(),
            revision_count,
            active_revision,
            tool_name: None,
            tool_call_id: None,
            tool_status: None,
            tool_args: None,
            tool_result: None,
            tool_completed_at: None,
            tool_duration_ms: None,
            is_error: if row.is_error != 0 { Some(true) } else { None },
        }
    }
}

fn insert_message(
    conn: &rusqlite::Connection,
    session_id: &str,
    seq: i64,
    turn_id: Option<&str>,
    message: &UiMessage,
    created_at: i64,
) -> Result<()> {
    let (text, content_json, meta_json) = ui_to_storage(message);
    let mut stmt = conn.prepare_cached(
        "INSERT INTO messages (
            id, session_id, turn_id, seq, role, tool_name, is_error, text,
            content_json, meta_json, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?;
    stmt.execute(params![
        message.id,
        session_id,
        turn_id,
        seq,
        message.role,
        message.tool_name,
        if message.is_error.unwrap_or(false) {
            1
        } else {
            0
        },
        text,
        content_json,
        meta_json,
        created_at,
    ])?;
    Ok(())
}

const SUMMARY_SELECT: &str = "SELECT s.id, s.title, p.path, s.model_id, s.provider_id, s.mode,
            s.thinking_level, s.permission_mode, s.updated_at, s.created_at
     FROM sessions s LEFT JOIN projects p ON p.id = s.project_id";

fn summary_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SessionSummary> {
    Ok(SessionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        project_path: row.get(2)?,
        model_id: row.get(3)?,
        provider_id: row.get(4)?,
        mode: row.get(5)?,
        thinking_level: row.get(6)?,
        permission_mode: row.get(7)?,
        updated_at: ms_to_ts(row.get(8)?),
        created_at: ms_to_ts(row.get(9)?),
    })
}

// ---- sessions ---------------------------------------------------------------

fn first_user_title(db: &Database, session_id: &str) -> Result<Option<String>> {
    let mut stmt = db.conn().prepare_cached(
        "SELECT text FROM messages
         WHERE session_id = ?1 AND role = 'user' AND text IS NOT NULL
         ORDER BY seq ASC LIMIT 1",
    )?;
    let content: Option<String> = stmt
        .query_row(params![session_id], |row| row.get(0))
        .optional()?;
    Ok(content.and_then(|c| {
        let t = c.trim().replace('\n', " ");
        let t = t.split_whitespace().collect::<Vec<_>>().join(" ");
        if t.is_empty() {
            None
        } else {
            let mut out = t.chars().take(48).collect::<String>();
            if t.chars().count() > 48 {
                out.push('…');
            }
            Some(out)
        }
    }))
}

pub fn list_sessions(db: &Database) -> Result<Vec<SessionSummary>> {
    let sql = format!("{SUMMARY_SELECT} ORDER BY s.updated_at DESC");
    let mut stmt = db.conn().prepare_cached(&sql)?;
    let rows = stmt.query_map([], summary_from_row)?;
    let mut out = Vec::new();
    for row in rows {
        let mut session = row?;
        if is_default_title(&session.title) {
            if let Some(title) = first_user_title(db, &session.id)? {
                // Persist so Recents stays stable across restarts.
                let _ = rename_session(db, &session.id, &title);
                session.title = title;
            }
        }
        out.push(session);
    }
    Ok(out)
}

/// Backwards-compatible session constructor.  New callers that need an
/// explicit thinking level should use [`create_session_with_thinking`].
pub fn create_session(
    db: &Database,
    title: Option<String>,
    mode: Option<String>,
    provider_id: Option<String>,
    model_id: Option<String>,
    project_path: Option<String>,
) -> Result<SessionSummary> {
    create_session_with_thinking(db, title, mode, provider_id, model_id, project_path, None)
}

pub fn create_session_with_thinking(
    db: &Database,
    title: Option<String>,
    mode: Option<String>,
    provider_id: Option<String>,
    model_id: Option<String>,
    project_path: Option<String>,
    thinking_level: Option<String>,
) -> Result<SessionSummary> {
    let now = now_ms();
    let id = Uuid::new_v4().to_string();
    let title = title.unwrap_or_else(|| "New task".into());
    let mode = mode.unwrap_or_else(|| "agent".into());
    let thinking_level = thinking_level.unwrap_or_else(default_thinking_level);
    validate_thinking_level(&thinking_level)?;
    let project_id = match project_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    {
        Some(path) => Some(db.ensure_project(path, false)?),
        None => None,
    };
    let project_path = match project_id {
        Some(id) => db.project_path(id)?,
        None => None,
    };
    db.conn()
        .prepare_cached(
            "INSERT INTO sessions (
                id, title, project_id, provider_id, model_id, mode, thinking_level,
                created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        )?
        .execute(params![
            id,
            title,
            project_id,
            provider_id,
            model_id,
            mode,
            thinking_level,
            now
        ])?;
    Ok(SessionSummary {
        id,
        title,
        project_path,
        model_id,
        provider_id,
        mode,
        thinking_level,
        permission_mode: default_permission_mode(),
        updated_at: ms_to_ts(now),
        created_at: ms_to_ts(now),
    })
}

/// The persisted per-session permission mode, or None for unknown sessions.
pub fn session_permission_mode(db: &Database, id: &str) -> Result<Option<String>> {
    Ok(db
        .conn()
        .prepare_cached("SELECT permission_mode FROM sessions WHERE id = ?1")?
        .query_row(params![id], |row| row.get(0))
        .optional()?)
}

pub fn get_session(db: &Database, id: &str) -> Result<Option<SessionDetail>> {
    let sql = format!("{SUMMARY_SELECT} WHERE s.id = ?1");
    let summary = db
        .conn()
        .prepare_cached(&sql)?
        .query_row(params![id], summary_from_row)
        .optional()?;
    let Some(summary) = summary else {
        return Ok(None);
    };

    let mut stmt = db.conn().prepare_cached(
        "SELECT id, role, tool_name, is_error, text, content_json, meta_json, created_at
         FROM messages WHERE session_id = ?1 ORDER BY seq ASC",
    )?;
    let rows = stmt.query_map(params![id], |row| {
        Ok(MessageRow {
            id: row.get(0)?,
            role: row.get(1)?,
            tool_name: row.get(2)?,
            is_error: row.get(3)?,
            text: row.get(4)?,
            content_json: row.get(5)?,
            meta_json: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    let messages = rows
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .map(row_to_ui)
        .collect();
    Ok(Some(SessionDetail { summary, messages }))
}

/// Backwards-compatible configurator.  Omitting the thinking level preserves
/// the current persisted value.
#[allow(dead_code)]
pub fn configure_session(
    db: &Database,
    id: &str,
    mode: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<Option<SessionSummary>> {
    configure_session_with_thinking(db, id, mode, provider_id, model_id, None, None)
}

#[allow(clippy::too_many_arguments)]
pub fn configure_session_with_thinking(
    db: &Database,
    id: &str,
    mode: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
    thinking_level: Option<&str>,
    permission_mode: Option<&str>,
) -> Result<Option<SessionSummary>> {
    if !matches!(mode, "chat" | "agent") {
        return Err(anyhow!("mode must be chat or agent"));
    }
    if let Some(level) = thinking_level {
        validate_thinking_level(level)?;
    }
    if let Some(mode) = permission_mode {
        validate_permission_mode(mode)?;
    }
    let changed = db
        .conn()
        .prepare_cached(
            "UPDATE sessions
             SET mode = ?2, provider_id = ?3, model_id = ?4,
                 thinking_level = COALESCE(?5, thinking_level),
                 permission_mode = COALESCE(?6, permission_mode), updated_at = ?7
             WHERE id = ?1",
        )?
        .execute(params![
            id,
            mode,
            provider_id,
            model_id,
            thinking_level,
            permission_mode,
            now_ms()
        ])?;
    if changed == 0 {
        return Ok(None);
    }
    Ok(get_session(db, id)?.map(|detail| detail.summary))
}

pub fn delete_session(db: &Database, id: &str) -> Result<bool> {
    let n = db
        .conn()
        .prepare_cached("DELETE FROM sessions WHERE id = ?1")?
        .execute(params![id])?;
    Ok(n > 0)
}

pub fn rename_session(db: &Database, id: &str, title: &str) -> Result<bool> {
    let n = db
        .conn()
        .prepare_cached("UPDATE sessions SET title = ?1, updated_at = ?2 WHERE id = ?3")?
        .execute(params![title, now_ms(), id])?;
    Ok(n > 0)
}

pub fn append_message(
    db: &Database,
    session_id: &str,
    message: &UiMessage,
    turn_id: Option<&str>,
) -> Result<()> {
    let conn = db.conn();
    let tx = conn.unchecked_transaction()?;
    let now = now_ms();
    let seq: Option<i64> = tx
        .prepare_cached(
            "UPDATE sessions SET last_seq = last_seq + 1, updated_at = ?2
             WHERE id = ?1 RETURNING last_seq",
        )?
        .query_row(params![session_id, now], |r| r.get(0))
        .optional()?;
    let Some(seq) = seq else {
        return Err(anyhow!("session not found: {session_id}"));
    };
    insert_message(
        &tx,
        session_id,
        seq - 1,
        turn_id,
        message,
        ts_to_ms(&message.created_at),
    )?;
    tx.commit()?;
    Ok(())
}

pub fn replace_messages(db: &Database, session_id: &str, messages: &[UiMessage]) -> Result<()> {
    let conn = db.conn();
    let tx = conn.unchecked_transaction()?;
    tx.prepare_cached("DELETE FROM messages WHERE session_id = ?1")?
        .execute(params![session_id])?;
    for (seq, message) in messages.iter().enumerate() {
        insert_message(
            &tx,
            session_id,
            seq as i64,
            None,
            message,
            ts_to_ms(&message.created_at),
        )?;
    }
    tx.prepare_cached("UPDATE sessions SET last_seq = ?1, updated_at = ?2 WHERE id = ?3")?
        .execute(params![messages.len() as i64, now_ms(), session_id])?;
    tx.commit()?;
    Ok(())
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageRevisionSummary {
    pub revision_index: i64,
    pub is_active: bool,
    pub created_at: String,
    pub message_count: i64,
}

/// Persist a discarded (or current) regenerate branch for a user root turn.
pub fn save_message_revision(
    db: &Database,
    session_id: &str,
    root_user_id: &str,
    messages: &[UiMessage],
    make_active: bool,
) -> Result<MessageRevisionSummary> {
    if root_user_id.trim().is_empty() {
        return Err(anyhow!("rootUserId required"));
    }
    if messages.is_empty() {
        return Err(anyhow!("messages required"));
    }
    let conn = db.conn();
    let tx = conn.unchecked_transaction()?;
    let next_index: i64 = tx
        .query_row(
            "SELECT COALESCE(MAX(revision_index), 0) + 1
             FROM message_revisions
             WHERE session_id = ?1 AND root_user_id = ?2",
            params![session_id, root_user_id],
            |row| row.get(0),
        )
        .unwrap_or(1);
    if make_active {
        tx.prepare_cached(
            "UPDATE message_revisions
             SET is_active = 0
             WHERE session_id = ?1 AND root_user_id = ?2",
        )?
        .execute(params![session_id, root_user_id])?;
    }
    let id = Uuid::new_v4().to_string();
    let created = now_ms();
    let payload = serde_json::to_string(messages)?;
    tx.prepare_cached(
        "INSERT INTO message_revisions (
            id, session_id, root_user_id, revision_index, is_active, messages_json, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
    )?
    .execute(params![
        id,
        session_id,
        root_user_id,
        next_index,
        if make_active { 1 } else { 0 },
        payload,
        created
    ])?;
    tx.commit()?;
    Ok(MessageRevisionSummary {
        revision_index: next_index,
        is_active: make_active,
        created_at: ms_to_ts(created),
        message_count: messages.len() as i64,
    })
}

pub fn list_message_revisions(
    db: &Database,
    session_id: &str,
    root_user_id: &str,
) -> Result<Vec<MessageRevisionSummary>> {
    let mut stmt = db.conn().prepare_cached(
        "SELECT revision_index, is_active, created_at, messages_json
         FROM message_revisions
         WHERE session_id = ?1 AND root_user_id = ?2
         ORDER BY revision_index ASC",
    )?;
    let rows = stmt.query_map(params![session_id, root_user_id], |row| {
        let messages_json: String = row.get(3)?;
        let count = serde_json::from_str::<Vec<Value>>(&messages_json)
            .map(|v| v.len() as i64)
            .unwrap_or(0);
        Ok(MessageRevisionSummary {
            revision_index: row.get(0)?,
            is_active: row.get::<_, i64>(1)? != 0,
            created_at: ms_to_ts(row.get(2)?),
            message_count: count,
        })
    })?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

/// Activate a stored revision: replace the live transcript with prefix + branch.
/// `prefix` is every message before the root user turn.
pub fn activate_message_revision(
    db: &Database,
    session_id: &str,
    root_user_id: &str,
    revision_index: i64,
    prefix: &[UiMessage],
) -> Result<Vec<UiMessage>> {
    let conn = db.conn();
    let tx = conn.unchecked_transaction()?;
    let messages_json: String = tx
        .query_row(
            "SELECT messages_json FROM message_revisions
             WHERE session_id = ?1 AND root_user_id = ?2 AND revision_index = ?3",
            params![session_id, root_user_id, revision_index],
            |row| row.get(0),
        )
        .map_err(|_| anyhow!("revision not found"))?;
    let branch: Vec<UiMessage> = serde_json::from_str(&messages_json)
        .map_err(|e| anyhow!("revision payload invalid: {e}"))?;
    tx.prepare_cached(
        "UPDATE message_revisions
         SET is_active = CASE WHEN revision_index = ?3 THEN 1 ELSE 0 END
         WHERE session_id = ?1 AND root_user_id = ?2",
    )?
    .execute(params![session_id, root_user_id, revision_index])?;
    // rebuild live messages = prefix + branch
    tx.prepare_cached("DELETE FROM messages WHERE session_id = ?1")?
        .execute(params![session_id])?;
    let mut combined = Vec::with_capacity(prefix.len() + branch.len());
    combined.extend_from_slice(prefix);
    combined.extend(branch.iter().cloned());
    // Stamp revision meta on the branch's user root. After regenerate the live
    // prompt id may differ from the stable family key, so prefer an exact id
    // match and fall back to the first user message in the restored branch.
    let total: i64 = tx.query_row(
        "SELECT COUNT(*) FROM message_revisions
         WHERE session_id = ?1 AND root_user_id = ?2",
        params![session_id, root_user_id],
        |row| row.get(0),
    )?;
    let root_pos = combined
        .iter()
        .position(|m| m.id == root_user_id)
        .or_else(|| {
            combined
                .iter()
                .skip(prefix.len())
                .position(|m| m.role == "user")
                .map(|rel| prefix.len() + rel)
        });
    if let Some(pos) = root_pos {
        if let Some(root) = combined.get_mut(pos) {
            root.revision_root_id = Some(root_user_id.to_string());
            root.revision_count = Some(total);
            root.active_revision = Some(revision_index);
        }
    }
    for (seq, message) in combined.iter().enumerate() {
        insert_message(
            &tx,
            session_id,
            seq as i64,
            None,
            message,
            ts_to_ms(&message.created_at),
        )?;
    }
    tx.prepare_cached("UPDATE sessions SET last_seq = ?1, updated_at = ?2 WHERE id = ?3")?
        .execute(params![combined.len() as i64, now_ms(), session_id])?;
    tx.commit()?;
    Ok(combined)
}

/// Insert a session with caller-provided timestamps and messages in one
/// transaction. Idempotent: if a session with the same id already exists the
/// call is a no-op and returns false.
pub fn import_session(
    db: &Database,
    summary: &SessionSummary,
    messages: &[UiMessage],
) -> Result<bool> {
    validate_thinking_level(&summary.thinking_level)?;
    let conn = db.conn();
    let exists: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sessions WHERE id = ?1",
        params![summary.id],
        |row| row.get(0),
    )?;
    if exists > 0 {
        return Ok(false);
    }
    let tx = conn.unchecked_transaction()?;
    let project_id = match summary
        .project_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    {
        Some(path) => Some(db.ensure_project(path, false)?),
        None => None,
    };
    let source = summary.id.strip_prefix("import-").map(|rest| {
        for known in ["claude-code", "opencode", "codex", "pi"] {
            if rest.starts_with(&format!("{known}-")) {
                return known.to_string();
            }
        }
        "external".to_string()
    });
    tx.prepare_cached(
        "INSERT INTO sessions (
            id, title, project_id, provider_id, model_id, mode, thinking_level, source,
            last_seq, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
    )?
    .execute(params![
        summary.id,
        summary.title,
        project_id,
        summary.provider_id,
        summary.model_id,
        summary.mode,
        summary.thinking_level,
        source,
        messages.len() as i64,
        ts_to_ms(&summary.created_at),
        ts_to_ms(&summary.updated_at),
    ])?;
    for (seq, message) in messages.iter().enumerate() {
        insert_message(
            &tx,
            &summary.id,
            seq as i64,
            None,
            message,
            ts_to_ms(&message.created_at),
        )?;
    }
    tx.commit()?;
    Ok(true)
}

pub fn session_count(db: &Database) -> Result<i64> {
    Ok(db
        .conn()
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))?)
}

// ---- turns ------------------------------------------------------------------

pub fn begin_turn(
    db: &Database,
    session_id: &str,
    provider_id: Option<&str>,
    model_id: Option<&str>,
) -> Result<String> {
    let id = Uuid::new_v4().to_string();
    db.conn()
        .prepare_cached(
            "INSERT INTO turns (id, session_id, provider_id, model_id, started_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
        )?
        .execute(params![id, session_id, provider_id, model_id, now_ms()])?;
    Ok(id)
}

pub struct EndTurnResult {
    pub updated: bool,
    pub notification: Option<Notification>,
}

pub fn end_turn(
    db: &Database,
    turn_id: &str,
    status: &str,
    error_code: Option<&str>,
    usage: Option<&Value>,
    create_notification: bool,
) -> Result<EndTurnResult> {
    let status = match status {
        "completed" | "aborted" | "error" => status,
        _ => "completed",
    };
    let input_tokens = usage
        .and_then(|u| u.get("inputTokens"))
        .and_then(|v| v.as_i64());
    let output_tokens = usage
        .and_then(|u| u.get("outputTokens"))
        .and_then(|v| v.as_i64());
    let tx = db.conn().unchecked_transaction()?;
    let n = tx
        .prepare_cached(
            "UPDATE turns SET status = ?1, error_code = ?2, ended_at = ?3,
                input_tokens = COALESCE(?4, input_tokens),
                output_tokens = COALESCE(?5, output_tokens),
                usage_json = COALESCE(?6, usage_json)
             WHERE id = ?7 AND status = 'running'",
        )?
        .execute(params![
            status,
            error_code,
            now_ms(),
            input_tokens,
            output_tokens,
            usage.map(|u| u.to_string()),
            turn_id,
        ])?;
    let notification = if n > 0 && create_notification {
        notifications::insert_for_terminal_turn(&tx, turn_id, status, error_code)?
    } else {
        None
    };
    tx.commit()?;
    Ok(EndTurnResult {
        updated: n > 0,
        notification,
    })
}

// ---- search -----------------------------------------------------------------

pub fn search_messages(db: &Database, query: &str, limit: i64) -> Result<Vec<SearchHit>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    // trigram FTS needs >= 3 chars; shorter queries fall back to LIKE.
    if query.chars().count() >= 3 {
        let quoted = format!("\"{}\"", query.replace('"', "\"\""));
        let mut stmt = db.conn().prepare_cached(
            "SELECT m.id, m.session_id, s.title, m.role, m.created_at,
                    snippet(messages_fts, 0, '', '', '…', 16)
             FROM messages_fts
             JOIN messages m ON m.mid = messages_fts.rowid
             JOIN sessions s ON s.id = m.session_id
             WHERE messages_fts MATCH ?1
             ORDER BY m.created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![quoted, limit], |row| {
            Ok(SearchHit {
                message_id: row.get(0)?,
                session_id: row.get(1)?,
                session_title: row.get(2)?,
                role: row.get(3)?,
                created_at: ms_to_ts(row.get(4)?),
                snippet: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    } else {
        let escaped = query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        let mut stmt = db.conn().prepare_cached(
            "SELECT m.id, m.session_id, s.title, m.role, m.created_at,
                    substr(m.text, 1, 160)
             FROM messages m
             JOIN sessions s ON s.id = m.session_id
             WHERE m.text LIKE '%' || ?1 || '%' ESCAPE '\\'
             ORDER BY m.created_at DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![escaped, limit], |row| {
            Ok(SearchHit {
                message_id: row.get(0)?,
                session_id: row.get(1)?,
                session_title: row.get(2)?,
                role: row.get(3)?,
                created_at: ms_to_ts(row.get(4)?),
                snippet: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_db() -> Database {
        let dir = std::env::temp_dir().join(format!("pi-desktop-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        Database::open(&dir.join("test.sqlite")).unwrap()
    }

    fn user_msg(id: &str, content: &str, ts: &str) -> UiMessage {
        UiMessage {
            id: id.into(),
            role: "user".into(),
            content: content.into(),
            created_at: ts.into(),
            thinking: None,
            status: None,
            model_id: None,
            provider_id: None,
            usage: None,
            error: None,
            revision_root_id: None,
            revision_count: None,
            active_revision: None,
            tool_name: None,
            tool_call_id: None,
            tool_status: None,
            tool_args: None,
            tool_result: None,
            tool_completed_at: None,
            tool_duration_ms: None,
            is_error: None,
        }
    }

    #[test]
    fn configure_session_persists_pi_runtime_selection() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, Some("/tmp/x".into())).unwrap();
        db.conn()
            .execute(
                "INSERT INTO providers (
                    id, name, vendor_key, type, protocol, enabled, base_url,
                    auth_kind, secret_ref, api_style, default_model_id,
                    created_at, updated_at
                 ) VALUES (
                    'provider-1', 'Provider', 'custom', 'openai_compatible',
                    'openai_compatible', 1, NULL, 'none', NULL,
                    'chat_completions', 'model-1', 1, 1
                 )",
                [],
            )
            .unwrap();

        let configured = configure_session_with_thinking(
            &db,
            &session.id,
            "chat",
            Some("provider-1"),
            Some("model-1"),
            Some("high"),
            None,
        )
        .unwrap()
        .unwrap();

        assert_eq!(configured.mode, "chat");
        assert_eq!(configured.provider_id.as_deref(), Some("provider-1"));
        assert_eq!(configured.model_id.as_deref(), Some("model-1"));
        assert_eq!(configured.thinking_level, "high");
        // Omitting the new field is backwards-compatible and preserves the
        // configured value rather than resetting it to off.
        let preserved = configure_session(&db, &session.id, "chat", None, None)
            .unwrap()
            .unwrap();
        assert_eq!(preserved.thinking_level, "high");
        assert!(configure_session(&db, &session.id, "invalid", None, None).is_err());
        assert!(configure_session_with_thinking(
            &db,
            &session.id,
            "chat",
            None,
            None,
            Some("turbo"),
            None,
        )
        .is_err());
    }

    #[test]
    fn create_session_returns_canonical_project_path() {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        let db = Database::open(&dir.path().join("test.sqlite")).unwrap();
        let spelling_with_trailing_slash = format!("{}/", project.display());

        let session = create_session(
            &db,
            None,
            None,
            None,
            None,
            Some(spelling_with_trailing_slash),
        )
        .unwrap();

        let canonical = project
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .to_string();
        assert_eq!(session.project_path.as_deref(), Some(canonical.as_str()));
        assert_eq!(
            get_session(&db, &session.id)
                .unwrap()
                .unwrap()
                .summary
                .project_path
                .as_deref(),
            Some(canonical.as_str())
        );
    }

    #[test]
    fn import_session_is_idempotent_and_preserves_timestamps() {
        let db = test_db();
        let summary = SessionSummary {
            id: "import-claude-code-abc".into(),
            title: "Imported".into(),
            project_path: Some("/tmp/proj".into()),
            model_id: None,
            provider_id: None,
            mode: "agent".into(),
            thinking_level: "off".into(),
            permission_mode: "inherit".into(),
            created_at: "2025-01-01T00:00:00Z".into(),
            updated_at: "2025-01-02T00:00:00Z".into(),
        };
        let messages = vec![user_msg("m1", "hello", "2025-01-01T00:00:01Z")];

        assert!(import_session(&db, &summary, &messages).unwrap());
        // Re-import of the same id is skipped.
        assert!(!import_session(&db, &summary, &messages).unwrap());

        let detail = get_session(&db, &summary.id).unwrap().unwrap();
        // Timestamps are stored as ms and re-emitted as RFC3339: compare instants.
        assert_eq!(
            ts_to_ms(&detail.summary.created_at),
            ts_to_ms("2025-01-01T00:00:00Z")
        );
        assert_eq!(
            ts_to_ms(&detail.summary.updated_at),
            ts_to_ms("2025-01-02T00:00:00Z")
        );
        assert_eq!(detail.summary.project_path.as_deref(), Some("/tmp/proj"));
        assert_eq!(detail.messages.len(), 1);
        assert_eq!(detail.messages[0].content, "hello");
        let projects = db.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, "/tmp/proj");

        let source: Option<String> = db
            .conn()
            .query_row(
                "SELECT source FROM sessions WHERE id = ?1",
                params![summary.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(source.as_deref(), Some("claude-code"));
    }

    #[test]
    fn import_materializes_unique_projects_but_keeps_pathless_sessions_temporary() {
        let db = test_db();
        let base = SessionSummary {
            id: "import-codex-one".into(),
            title: "Imported".into(),
            project_path: Some("/tmp/project/".into()),
            model_id: None,
            provider_id: None,
            mode: "agent".into(),
            thinking_level: "off".into(),
            permission_mode: "inherit".into(),
            created_at: "2025-01-01T00:00:00Z".into(),
            updated_at: "2025-01-01T00:00:00Z".into(),
        };
        assert!(import_session(&db, &base, &[]).unwrap());

        let mut same_project = base.clone();
        same_project.id = "import-codex-two".into();
        same_project.project_path = Some("/tmp/project".into());
        assert!(import_session(&db, &same_project, &[]).unwrap());

        let mut temporary = base.clone();
        temporary.id = "import-codex-temporary".into();
        temporary.project_path = Some("   ".into());
        assert!(import_session(&db, &temporary, &[]).unwrap());

        let projects = db.list_projects().unwrap();
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].path, "/tmp/project");
        assert_eq!(
            get_session(&db, &temporary.id)
                .unwrap()
                .unwrap()
                .summary
                .project_path,
            None
        );
    }

    #[test]
    fn append_and_roundtrip_tool_message() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, Some("/tmp/x".into())).unwrap();
        append_message(
            &db,
            &session.id,
            &user_msg("m1", "写一个文件", "2025-05-01T00:00:00Z"),
            None,
        )
        .unwrap();
        let tool = UiMessage {
            id: "m2".into(),
            role: "tool".into(),
            content: "ok".into(),
            created_at: "2025-05-01T00:00:02Z".into(),
            thinking: None,
            status: Some("complete".into()),
            model_id: None,
            provider_id: None,
            usage: None,
            error: None,
            revision_root_id: None,
            revision_count: None,
            active_revision: None,
            tool_name: Some("Write".into()),
            tool_call_id: Some("c1".into()),
            tool_status: Some("success".into()),
            tool_args: Some(json!({ "path": "a.txt" })),
            tool_result: Some(json!({ "ok": true })),
            tool_completed_at: Some("2025-05-01T00:00:03Z".into()),
            tool_duration_ms: Some(1_000),
            is_error: None,
        };
        append_message(&db, &session.id, &tool, None).unwrap();

        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages.len(), 2);
        let m2 = &detail.messages[1];
        assert_eq!(m2.role, "tool");
        assert_eq!(m2.tool_name.as_deref(), Some("Write"));
        assert_eq!(m2.tool_call_id.as_deref(), Some("c1"));
        assert_eq!(m2.tool_status.as_deref(), Some("success"));
        assert_eq!(m2.tool_args, Some(json!({ "path": "a.txt" })));
        assert_eq!(m2.tool_result, Some(json!({ "ok": true })));
        assert_eq!(
            m2.tool_completed_at.as_deref(),
            Some("2025-05-01T00:00:03Z")
        );
        assert_eq!(m2.tool_duration_ms, Some(1_000));
        assert_eq!(m2.content, "ok");
        assert_eq!(m2.status.as_deref(), Some("complete"));

        // seq allocation is monotonic per session.
        let last_seq: i64 = db
            .conn()
            .query_row(
                "SELECT last_seq FROM sessions WHERE id = ?1",
                params![session.id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(last_seq, 2);
    }

    #[test]
    fn assistant_thinking_roundtrips_as_canonical_blocks() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let assistant = UiMessage {
            id: "assistant-1".into(),
            role: "assistant".into(),
            content: "final answer".into(),
            created_at: "2025-05-01T00:00:01Z".into(),
            thinking: Some("first plan\nsecond plan".into()),
            status: Some("complete".into()),
            model_id: Some("model-1".into()),
            provider_id: Some("provider-1".into()),
            usage: Some(MessageUsage {
                input_tokens: 12,
                output_tokens: 34,
                cache_read_tokens: Some(2),
                cache_write_tokens: None,
                reasoning_tokens: Some(5),
                total_tokens: 48,
            }),
            error: None,
            revision_root_id: None,
            revision_count: None,
            active_revision: None,
            tool_name: None,
            tool_call_id: None,
            tool_status: None,
            tool_args: None,
            tool_result: None,
            tool_completed_at: None,
            tool_duration_ms: None,
            is_error: None,
        };
        append_message(&db, &session.id, &assistant, None).unwrap();

        let content_json: String = db
            .conn()
            .query_row(
                "SELECT content_json FROM messages WHERE id = 'assistant-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let blocks: Value = serde_json::from_str(&content_json).unwrap();
        assert_eq!(
            blocks[0],
            json!({
                "type": "thinking",
                "text": "first plan\nsecond plan"
            })
        );
        assert_eq!(
            blocks[1],
            json!({
                "type": "text",
                "text": "final answer"
            })
        );

        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(
            detail.messages[0].thinking.as_deref(),
            Some("first plan\nsecond plan")
        );
        assert_eq!(detail.messages[0].content, "final answer");
        assert_eq!(detail.messages[0].model_id.as_deref(), Some("model-1"));
        assert_eq!(detail.messages[0].provider_id.as_deref(), Some("provider-1"));
        let usage = detail.messages[0].usage.as_ref().expect("usage");
        assert_eq!(usage.input_tokens, 12);
        assert_eq!(usage.output_tokens, 34);
        assert_eq!(usage.cache_read_tokens, Some(2));
        assert_eq!(usage.reasoning_tokens, Some(5));
        assert_eq!(usage.total_tokens, 48);
    }

    #[test]
    fn assistant_error_roundtrips_in_message_metadata() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let mut assistant = user_msg("assistant-error", "", "2025-05-01T00:00:01Z");
        assistant.role = "assistant".into();
        assistant.status = Some("error".into());
        assistant.is_error = Some(true);
        assistant.error = Some(json!({
            "code": "MODEL_NOT_CONFIGURED",
            "message": "404: model not found",
            "retriable": false
        }));

        append_message(&db, &session.id, &assistant, None).unwrap();
        let detail = get_session(&db, &session.id).unwrap().unwrap();
        let restored = &detail.messages[0];

        assert_eq!(restored.status.as_deref(), Some("error"));
        assert_eq!(restored.is_error, Some(true));
        assert_eq!(restored.error, assistant.error);
    }

    #[test]
    fn import_and_replace_preserve_thinking() {
        let db = test_db();
        let summary = SessionSummary {
            id: "thinking-import".into(),
            title: "Thinking".into(),
            project_path: None,
            model_id: None,
            provider_id: None,
            mode: "agent".into(),
            thinking_level: "medium".into(),
            permission_mode: "inherit".into(),
            created_at: "2025-01-01T00:00:00Z".into(),
            updated_at: "2025-01-01T00:00:00Z".into(),
        };
        let mut message = user_msg("m1", "prompt", "2025-01-01T00:00:01Z");
        message.role = "assistant".into();
        message.thinking = Some("persist me".into());
        assert!(import_session(&db, &summary, &[message.clone()]).unwrap());
        let detail = get_session(&db, &summary.id).unwrap().unwrap();
        assert_eq!(detail.summary.thinking_level, "medium");
        assert_eq!(detail.messages[0].thinking.as_deref(), Some("persist me"));

        let session = create_session(&db, None, None, None, None, None).unwrap();
        message.id = "m2".into();
        replace_messages(&db, &session.id, &[message]).unwrap();
        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages[0].thinking.as_deref(), Some("persist me"));
    }

    #[test]
    fn replace_messages_resets_stream() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        append_message(
            &db,
            &session.id,
            &user_msg("a", "one", "2025-05-01T00:00:00Z"),
            None,
        )
        .unwrap();
        append_message(
            &db,
            &session.id,
            &user_msg("b", "two", "2025-05-01T00:00:01Z"),
            None,
        )
        .unwrap();
        replace_messages(
            &db,
            &session.id,
            &[user_msg("c", "compacted", "2025-05-01T00:00:02Z")],
        )
        .unwrap();
        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages.len(), 1);
        assert_eq!(detail.messages[0].content, "compacted");
        // Appending after replace continues from the new stream head.
        append_message(
            &db,
            &session.id,
            &user_msg("d", "next", "2025-05-01T00:00:03Z"),
            None,
        )
        .unwrap();
        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages.len(), 2);
        assert_eq!(detail.messages[1].content, "next");
    }

    #[test]
    fn turns_lifecycle() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, Some("p1"), Some("m1")).unwrap();
        let ended = end_turn(
            &db,
            &turn,
            "completed",
            None,
            Some(&json!({ "inputTokens": 10, "outputTokens": 20 })),
            true,
        )
        .unwrap();
        assert!(ended.updated);
        assert_eq!(ended.notification.unwrap().kind, "task.completed");
        // Ending twice is a no-op.
        let duplicate = end_turn(&db, &turn, "completed", None, None, true).unwrap();
        assert!(!duplicate.updated);
        assert!(duplicate.notification.is_none());
        let (status, input, output): (String, i64, i64) = db
            .conn()
            .query_row(
                "SELECT status, input_tokens, output_tokens FROM turns WHERE id = ?1",
                params![turn],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(status, "completed");
        assert_eq!((input, output), (10, 20));
    }

    #[test]
    fn aborted_turn_does_not_create_notification() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, None, None).unwrap();

        let ended = end_turn(&db, &turn, "aborted", None, None, true).unwrap();

        assert!(ended.updated);
        assert!(ended.notification.is_none());
        let notification_count: i64 = db
            .conn()
            .query_row("SELECT COUNT(*) FROM notifications", [], |row| row.get(0))
            .unwrap();
        assert_eq!(notification_count, 0);
    }

    #[test]
    fn visible_turn_does_not_create_notification() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let turn = begin_turn(&db, &session.id, None, None).unwrap();

        let ended = end_turn(&db, &turn, "completed", None, None, false).unwrap();

        assert!(ended.updated);
        assert!(ended.notification.is_none());
        let (status, notification_count): (String, i64) = db
            .conn()
            .query_row(
                "SELECT t.status, COUNT(n.id)
                 FROM turns t
                 LEFT JOIN notifications n ON n.turn_id = t.id
                 WHERE t.id = ?1
                 GROUP BY t.status",
                params![turn],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(status, "completed");
        assert_eq!(notification_count, 0);
    }

    #[test]
    fn search_finds_cjk_and_short_queries() {
        let db = test_db();
        let session = create_session(&db, Some("重构".into()), None, None, None, None).unwrap();
        append_message(
            &db,
            &session.id,
            &user_msg("m1", "帮我重构数据库结构", "2025-05-01T00:00:00Z"),
            None,
        )
        .unwrap();
        let hits = search_messages(&db, "数据库", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].session_id, session.id);
        // 2-char query falls back to LIKE.
        let hits = search_messages(&db, "重构", 10).unwrap();
        assert_eq!(hits.len(), 1);
        // Deleting the session clears the index (cascade + FTS trigger).
        delete_session(&db, &session.id).unwrap();
        assert!(search_messages(&db, "数据库", 10).unwrap().is_empty());
    }

    #[test]
    fn save_and_activate_message_revision() {
        let db = test_db();
        let session = create_session(&db, None, None, None, None, None).unwrap();
        let user = user_msg("u1", "hello", "2025-05-01T00:00:00Z");
        let mut a1 = user_msg("a1", "first", "2025-05-01T00:00:01Z");
        a1.role = "assistant".into();
        let mut a2 = user_msg("a2", "second", "2025-05-01T00:00:02Z");
        a2.role = "assistant".into();
        let branch1 = vec![user.clone(), a1.clone()];
        let branch2 = vec![user.clone(), a2.clone()];
        let r1 = save_message_revision(&db, &session.id, "u1", &branch1, true).unwrap();
        assert_eq!(r1.revision_index, 1);
        let r2 = save_message_revision(&db, &session.id, "u1", &branch2, true).unwrap();
        assert_eq!(r2.revision_index, 2);
        let listed = list_message_revisions(&db, &session.id, "u1").unwrap();
        assert_eq!(listed.len(), 2);
        assert!(listed.iter().any(|r| r.revision_index == 1 && !r.is_active));
        assert!(listed.iter().any(|r| r.revision_index == 2 && r.is_active));
        let activated = activate_message_revision(&db, &session.id, "u1", 1, &[]).unwrap();
        assert_eq!(activated.len(), 2);
        assert_eq!(activated[1].content, "first");
        assert_eq!(activated[0].revision_root_id.as_deref(), Some("u1"));
        assert_eq!(activated[0].active_revision, Some(1));
        assert_eq!(activated[0].revision_count, Some(2));
        let detail = get_session(&db, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages[1].content, "first");
        assert_eq!(detail.messages[0].active_revision, Some(1));
        assert_eq!(detail.messages[0].revision_count, Some(2));

        // Switching forward restores the second branch and keeps the family key.
        let activated2 = activate_message_revision(&db, &session.id, "u1", 2, &[]).unwrap();
        assert_eq!(activated2[1].content, "second");
        assert_eq!(activated2[0].active_revision, Some(2));
        assert_eq!(activated2[0].revision_root_id.as_deref(), Some("u1"));
    }
}
