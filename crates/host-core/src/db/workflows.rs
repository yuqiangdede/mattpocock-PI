use super::*;
use rusqlite::{Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

const WORKFLOW_NAMESPACE: &str = "engineeringWorkflow";
const WORKFLOW_DOCUMENT_VERSION: u32 = 4;
mod artifacts;
mod executions;
mod recovery;
mod references;
mod reopen;
mod stages;
pub use artifacts::WorkflowArtifactRegistration;
pub use executions::{
    WorkflowAdmission, WorkflowExecution, WorkflowExecutionPhase, WorkflowStageRequest,
};
const STAGES: [WorkflowStageId; 6] = [
    WorkflowStageId::Discovery,
    WorkflowStageId::Spec,
    WorkflowStageId::Tickets,
    WorkflowStageId::Implement,
    WorkflowStageId::Review,
    WorkflowStageId::Retro,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowStageId {
    Discovery,
    Spec,
    Tickets,
    Implement,
    Review,
    Retro,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowStageStatus {
    Ready,
    Locked,
    Pending,
    Running,
    Failed,
    Completed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkflowRunOutcome {
    Active,
    Archived,
    Done,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct WorkflowStageRecord {
    pub id: WorkflowStageId,
    pub revision: u64,
    pub status: WorkflowStageStatus,
    pub prerequisite: Option<WorkflowStageId>,
    #[serde(default)]
    pub awaiting_confirmation: bool,
    #[serde(default)]
    pub acceptance: Option<stages::WorkflowAcceptance>,
    #[serde(default)]
    pub acceptance_history: Vec<stages::WorkflowAcceptance>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct WorkflowRunRecord {
    pub id: String,
    pub title: String,
    pub outcome: WorkflowRunOutcome,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
    pub stages: Vec<WorkflowStageRecord>,
    #[serde(default)]
    pub executions: Vec<WorkflowExecution>,
    #[serde(default)]
    pub artifact_references: Vec<references::WorkflowArtifactReference>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct WorkflowDocument {
    format_version: u32,
    revision: u64,
    project_group_id: String,
    project_name: String,
    updated_at: i64,
    runs: Vec<WorkflowRunRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowProjectHistory {
    pub project_group_id: String,
    pub project_name: String,
    pub available: bool,
    pub revision: u64,
    pub runs: Vec<WorkflowRunRecord>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

fn new_stages() -> Vec<WorkflowStageRecord> {
    STAGES
        .iter()
        .enumerate()
        .map(|(index, id)| WorkflowStageRecord {
            id: *id,
            revision: 1,
            status: if index == 0 {
                WorkflowStageStatus::Ready
            } else {
                WorkflowStageStatus::Locked
            },
            prerequisite: (index != 0).then(|| STAGES[index - 1]),
            awaiting_confirmation: false,
            acceptance: None,
            acceptance_history: Vec::new(),
        })
        .collect()
}

fn decode_document(value: &Value, expected_group_id: &str) -> Result<WorkflowDocument> {
    let version = value
        .get("formatVersion")
        .and_then(Value::as_u64)
        .ok_or_else(|| anyhow!("workflow document is missing a valid formatVersion"))?;
    if !(1..=u64::from(WORKFLOW_DOCUMENT_VERSION)).contains(&version) {
        return Err(anyhow!("unsupported workflow document version {version}"));
    }
    let document: WorkflowDocument = serde_json::from_value(value.clone())
        .map_err(|error| anyhow!("malformed workflow document: {error}"))?;
    if document.project_group_id != expected_group_id {
        return Err(anyhow!(
            "workflow document project identity does not match its storage key"
        ));
    }
    if document
        .runs
        .iter()
        .any(|run| run.id.trim().is_empty() || run.title.trim().is_empty())
    {
        return Err(anyhow!(
            "workflow document contains a run without an id or title"
        ));
    }
    let unique_ids = document
        .runs
        .iter()
        .map(|run| run.id.as_str())
        .collect::<std::collections::HashSet<_>>();
    if unique_ids.len() != document.runs.len() {
        return Err(anyhow!(
            "workflow document contains duplicate run identities"
        ));
    }
    if document
        .runs
        .iter()
        .filter(|run| run.outcome == WorkflowRunOutcome::Active)
        .count()
        > 1
    {
        return Err(anyhow!(
            "workflow document contains more than one active run"
        ));
    }
    for run in &document.runs {
        if (run.outcome == WorkflowRunOutcome::Archived) != run.archived_at.is_some() {
            return Err(anyhow!(
                "workflow run archive timestamp does not match its outcome"
            ));
        }
        if run.stages.len() != STAGES.len()
            || run
                .stages
                .iter()
                .zip(STAGES)
                .enumerate()
                .any(|(index, (stage, id))| {
                    stage.id != id
                        || stage.revision == 0
                        || (index == 0 && stage.prerequisite.is_some())
                        || (index > 0 && stage.prerequisite != Some(STAGES[index - 1]))
                })
        {
            return Err(anyhow!(
                "workflow run contains invalid stage eligibility or revisions"
            ));
        }
        stages::validate_stage_state(run)?;
        references::validate_artifact_references(run)?;
    }
    executions::validate_executions(&document)?;
    Ok(document)
}

impl Database {
    fn workflow_document(&self, group_id: &str) -> Result<WorkflowDocument> {
        match self.kv_get(WORKFLOW_NAMESPACE, group_id)? {
            Some(value) => decode_document(&value, group_id),
            None => Ok(WorkflowDocument {
                format_version: WORKFLOW_DOCUMENT_VERSION,
                revision: 0,
                project_group_id: group_id.to_string(),
                project_name: String::new(),
                updated_at: 0,
                runs: Vec::new(),
            }),
        }
    }

    fn require_project_group(&self, group_id: &str) -> Result<ProjectGroupRecord> {
        if group_id.trim().is_empty() {
            return Err(anyhow!("project group id is required"));
        }
        self.list_project_groups()?
            .into_iter()
            .find(|group| group.id == group_id)
            .ok_or_else(|| anyhow!("project group is unavailable"))
    }

    pub fn list_workflow_histories(&self) -> Result<Vec<WorkflowProjectHistory>> {
        let groups = self.list_project_groups()?;
        let available_ids = groups
            .iter()
            .map(|group| group.id.clone())
            .collect::<std::collections::HashSet<_>>();
        let group_names = groups
            .into_iter()
            .map(|group| (group.id, group.name))
            .collect::<std::collections::HashMap<_, _>>();
        let mut statement = self
            .conn
            .prepare_cached("SELECT key, value_json FROM kv WHERE ns = ?1 ORDER BY key")?;
        let rows = statement.query_map(params![WORKFLOW_NAMESPACE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut histories = Vec::new();
        for row in rows {
            let (group_id, raw) = row?;
            let value = match serde_json::from_str::<Value>(&raw) {
                Ok(value) => value,
                Err(error) => {
                    histories.push(WorkflowProjectHistory {
                        project_group_id: group_id.clone(),
                        project_name: group_names.get(&group_id).cloned().unwrap_or_default(),
                        available: available_ids.contains(&group_id),
                        revision: 0,
                        runs: Vec::new(),
                        error: Some(format!("stored workflow document is invalid JSON: {error}")),
                    });
                    continue;
                }
            };
            match decode_document(&value, &group_id) {
                Ok(document) => histories.push(WorkflowProjectHistory {
                    project_group_id: group_id.clone(),
                    project_name: group_names
                        .get(&group_id)
                        .cloned()
                        .unwrap_or(document.project_name),
                    available: available_ids.contains(&group_id),
                    revision: document.revision,
                    runs: document.runs,
                    error: None,
                }),
                Err(error) => histories.push(WorkflowProjectHistory {
                    project_group_id: group_id.clone(),
                    project_name: group_names.get(&group_id).cloned().unwrap_or_default(),
                    available: available_ids.contains(&group_id),
                    revision: 0,
                    runs: Vec::new(),
                    error: Some(error.to_string()),
                }),
            }
        }
        Ok(histories)
    }

    pub fn read_workflow_history(&self, group_id: &str) -> Result<WorkflowProjectHistory> {
        let document = self.workflow_document(group_id)?;
        let group = self
            .list_project_groups()?
            .into_iter()
            .find(|item| item.id == group_id);
        Ok(WorkflowProjectHistory {
            project_group_id: group_id.to_string(),
            project_name: group
                .as_ref()
                .map(|item| item.name.clone())
                .unwrap_or(document.project_name),
            available: group.is_some(),
            revision: document.revision,
            runs: document.runs,
            error: None,
        })
    }

    pub fn create_workflow_run(
        &self,
        group_id: &str,
        title: &str,
        expected_revision: u64,
    ) -> Result<WorkflowProjectHistory> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 120 {
            return Err(anyhow!(
                "workflow run title must contain 1 to 120 characters"
            ));
        }
        let group = self.require_project_group(group_id)?;
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let raw = transaction
            .query_row(
                "SELECT value_json FROM kv WHERE ns = ?1 AND key = ?2",
                params![WORKFLOW_NAMESPACE, group_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let mut document = match raw {
            Some(raw) => {
                let value = serde_json::from_str::<Value>(&raw).map_err(|error| {
                    anyhow!("stored workflow document is invalid JSON: {error}")
                })?;
                decode_document(&value, group_id)?
            }
            None => self.workflow_document(group_id)?,
        };
        if document.revision != expected_revision {
            return Err(anyhow!(
                "workflow history changed; reload before creating a run (current revision {})",
                document.revision
            ));
        }
        if let Some(active) = document
            .runs
            .iter()
            .find(|run| run.outcome == WorkflowRunOutcome::Active)
        {
            return Err(anyhow!(
                "project already has an active workflow run: {}",
                active.title
            ));
        }
        let now = now_ms();
        document.format_version = WORKFLOW_DOCUMENT_VERSION;
        document.revision += 1;
        document.project_name = group.name;
        document.updated_at = now;
        document.runs.push(WorkflowRunRecord {
            id: Uuid::new_v4().to_string(),
            title: title.to_string(),
            outcome: WorkflowRunOutcome::Active,
            created_at: now,
            updated_at: now,
            archived_at: None,
            stages: new_stages(),
            executions: Vec::new(),
            artifact_references: Vec::new(),
        });
        transaction.execute(
            "INSERT INTO kv (ns, key, value_json, updated_at) VALUES (?1, ?2, ?3, ?4) \
             ON CONFLICT(ns, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            params![WORKFLOW_NAMESPACE, group_id, serde_json::to_string(&document)?, now],
        )?;
        transaction.commit()?;
        self.read_workflow_history(group_id)
    }

    pub fn archive_workflow_run(
        &self,
        group_id: &str,
        run_id: &str,
        expected_revision: u64,
    ) -> Result<WorkflowProjectHistory> {
        let _group = self.require_project_group(group_id)?;
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let raw = transaction
            .query_row(
                "SELECT value_json FROM kv WHERE ns = ?1 AND key = ?2",
                params![WORKFLOW_NAMESPACE, group_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or_else(|| anyhow!("workflow history not found"))?;
        let value = serde_json::from_str::<Value>(&raw)
            .map_err(|error| anyhow!("stored workflow document is invalid JSON: {error}"))?;
        let mut document = decode_document(&value, group_id)?;
        if document.revision != expected_revision {
            return Err(anyhow!(
                "workflow history changed; reload before archiving (current revision {})",
                document.revision
            ));
        }
        let run = document
            .runs
            .iter_mut()
            .find(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("workflow run not found"))?;
        if run.outcome != WorkflowRunOutcome::Active {
            return Err(anyhow!(
                "only an unfinished active workflow run can be archived"
            ));
        }
        if run
            .executions
            .iter()
            .any(|execution| execution.phase.is_unsettled())
        {
            return Err(anyhow!(
                "WORKFLOW_BUSY: running or pending executions cannot be archived"
            ));
        }
        let now = now_ms();
        run.outcome = WorkflowRunOutcome::Archived;
        run.updated_at = now;
        run.archived_at = Some(now);
        document.format_version = WORKFLOW_DOCUMENT_VERSION;
        document.revision += 1;
        document.updated_at = now;
        transaction.execute(
            "UPDATE kv SET value_json = ?3, updated_at = ?4 WHERE ns = ?1 AND key = ?2",
            params![
                WORKFLOW_NAMESPACE,
                group_id,
                serde_json::to_string(&document)?,
                now
            ],
        )?;
        transaction.commit()?;
        self.read_workflow_history(group_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    fn legacy_group(db: &Database, path: &Path) -> ProjectGroupRecord {
        std::fs::create_dir_all(path).unwrap();
        db.ensure_project(path.to_str().unwrap(), false).unwrap();
        db.list_project_groups().unwrap().pop().unwrap()
    }

    fn store_raw(db: &Database, key: &str, raw: &str) {
        db.conn()
            .execute(
                "INSERT INTO kv (ns, key, value_json, updated_at) VALUES (?1, ?2, ?3, ?4)",
                params![WORKFLOW_NAMESPACE, key, raw, now_ms()],
            )
            .unwrap();
    }

    fn raw_value(db: &Database, key: &str) -> String {
        db.conn()
            .query_row(
                "SELECT value_json FROM kv WHERE ns = ?1 AND key = ?2",
                params![WORKFLOW_NAMESPACE, key],
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn creating_a_run_unlocks_only_discovery_and_retains_prior_runs() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("pi.sqlite")).unwrap();
        let group = legacy_group(&db, &directory.path().join("project"));

        assert!(db.list_workflow_histories().unwrap().is_empty());
        let history = db
            .create_workflow_run(&group.id, "  First effort  ", 0)
            .unwrap();
        assert_eq!(history.revision, 1);
        assert_eq!(history.runs.len(), 1);
        assert_eq!(history.runs[0].title, "First effort");
        assert_eq!(history.runs[0].outcome, WorkflowRunOutcome::Active);
        assert_eq!(history.runs[0].stages.len(), 6);
        assert_eq!(history.runs[0].stages[0].status, WorkflowStageStatus::Ready);
        assert!(history.runs[0].stages[0].prerequisite.is_none());
        assert!(history.runs[0].stages[1..]
            .iter()
            .all(|stage| stage.status == WorkflowStageStatus::Locked));
        assert_eq!(
            history.runs[0].stages[1].prerequisite,
            Some(WorkflowStageId::Discovery)
        );
        assert!(db.create_workflow_run(&group.id, "Second", 1).is_err());

        let archived = db
            .archive_workflow_run(&group.id, &history.runs[0].id, 1)
            .unwrap();
        assert_eq!(archived.runs[0].outcome, WorkflowRunOutcome::Archived);
        assert!(archived.runs[0].archived_at.is_some());
        assert!(db
            .archive_workflow_run(&group.id, &history.runs[0].id, 1)
            .is_err());
        assert!(db.create_workflow_run(&group.id, "Second", 1).is_err());
        let retained = db.create_workflow_run(&group.id, "Second", 2).unwrap();
        assert_eq!(retained.runs.len(), 2);
        assert_eq!(retained.runs[0].outcome, WorkflowRunOutcome::Archived);
        assert_eq!(retained.runs[1].title, "Second");
    }

    #[test]
    fn malformed_and_future_documents_are_reported_without_rewriting_storage() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("pi.sqlite")).unwrap();
        let group = legacy_group(&db, &directory.path().join("project"));
        let future_raw = format!(
            r#"{{ "formatVersion" : 99, "projectGroupId" : "{}", "runs" : [] }}"#,
            group.id
        );
        store_raw(&db, &group.id, &future_raw);

        let history = db.list_workflow_histories().unwrap().pop().unwrap();
        assert!(history
            .error
            .unwrap()
            .contains("unsupported workflow document version 99"));
        assert_eq!(raw_value(&db, &group.id), future_raw);
        assert!(db.create_workflow_run(&group.id, "Blocked", 0).is_err());
        assert_eq!(raw_value(&db, &group.id), future_raw);

        let second_key = format!("{}-malformed", group.id);
        let malformed_raw = format!(
            r#"{{ "formatVersion": 1, "revision": 1, "projectGroupId": "{}", "runs": [] }}"#,
            group.id
        );
        store_raw(&db, &second_key, &malformed_raw);
        assert!(db.read_workflow_history(&second_key).is_err());
        assert_eq!(raw_value(&db, &second_key), malformed_raw);

        let invalid_json_key = format!("{}-invalid-json", group.id);
        store_raw(&db, &invalid_json_key, "{invalid");
        let invalid = db
            .list_workflow_histories()
            .unwrap()
            .into_iter()
            .find(|item| item.project_group_id == invalid_json_key)
            .unwrap();
        assert!(invalid.error.unwrap().contains("invalid JSON"));
        assert_eq!(raw_value(&db, &invalid_json_key), "{invalid");
    }

    #[test]
    fn concurrent_creation_for_one_project_has_exactly_one_winner() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("pi.sqlite");
        let db = Database::open(&path).unwrap();
        let group = legacy_group(&db, &directory.path().join("project"));
        drop(db);
        let barrier = Arc::new(Barrier::new(2));
        let workers = (0..2)
            .map(|index| {
                let path = path.clone();
                let group_id = group.id.clone();
                let barrier = Arc::clone(&barrier);
                std::thread::spawn(move || {
                    let db = Database::open(&path).unwrap();
                    barrier.wait();
                    db.create_workflow_run(&group_id, &format!("Run {index}"), 0)
                        .is_ok()
                })
            })
            .collect::<Vec<_>>();
        let winners = workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|success| *success)
            .count();
        assert_eq!(winners, 1);
        let db = Database::open(&path).unwrap();
        assert_eq!(db.read_workflow_history(&group.id).unwrap().runs.len(), 1);
    }

    #[test]
    fn retained_histories_for_removed_groups_are_marked_unavailable() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("pi.sqlite")).unwrap();
        let project = directory.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        db.ensure_project(project.to_str().unwrap(), false).unwrap();
        let group = db
            .create_project_group("Named", &[project.to_string_lossy().into_owned()])
            .unwrap();
        db.create_workflow_run(&group.id, "Retained", 0).unwrap();
        db.delete_project_group_record(&group.id).unwrap();

        let history = db.list_workflow_histories().unwrap().pop().unwrap();
        assert_eq!(history.project_group_id, group.id);
        assert!(!history.available);
        assert_eq!(history.runs[0].title, "Retained");
        assert!(db.kv_get(WORKFLOW_NAMESPACE, &group.id).unwrap().is_some());
    }

    #[test]
    fn renaming_a_project_group_does_not_change_workflow_ownership() {
        let directory = tempfile::tempdir().unwrap();
        let db = Database::open(&directory.path().join("pi.sqlite")).unwrap();
        let project = directory.path().join("project");
        std::fs::create_dir_all(&project).unwrap();
        db.ensure_project(project.to_str().unwrap(), false).unwrap();
        let group = db
            .create_project_group("Before", &[project.to_string_lossy().into_owned()])
            .unwrap();
        let created = db.create_workflow_run(&group.id, "Owned run", 0).unwrap();

        let renamed = db.rename_project_group(&group.id, "After").unwrap();
        assert_eq!(renamed.id, group.id);
        let history = db.read_workflow_history(&renamed.id).unwrap();
        assert_eq!(history.project_name, "After");
        assert_eq!(history.runs[0].id, created.runs[0].id);
    }

    #[test]
    fn restart_retains_histories_for_each_project_and_unrelated_data() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("pi.sqlite");
        let project_a = directory.path().join("a");
        let project_b = directory.path().join("b");
        let (group_a_id, group_b_id) = {
            let db = Database::open(&path).unwrap();
            let group_a = legacy_group(&db, &project_a);
            std::fs::create_dir_all(&project_b).unwrap();
            db.ensure_project(project_b.to_str().unwrap(), false)
                .unwrap();
            let group_b = db
                .list_project_groups()
                .unwrap()
                .into_iter()
                .find(|item| item.primary_path.ends_with("b"))
                .unwrap();
            db.create_workflow_run(&group_a.id, "A history", 0).unwrap();
            db.create_workflow_run(&group_b.id, "B history", 0).unwrap();
            db.kv_set("unrelated", "keep", &serde_json::json!({ "value": 7 }))
                .unwrap();
            (group_a.id, group_b.id)
        };

        let db = Database::open(&path).unwrap();
        let histories = db.list_workflow_histories().unwrap();
        assert_eq!(histories.len(), 2);
        assert_eq!(
            db.read_workflow_history(&group_a_id).unwrap().runs[0].title,
            "A history"
        );
        assert_eq!(
            db.read_workflow_history(&group_b_id).unwrap().runs[0].title,
            "B history"
        );
        assert_eq!(
            db.kv_get("unrelated", "keep").unwrap().unwrap(),
            serde_json::json!({ "value": 7 })
        );
    }
}
