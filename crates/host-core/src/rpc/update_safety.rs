use super::*;

pub(super) fn tasks_running(state: &AppState) -> Result<bool, JsonRpcError> {
    state
        .db
        .conn()
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM turns WHERE status = 'running')
         OR EXISTS(SELECT 1 FROM plan_approvals WHERE execution_state IN ('queued', 'running'))",
            [],
            |row| row.get(0),
        )
        .map_err(|error| rpc_err(1000, error.to_string(), "INTERNAL"))
}

pub(super) fn assert_idle(state: &AppState) -> Result<(), JsonRpcError> {
    if state.update_installing || state.shutting_down {
        return Err(rpc_err(
            1008,
            "application update is installing",
            "UPDATE_INSTALLING",
        ));
    }
    if tasks_running(state)? {
        return Err(rpc_err(
            1008,
            "Wait for running tasks before updating or restoring",
            "TASKS_RUNNING",
        ));
    }
    Ok(())
}
