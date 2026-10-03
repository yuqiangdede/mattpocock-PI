use super::{rpc_err, JsonRpcError};
use crate::db::Database;
use serde_json::Value;
pub(super) fn handle(db: &Database, method: &str, params: &Value) -> Result<Value, JsonRpcError> {
    let text = |key: &str| {
        params
            .get(key)
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
            .ok_or_else(|| rpc_err(1002, format!("{key} required"), "INVALID_PARAMS"))
    };
    let result = match method {
        "freeTask.initPreview" => db.preview_project_initialization(
            text("sessionId")?,
            text("projectPath")?,
            text("description")?,
        ),
        "freeTask.initApply" => {
            // The plan is Host-owned; the renderer submits only selected paths.
            let selected: Vec<String> =
                serde_json::from_value(params.get("selected").cloned().unwrap_or(Value::Null))
                    .map_err(|error| rpc_err(1002, error.to_string(), "INVALID_PARAMS"))?;
            db.apply_project_initialization(text("id")?, &selected)
        }
        "freeTask.reserve" => db.reserve_free_task(params.clone()),
        "freeTask.initRead" => db.read_project_initialization(text("id")?),
        "freeTask.initCreateDirectory" => {
            db.create_initialization_directory(text("parentPath")?, text("name")?)
        }
        "freeTask.read" => db.read_free_task(text("id")?),
        "freeTask.check" => db.free_task_session_busy(text("sessionId")?),
        "freeTask.running" => db.mark_free_task_running(text("id")?, text("turnId")?),
        "freeTask.list" => db.list_free_tasks(text("projectPath")?),
        "freeTask.context" => db.free_task_context(text("id")?, text("sessionId")?),
        "freeTask.reject" => db.reject_free_task(text("id")?, text("error")?),
        _ => {
            return Err(rpc_err(
                -32601,
                "Unknown free task method",
                "METHOD_NOT_FOUND",
            ))
        }
    };
    result.map_err(|error| {
        let message = error.to_string();
        let code = if message.contains("AGENT_BUSY") {
            "AGENT_BUSY"
        } else if message.contains("ISOLATION_REQUIRED") {
            "FREE_TASK_ISOLATION_REQUIRED"
        } else {
            "FREE_TASK_UNAVAILABLE"
        };
        rpc_err(1002, message, code)
    })
}
