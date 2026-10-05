use super::{rpc_err, JsonRpcError};
use crate::db::{Database, RequirementsDecision, RequirementsTarget};
use serde_json::{json, Value};

pub(super) fn handle(db: &Database, method: &str, params: &Value) -> Result<Value, JsonRpcError> {
    let invalid = |error: serde_json::Error| rpc_err(1002, error.to_string(), "INVALID_PARAMS");
    match method {
        "requirements.history" => {
            #[derive(serde::Deserialize)]
            #[serde(rename_all = "camelCase", deny_unknown_fields)]
            struct Request {
                project_group_id: String,
            }
            let request: Request = serde_json::from_value(params.clone()).map_err(invalid)?;
            Ok(json!(db
                .read_requirements_history(&request.project_group_id)
                .map_err(map_error)?))
        }
        "requirements.resolve" => {
            let target: RequirementsTarget =
                serde_json::from_value(params.clone()).map_err(invalid)?;
            Ok(
                json!({ "path": db.resolve_requirements(&target).map_err(map_error)?.to_string_lossy() }),
            )
        }
        "requirements.preview" => {
            let target: RequirementsTarget =
                serde_json::from_value(params.clone()).map_err(invalid)?;
            Ok(json!(db
                .preview_requirements(&target)
                .map_err(map_error)?))
        }
        "requirements.confirm" => {
            let decision: RequirementsDecision =
                serde_json::from_value(params.clone()).map_err(invalid)?;
            Ok(json!(db
                .confirm_requirements(&decision)
                .map_err(map_error)?))
        }
        _ => Err(rpc_err(
            -32601,
            "unknown requirements method",
            "INVALID_PARAMS",
        )),
    }
}

fn map_error(error: impl ToString) -> JsonRpcError {
    let message = error.to_string();
    let code = message
        .split_once(':')
        .map(|(code, _)| code)
        .unwrap_or("INTERNAL")
        .to_owned();
    rpc_err(
        if code == "REQUIREMENTS_CONFLICT" {
            1008
        } else if code == "INTERNAL" {
            1000
        } else {
            1002
        },
        message,
        &code,
    )
}
