use super::references::{WorkflowArtifactKind, WorkflowArtifactReference};
use super::*;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkflowArtifactRegistration {
    pub project_group_id: String,
    pub run_id: String,
    pub stage_id: WorkflowStageId,
    pub stage_revision: u64,
    pub kind: WorkflowArtifactKind,
    pub workspace_root: String,
    pub relative_path: String,
    pub ticket_id: Option<String>,
    pub expected_revision: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Availability {
    Available,
    Missing,
    RootUnavailable,
    PathDenied,
    NotFile,
    AccessDenied,
}

fn resolve_reference(
    group: Option<&ProjectGroupRecord>,
    reference: &WorkflowArtifactReference,
) -> (Availability, Option<std::path::PathBuf>) {
    if !group.is_some_and(|group| {
        group
            .roots
            .iter()
            .any(|root| root.path == reference.workspace_root)
    }) {
        return (Availability::RootUnavailable, None);
    }
    let root = Path::new(&reference.workspace_root);
    match std::fs::metadata(root) {
        Ok(info) if info.is_dir() => {}
        Ok(_) => return (Availability::RootUnavailable, None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return (Availability::RootUnavailable, None)
        }
        Err(error) => {
            tracing::warn!(reference_id = %reference.id, error_kind = ?error.kind(), "workflow reference root is unavailable");
            return (Availability::AccessDenied, None);
        }
    }
    // Reuse the host's existing lexical + existing-ancestor/symlink containment.
    let path = match crate::workspace::resolve_in_workspace(
        root,
        &reference.relative_path.replace('\\', "/"),
    ) {
        Ok(path) => path,
        Err(_) => return (Availability::PathDenied, None),
    };
    match std::fs::metadata(&path) {
        Ok(info) if info.is_file() => (Availability::Available, Some(path)),
        Ok(_) => (Availability::NotFile, None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => (Availability::Missing, None),
        Err(error) => {
            tracing::warn!(reference_id = %reference.id, error_kind = ?error.kind(), "workflow reference file is unavailable");
            (Availability::AccessDenied, None)
        }
    }
}

fn entry(
    run: &WorkflowRunRecord,
    group: Option<&ProjectGroupRecord>,
    reference: &WorkflowArtifactReference,
) -> (Value, Option<std::path::PathBuf>) {
    let (availability, path) = resolve_reference(group, reference);
    (
        serde_json::json!({ "reference": reference, "historical": reference.stage_revision != run.stages[reference.stage_id.index()].revision, "availability": availability }),
        path,
    )
}

impl Database {
    pub fn register_workflow_artifact(
        &self,
        input: WorkflowArtifactRegistration,
    ) -> Result<WorkflowProjectHistory> {
        if !references::valid_relative_reference_path(&input.relative_path)
            || input
                .ticket_id
                .as_ref()
                .is_some_and(|id| id.trim().is_empty() || id.len() > 256)
        {
            return Err(anyhow!("WORKFLOW_INVALID_REFERENCE: root-relative path and optional ticket identity required"));
        }
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let group = self.require_project_group(&input.project_group_id)?;
        if !group
            .roots
            .iter()
            .any(|root| root.path == input.workspace_root)
        {
            return Err(anyhow!(
                "WORKFLOW_ROOT_MISMATCH: reference root is not registered to this project"
            ));
        }
        let mut document = self.workflow_document(&input.project_group_id)?;
        if document.revision != input.expected_revision {
            return Err(anyhow!("WORKFLOW_CONFLICT: workflow history changed"));
        }
        let run = document
            .runs
            .iter_mut()
            .find(|run| run.id == input.run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        if run.outcome != WorkflowRunOutcome::Active {
            return Err(anyhow!("WORKFLOW_READ_ONLY: run is immutable"));
        }
        if run.stages[input.stage_id.index()].revision != input.stage_revision {
            return Err(anyhow!("WORKFLOW_CONFLICT: stage revision changed"));
        }
        let reference = WorkflowArtifactReference {
            id: Uuid::new_v4().to_string(),
            run_id: input.run_id,
            stage_id: input.stage_id,
            stage_revision: input.stage_revision,
            kind: input.kind,
            workspace_root: input.workspace_root,
            relative_path: input.relative_path.replace('\\', "/"),
            ticket_id: input.ticket_id,
        };
        if resolve_reference(Some(&group), &reference).0 == Availability::PathDenied {
            return Err(anyhow!(
                "WORKFLOW_PATH_DENIED: reference escapes its registered root"
            ));
        }
        run.artifact_references.push(reference);
        run.updated_at = now_ms();
        self.persist_workflow(&mut document)?;
        transaction.commit()?;
        self.read_workflow_history(&input.project_group_id)
    }

    pub fn list_workflow_artifacts(&self, group_id: &str, run_id: &str) -> Result<Value> {
        let document = self.workflow_document(group_id)?;
        let group = self
            .list_project_groups()?
            .into_iter()
            .find(|group| group.id == group_id);
        let run = document
            .runs
            .iter()
            .find(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        let entries: Vec<Value> = run
            .artifact_references
            .iter()
            .map(|reference| entry(run, group.as_ref(), reference).0)
            .collect();
        Ok(serde_json::json!({ "entries": entries, "revision": document.revision }))
    }

    pub fn resolve_workflow_artifact(
        &self,
        group_id: &str,
        run_id: &str,
        reference_id: &str,
    ) -> Result<Value> {
        let document = self.workflow_document(group_id)?;
        let group = self
            .list_project_groups()?
            .into_iter()
            .find(|group| group.id == group_id);
        let run = document
            .runs
            .iter()
            .find(|run| run.id == run_id)
            .ok_or_else(|| anyhow!("WORKFLOW_RUN_UNAVAILABLE: run not found"))?;
        let reference = run
            .artifact_references
            .iter()
            .find(|reference| reference.id == reference_id)
            .ok_or_else(|| anyhow!("WORKFLOW_REFERENCE_UNAVAILABLE: reference not found"))?;
        let (entry, path) = entry(run, group.as_ref(), reference);
        Ok(
            serde_json::json!({ "entry": entry, "path": path.map(|path| path.to_string_lossy().into_owned()) }),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_test_link(target: &Path, link: &Path) {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let result = std::process::Command::new("powershell.exe")
                .args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:PI_TEST_LINK -Target $env:PI_TEST_TARGET | Out-Null"])
                .env("PI_TEST_LINK", link).env("PI_TEST_TARGET", target)
                .creation_flags(0x08000000).output().unwrap();
            assert!(
                result.status.success(),
                "{}",
                String::from_utf8_lossy(&result.stderr)
            );
        }
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(target, link).unwrap();
        }
    }

    fn fixture() -> (tempfile::TempDir, Database, WorkflowArtifactRegistration) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(&root).unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        crate::sessions::create_session(
            &db,
            None,
            None,
            None,
            None,
            Some(root.to_string_lossy().into_owned()),
        )
        .unwrap();
        let group = db
            .project_group_for_path(root.to_str().unwrap())
            .unwrap()
            .unwrap();
        let history = db.create_workflow_run(&group.id, "Artifacts", 0).unwrap();
        let input = WorkflowArtifactRegistration {
            project_group_id: group.id,
            run_id: history.runs[0].id.clone(),
            stage_id: WorkflowStageId::Discovery,
            stage_revision: 1,
            kind: WorkflowArtifactKind::Glossary,
            workspace_root: group.roots[0].path.clone(),
            relative_path: "missing.md".into(),
            ticket_id: None,
            expected_revision: history.revision,
        };
        (dir, db, input)
    }

    #[test]
    fn all_kinds_survive_restart_and_detached_roots_keep_their_original_association() {
        let (dir, db, mut input) = fixture();
        let primary = input.workspace_root.clone();
        let group = db
            .create_project_group("Artifacts", std::slice::from_ref(&primary))
            .unwrap();
        let history = db
            .create_workflow_run(&group.id, "Registered roots", 0)
            .unwrap();
        input.project_group_id = group.id;
        input.run_id = history.runs[0].id.clone();
        input.expected_revision = history.revision;
        let secondary = dir.path().join("secondary");
        std::fs::create_dir_all(&secondary).unwrap();
        std::fs::write(secondary.join("artifact.md"), "fixture").unwrap();
        let updated = db
            .update_project_group(
                &input.project_group_id,
                "Artifacts",
                &[primary.clone(), secondary.to_string_lossy().into_owned()],
            )
            .unwrap();
        input.workspace_root = updated.roots[1].path.clone();
        input.relative_path = "artifact.md".into();
        input.ticket_id = Some("ticket-17".into());
        for kind in [
            WorkflowArtifactKind::Glossary,
            WorkflowArtifactKind::Adr,
            WorkflowArtifactKind::Spec,
            WorkflowArtifactKind::Ticket,
            WorkflowArtifactKind::Review,
            WorkflowArtifactKind::Retro,
        ] {
            input.kind = kind;
            let history = db
                .register_workflow_artifact(
                    serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap(),
                )
                .unwrap();
            input.expected_revision = history.revision;
        }
        let before = db.read_workflow_history(&input.project_group_id).unwrap();
        assert_eq!(before.runs[0].artifact_references.len(), 6);
        db.update_project_group(&input.project_group_id, "Artifacts", &[primary])
            .unwrap();
        let list = db
            .list_workflow_artifacts(&input.project_group_id, &input.run_id)
            .unwrap();
        for value in list["entries"].as_array().unwrap() {
            assert_eq!(value["availability"], "rootUnavailable");
            assert_eq!(value["reference"]["workspaceRoot"], input.workspace_root);
            assert_eq!(value["reference"]["ticketId"], "ticket-17");
        }
        assert!(db
            .register_workflow_artifact(
                serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap()
            )
            .is_err());
        drop(db);
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        assert_eq!(
            serde_json::to_value(before).unwrap(),
            serde_json::to_value(db.read_workflow_history(&input.project_group_id).unwrap())
                .unwrap()
        );
        assert_eq!(
            list,
            db.list_workflow_artifacts(&input.project_group_id, &input.run_id)
                .unwrap()
        );
    }

    #[test]
    fn completed_runs_retain_openable_references_but_refuse_registration() {
        let (_dir, db, mut input) = fixture();
        std::fs::write(
            Path::new(&input.workspace_root).join("missing.md"),
            "fixture",
        )
        .unwrap();
        let mut history = db
            .register_workflow_artifact(
                serde_json::from_value(serde_json::to_value(&input).unwrap()).unwrap(),
            )
            .unwrap();
        let session = crate::sessions::list_sessions(&db).unwrap()[0].id.clone();
        for (index, stage) in STAGES.iter().enumerate() {
            let admission = db
                .reserve_workflow_stage(WorkflowStageRequest {
                    group: &input.project_group_id,
                    run_id: &input.run_id,
                    session: &session,
                    request: &format!("artifact-done-{index}"),
                    revision: history.revision,
                    stage_id: *stage,
                    active_ticket_id: None,
                })
                .unwrap();
            let turn = db
                .begin_workflow_turn(&admission.execution.id, &session, None, None)
                .unwrap();
            crate::sessions::end_turn(&db, &turn, "completed", None, None, false).unwrap();
            history = db.read_workflow_history(&input.project_group_id).unwrap();
            history = db
                .accept_workflow_stage(
                    &input.project_group_id,
                    &input.run_id,
                    *stage,
                    history.revision,
                )
                .unwrap();
        }
        assert_eq!(history.runs[0].outcome, WorkflowRunOutcome::Done);
        input.expected_revision = history.revision;
        let group = input.project_group_id.clone();
        let run = input.run_id.clone();
        assert!(db
            .register_workflow_artifact(input)
            .unwrap_err()
            .to_string()
            .starts_with("WORKFLOW_READ_ONLY"));
        assert_eq!(
            db.list_workflow_artifacts(&group, &run).unwrap()["entries"][0]["availability"],
            "available"
        );
        assert!(db
            .resolve_workflow_artifact(&group, &run, &history.runs[0].artifact_references[0].id)
            .unwrap()["path"]
            .is_string());
        assert_eq!(
            serde_json::to_value(history).unwrap(),
            serde_json::to_value(db.read_workflow_history(&group).unwrap()).unwrap()
        );
    }

    #[test]
    fn missing_files_remain_visible_and_archive_rejects_reference_mutation() {
        let (_dir, db, input) = fixture();
        let group = input.project_group_id.clone();
        let run = input.run_id.clone();
        let history = db.register_workflow_artifact(input).unwrap();
        let reference = &history.runs[0].artifact_references[0];
        assert_eq!(
            db.list_workflow_artifacts(&group, &run).unwrap()["entries"][0]["availability"],
            "missing"
        );
        assert!(db
            .resolve_workflow_artifact(&group, &run, &reference.id)
            .unwrap()["path"]
            .is_null());
        let archived = db
            .archive_workflow_run(&group, &run, history.revision)
            .unwrap();
        let invalid = WorkflowArtifactRegistration {
            project_group_id: group.clone(),
            run_id: run.clone(),
            stage_id: reference.stage_id,
            stage_revision: 1,
            kind: WorkflowArtifactKind::Glossary,
            workspace_root: reference.workspace_root.clone(),
            relative_path: "another.md".into(),
            ticket_id: None,
            expected_revision: archived.revision,
        };
        assert!(db
            .register_workflow_artifact(invalid)
            .unwrap_err()
            .to_string()
            .starts_with("WORKFLOW_READ_ONLY"));
        assert_eq!(
            archived.revision,
            db.read_workflow_history(&group).unwrap().revision
        );
        assert_eq!(
            db.list_workflow_artifacts(&group, &run).unwrap()["entries"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn unsafe_paths_roots_types_and_stale_mutations_leave_history_unchanged() {
        let (dir, db, input) = fixture();
        let payload = serde_json::to_value(&input).unwrap();
        let before =
            serde_json::to_value(db.read_workflow_history(&input.project_group_id).unwrap())
                .unwrap();
        for path in [
            "../outside.md",
            "/outside.md",
            "C:\\outside.md",
            "docs/../../outside.md",
            "notes.md:stream",
            "docs//file.md",
            "bad\0file",
        ] {
            let mut bad = payload.clone();
            bad["relativePath"] = json!(path);
            assert!(db
                .register_workflow_artifact(serde_json::from_value(bad).unwrap())
                .is_err());
        }
        for (key, value) in [
            (
                "workspaceRoot",
                json!(dir.path().join("foreign").to_string_lossy()),
            ),
            ("runId", json!("other-run")),
            ("expectedRevision", json!(0)),
            ("stageRevision", json!(2)),
        ] {
            let mut bad = payload.clone();
            bad[key] = value;
            assert!(db
                .register_workflow_artifact(serde_json::from_value(bad).unwrap())
                .is_err());
        }
        let mut unknown = payload;
        unknown["kind"] = json!("unknown");
        assert!(serde_json::from_value::<WorkflowArtifactRegistration>(unknown).is_err());
        assert_eq!(
            before,
            serde_json::to_value(db.read_workflow_history(&input.project_group_id).unwrap())
                .unwrap()
        );
    }

    #[test]
    fn escaping_links_are_refused_and_replaced_links_become_unavailable() {
        let (dir, db, mut input) = fixture();
        let root = PathBuf::from(&input.workspace_root);
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::write(outside.join("secret.md"), "fixture private content").unwrap();
        let link = root.join("link");
        make_test_link(&outside, &link);
        input.relative_path = "link/secret.md".into();
        let payload = serde_json::to_value(&input).unwrap();
        assert!(db
            .register_workflow_artifact(input)
            .unwrap_err()
            .to_string()
            .starts_with("WORKFLOW_PATH_DENIED"));
        assert_eq!(
            std::fs::read_to_string(outside.join("secret.md")).unwrap(),
            "fixture private content"
        );
        #[cfg(windows)]
        {
            std::fs::remove_dir(&link).unwrap();
        }
        #[cfg(unix)]
        {
            std::fs::remove_file(&link).unwrap();
        }
        let inside = root.join("inside");
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::write(inside.join("secret.md"), "inside fixture").unwrap();
        make_test_link(&inside, &link);
        let registered = db
            .register_workflow_artifact(serde_json::from_value(payload).unwrap())
            .unwrap();
        let reference = &registered.runs[0].artifact_references[0];
        #[cfg(windows)]
        {
            std::fs::remove_dir(&link).unwrap();
        }
        #[cfg(unix)]
        {
            std::fs::remove_file(&link).unwrap();
        }
        make_test_link(&outside, &link);
        let resolved = db
            .resolve_workflow_artifact(
                &registered.project_group_id,
                &reference.run_id,
                &reference.id,
            )
            .unwrap();
        assert_eq!(resolved["entry"]["availability"], "pathDenied");
        assert!(resolved["path"].is_null());
        assert_eq!(
            registered.revision,
            db.read_workflow_history(&registered.project_group_id)
                .unwrap()
                .revision
        );
    }

    #[test]
    fn a_new_run_registers_and_opens_a_reference_without_execution_or_acceptance() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir_all(root.join("docs")).unwrap();
        std::fs::write(
            root.join("docs/glossary.md"),
            "# Glossary\nWorkflow Project is a logical project group.",
        )
        .unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        let session = crate::sessions::create_session(
            &db,
            None,
            None,
            None,
            None,
            Some(root.to_string_lossy().into_owned()),
        )
        .unwrap();
        let group = db
            .project_group_for_path(root.to_str().unwrap())
            .unwrap()
            .unwrap();
        let initial = db
            .create_workflow_run(&group.id, "Reference effort", 0)
            .unwrap();
        let registered = db
            .register_workflow_artifact(WorkflowArtifactRegistration {
                project_group_id: group.id.clone(),
                run_id: initial.runs[0].id.clone(),
                stage_id: WorkflowStageId::Discovery,
                stage_revision: 1,
                kind: WorkflowArtifactKind::Glossary,
                workspace_root: group.roots[0].path.clone(),
                relative_path: "docs/glossary.md".into(),
                ticket_id: None,
                expected_revision: initial.revision,
            })
            .unwrap();
        assert!(registered.runs[0].executions.is_empty());
        assert!(registered.runs[0].stages[0].acceptance.is_none());
        let id = registered.runs[0].artifact_references[0].id.clone();
        let listed = db
            .list_workflow_artifacts(&group.id, &initial.runs[0].id)
            .unwrap();
        assert_eq!(listed["entries"][0]["availability"], "available");
        assert_eq!(listed["entries"][0]["historical"], false);
        let opened = db
            .resolve_workflow_artifact(&group.id, &initial.runs[0].id, &id)
            .unwrap();
        assert_eq!(
            opened["path"],
            crate::workspace::simple_canonicalize(&root.join("docs/glossary.md"))
                .unwrap()
                .to_string_lossy()
                .as_ref()
        );
        assert_eq!(
            registered.revision,
            db.read_workflow_history(&group.id).unwrap().revision
        );
        assert!(crate::sessions::get_session(&db, &session.id)
            .unwrap()
            .is_some());
    }
}
