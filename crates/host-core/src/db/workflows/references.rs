use super::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowArtifactReference {
    pub id: String,
    pub run_id: String,
    pub stage_id: WorkflowStageId,
    pub stage_revision: u64,
    pub kind: WorkflowArtifactKind,
    pub workspace_root: String,
    pub relative_path: String,
    pub ticket_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowArtifactKind {
    Glossary,
    Adr,
    Spec,
    Ticket,
    Review,
    Retro,
}

pub(super) fn valid_relative_reference_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 8192
        && !path.chars().any(char::is_control)
        && !path.starts_with(['/', '\\'])
        && !path.contains(':')
        && !path
            .split(['/', '\\'])
            .any(|part| part == ".." || part.is_empty())
}

pub(super) fn validate_artifact_references(run: &WorkflowRunRecord) -> Result<()> {
    let mut identities = std::collections::HashSet::new();
    for reference in &run.artifact_references {
        if reference.id.is_empty()
            || !identities.insert(reference.id.as_str())
            || reference.run_id != run.id
            || reference.stage_revision == 0
            || reference.stage_revision > run.stages[reference.stage_id.index()].revision
            || reference.workspace_root.is_empty()
            || !valid_relative_reference_path(&reference.relative_path)
        {
            return Err(anyhow!("malformed workflow artifact reference"));
        }
    }
    Ok(())
}
