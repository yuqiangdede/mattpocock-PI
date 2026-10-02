use super::{rpc_err, JsonRpcError};
use crate::db::Database;
use serde_json::{json, Value};

fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str, JsonRpcError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| rpc_err(1002, format!("{key} required"), "INVALID_PARAMS"))
}

fn revision(params: &Value) -> Result<u64, JsonRpcError> {
    params
        .get("expectedRevision")
        .and_then(Value::as_u64)
        .ok_or_else(|| rpc_err(1002, "expectedRevision required", "INVALID_PARAMS"))
}

fn stage(params: &Value) -> Result<crate::db::WorkflowStageId, JsonRpcError> {
    serde_json::from_value(params.get("stageId").cloned().unwrap_or(Value::Null))
        .map_err(|_| rpc_err(1002, "valid stageId required", "INVALID_PARAMS"))
}

fn ticket(params: &Value) -> Result<Option<&str>, JsonRpcError> {
    match params.get("activeTicketId") {
        None | Some(Value::Null) => Ok(None),
        Some(Value::String(value)) => Ok(Some(value)),
        _ => Err(rpc_err(
            1002,
            "activeTicketId must be text",
            "INVALID_PARAMS",
        )),
    }
}

pub(super) fn handle(db: &Database, method: &str, params: &Value) -> Result<Value, JsonRpcError> {
    match method {
        "workflow.artifact.register" => {
            let input =
                serde_json::from_value::<crate::db::WorkflowArtifactRegistration>(params.clone())
                    .map_err(|error| rpc_err(1002, error.to_string(), "INVALID_PARAMS"))?;
            Ok(json!({ "history": db.register_workflow_artifact(input).map_err(map_error)? }))
        }
        "workflow.artifact.list" => db
            .list_workflow_artifacts(text(params, "projectGroupId")?, text(params, "runId")?)
            .map_err(map_error),
        "workflow.artifact.resolve" => db
            .resolve_workflow_artifact(
                text(params, "projectGroupId")?,
                text(params, "runId")?,
                text(params, "referenceId")?,
            )
            .map_err(map_error),
        "workflow.history.list" => {
            Ok(json!({"histories": db.list_workflow_histories().map_err(map_error)?}))
        }
        "workflow.history.read" => Ok(
            json!({"history": db.read_workflow_history(text(params, "projectGroupId")?).map_err(map_error)?}),
        ),
        "workflow.run.create" => Ok(
            json!({"history": db.create_workflow_run(text(params, "projectGroupId")?, text(params, "title")?, revision(params)?).map_err(map_error)?}),
        ),
        "workflow.run.archive" => Ok(
            json!({"history": db.archive_workflow_run(text(params, "projectGroupId")?, text(params, "runId")?, revision(params)?).map_err(map_error)?}),
        ),
        "workflow.discovery.check" => db
            .check_discovery(
                text(params, "projectGroupId")?,
                text(params, "runId")?,
                params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
            )
            .map_err(map_error),
        "workflow.stage.check" => db
            .check_workflow_stage(
                text(params, "projectGroupId")?,
                text(params, "runId")?,
                params
                    .get("sessionId")
                    .and_then(Value::as_str)
                    .unwrap_or(""),
                stage(params)?,
            )
            .map_err(map_error),
        "workflow.stage.reserve" => Ok(json!(db
            .reserve_workflow_stage(crate::db::WorkflowStageRequest {
                group: text(params, "projectGroupId")?,
                run_id: text(params, "runId")?,
                session: text(params, "sessionId")?,
                request: text(params, "requestId")?,
                revision: revision(params)?,
                stage_id: stage(params)?,
                active_ticket_id: ticket(params)?,
            })
            .map_err(map_error)?)),
        "workflow.stage.accept" => Ok(
            json!({"history": db.accept_workflow_stage(text(params, "projectGroupId")?, text(params, "runId")?, stage(params)?, revision(params)?).map_err(map_error)?}),
        ),
        "workflow.stage.reopen" => Ok(
            json!({ "history": db.reopen_workflow_stage(text(params, "projectGroupId")?, text(params, "runId")?, stage(params)?, revision(params)?, params.get("confirmed").and_then(Value::as_bool) == Some(true)).map_err(map_error)? }),
        ),
        "workflow.discovery.reserve" => Ok(json!(db
            .reserve_discovery(
                text(params, "projectGroupId")?,
                text(params, "runId")?,
                text(params, "sessionId")?,
                text(params, "requestId")?,
                revision(params)?
            )
            .map_err(map_error)?)),
        "workflow.execution.context" => db
            .workflow_execution_context(text(params, "executionId")?, text(params, "sessionId")?)
            .map_err(map_error),
        "workflow.execution.stop" => db
            .workflow_stop_target(text(params, "executionId")?)
            .map_err(map_error),
        "workflow.execution.running" => Ok(
            json!({"history": db.mark_workflow_running(text(params, "executionId")?, text(params, "turnId")?).map_err(map_error)?}),
        ),
        "workflow.execution.reconcile" => Ok(
            json!({"history": db.reconcile_workflow_execution(text(params, "executionId")?, params.get("rejectionCode").and_then(Value::as_str)).map_err(map_error)?}),
        ),
        _ => Err(rpc_err(-32601, "unknown workflow method", "INVALID_PARAMS")),
    }
}

pub(super) fn map_error(error: impl ToString) -> JsonRpcError {
    let message = error.to_string();
    if let Some((code, _)) = message.split_once(':') {
        if code.starts_with("WORKFLOW_") {
            return rpc_err(
                if matches!(
                    code,
                    "WORKFLOW_BUSY" | "WORKFLOW_QUEUED" | "WORKFLOW_CONFLICT"
                ) {
                    1008
                } else {
                    1002
                },
                message.clone(),
                code,
            );
        }
    }
    if message.starts_with("workflow history changed")
        || message.starts_with("project already has an active workflow run")
    {
        return rpc_err(1008, message, "CONFLICT");
    }
    if message == "project group is unavailable" || message == "workflow run not found" {
        return rpc_err(1007, message, "NOT_FOUND");
    }
    if message.starts_with("workflow run title") || message == "project group id is required" {
        return rpc_err(1002, message, "INVALID_PARAMS");
    }
    rpc_err(1000, message, "INTERNAL")
}
