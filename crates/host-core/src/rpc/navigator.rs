use super::{rpc_err, JsonRpcError};
use crate::db::Database;
use serde_json::{json, Value};

pub(super) fn handle(db: &Database, method: &str, params: &Value) -> Result<Value, JsonRpcError> {
    let text = |key: &str| {
        params
            .get(key)
            .and_then(Value::as_str)
            .filter(|id| !id.trim().is_empty() && id.len() <= 256 && !id.contains('\0'))
            .ok_or_else(|| rpc_err(1002, format!("{key} required"), "INVALID_PARAMS"))
    };
    let result = match method {
        "navigator.list" => crate::navigator::list(db, text("sessionId")?),
        "navigator.setHidden" => crate::navigator::set_hidden(
            db,
            text("sessionId")?,
            text("activityId")?,
            params
                .get("hidden")
                .and_then(Value::as_bool)
                .ok_or_else(|| rpc_err(1002, "hidden required", "INVALID_PARAMS"))?,
        ),
        "navigator.queue" => {
            let skills: Vec<String> = serde_json::from_value(
                params
                    .get("requestedSkills")
                    .cloned()
                    .unwrap_or(Value::Null),
            )
            .map_err(|e| rpc_err(1002, e.to_string(), "INVALID_PARAMS"))?;
            crate::navigator::record_queue(db, text("queueId")?, &skills)
                .map(|_| json!({"ok":true}))
        }
        "navigator.cancelQueue" => {
            crate::navigator::cancel_queue(db, text("queueId")?).map(|_| json!({"ok":true}))
        }
        _ => {
            return Err(rpc_err(
                -32601,
                "Unknown Navigator method",
                "METHOD_NOT_FOUND",
            ))
        }
    };
    result.map_err(|e| rpc_err(1002, e.to_string(), "INVALID_PARAMS"))
}
