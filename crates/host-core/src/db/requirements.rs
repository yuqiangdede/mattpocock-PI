use super::*;
use rusqlite::{Transaction, TransactionBehavior};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use uuid::Uuid;

const NAMESPACE: &str = "requirementsConfirmations";
const MAX_CONTENT_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequirementsTarget {
    pub project_group_id: String,
    pub workspace_root: String,
    pub relative_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequirementsDecision {
    #[serde(flatten)]
    pub target: RequirementsTarget,
    pub expected_revision: u64,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequirementsConfirmation {
    pub id: String,
    pub workspace_root: String,
    pub relative_path: String,
    pub content_hash: String,
    pub confirmed_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequirementsHistory {
    pub format_version: u32,
    pub project_group_id: String,
    pub revision: u64,
    pub confirmations: Vec<RequirementsConfirmation>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementsPreview {
    pub target: RequirementsTarget,
    pub content: String,
    pub summary: String,
    pub content_hash: String,
    pub revision: u64,
    pub latest_confirmation: Option<RequirementsConfirmation>,
    pub status: &'static str,
}

fn valid_path(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= 8192
        && !path.chars().any(char::is_control)
        && !path.starts_with(['/', '\\'])
        && !path.contains(':')
        && !path
            .split(['/', '\\'])
            .any(|part| part.is_empty() || part == "." || part == "..")
        && matches!(
            Path::new(path).extension().and_then(|value| value.to_str()),
            Some("md" | "markdown" | "txt")
        )
}

fn same_file(record: &RequirementsConfirmation, target: &RequirementsTarget) -> bool {
    if cfg!(windows) {
        record
            .workspace_root
            .eq_ignore_ascii_case(&target.workspace_root)
            && record
                .relative_path
                .eq_ignore_ascii_case(&target.relative_path)
    } else {
        record.workspace_root == target.workspace_root
            && record.relative_path == target.relative_path
    }
}

impl Database {
    pub fn resolve_requirements(&self, target: &RequirementsTarget) -> Result<PathBuf> {
        if !valid_path(&target.relative_path) {
            return Err(anyhow!(
                "REQUIREMENTS_INVALID_PATH: select a root-relative Markdown or text file"
            ));
        }
        let group = self
            .list_project_groups()?
            .into_iter()
            .find(|group| group.id == target.project_group_id)
            .ok_or_else(|| {
                anyhow!("REQUIREMENTS_PROJECT_UNAVAILABLE: project group is unavailable")
            })?;
        if !group
            .roots
            .iter()
            .any(|root| root.path == target.workspace_root)
        {
            return Err(anyhow!(
                "REQUIREMENTS_PATH_DENIED: root is not registered to this project"
            ));
        }
        let path = crate::workspace::resolve_in_workspace(
            Path::new(&target.workspace_root),
            &target.relative_path.replace('\\', "/"),
        )
        .map_err(|_| anyhow!("REQUIREMENTS_PATH_DENIED: file escapes its registered root"))?;
        let metadata = std::fs::metadata(&path)
            .map_err(|_| anyhow!("REQUIREMENTS_FILE_UNAVAILABLE: file cannot be read"))?;
        if !metadata.is_file() || metadata.len() > MAX_CONTENT_BYTES {
            return Err(anyhow!(
                "REQUIREMENTS_INVALID_FILE: select a text file no larger than 256 KiB"
            ));
        }
        Ok(path)
    }

    pub fn read_requirements_history(&self, group_id: &str) -> Result<RequirementsHistory> {
        if !self
            .list_project_groups()?
            .iter()
            .any(|group| group.id == group_id)
        {
            return Err(anyhow!(
                "REQUIREMENTS_PROJECT_UNAVAILABLE: project group is unavailable"
            ));
        }
        let Some(value) = self.kv_get(NAMESPACE, group_id)? else {
            return Ok(RequirementsHistory {
                format_version: 1,
                project_group_id: group_id.into(),
                revision: 0,
                confirmations: Vec::new(),
            });
        };
        let history: RequirementsHistory = serde_json::from_value(value).map_err(|_| {
            anyhow!("REQUIREMENTS_HISTORY_UNAVAILABLE: stored history is malformed")
        })?;
        let mut ids = std::collections::HashSet::new();
        if history.format_version != 1
            || history.project_group_id != group_id
            || history.revision != history.confirmations.len() as u64
            || history.confirmations.iter().any(|record| {
                record.id.is_empty()
                    || !ids.insert(&record.id)
                    || record.workspace_root.is_empty()
                    || !valid_path(&record.relative_path)
                    || record.content_hash.len() != 64
                    || !record
                        .content_hash
                        .bytes()
                        .all(|byte| byte.is_ascii_hexdigit())
                    || record.confirmed_at < 0
            })
        {
            return Err(anyhow!(
                "REQUIREMENTS_HISTORY_UNAVAILABLE: stored history is unsupported or malformed"
            ));
        }
        Ok(history)
    }

    pub fn preview_requirements(&self, input: &RequirementsTarget) -> Result<RequirementsPreview> {
        let path = self.resolve_requirements(input)?;
        let mut bytes = Vec::new();
        let root =
            cap_std::fs::Dir::open_ambient_dir(&input.workspace_root, cap_std::ambient_authority())
                .map_err(|_| anyhow!("REQUIREMENTS_FILE_UNAVAILABLE: root cannot be read"))?;
        root.open(input.relative_path.replace('\\', "/"))
            .map_err(|_| anyhow!("REQUIREMENTS_FILE_UNAVAILABLE: file cannot be read"))?
            .take(MAX_CONTENT_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| anyhow!("REQUIREMENTS_FILE_UNAVAILABLE: file cannot be read"))?;
        if bytes.len() as u64 > MAX_CONTENT_BYTES {
            return Err(anyhow!(
                "REQUIREMENTS_INVALID_FILE: specification exceeds 256 KiB"
            ));
        }
        let content_hash = hex::encode(Sha256::digest(&bytes));
        let content = String::from_utf8(bytes)
            .map_err(|_| anyhow!("REQUIREMENTS_INVALID_FILE: specification must be UTF-8 text"))?;
        if content.trim().is_empty() || content.contains('\0') {
            return Err(anyhow!(
                "REQUIREMENTS_INVALID_FILE: specification must contain nonempty text"
            ));
        }
        // Re-resolve after reading so a replaced symlink cannot approve another root.
        if self.resolve_requirements(input)? != path {
            return Err(anyhow!(
                "REQUIREMENTS_CONFLICT: file changed during preview"
            ));
        }
        let target = RequirementsTarget {
            relative_path: input.relative_path.replace('\\', "/"),
            ..input.clone()
        };
        let history = self.read_requirements_history(&target.project_group_id)?;
        let latest_confirmation = history
            .confirmations
            .into_iter()
            .rev()
            .find(|record| same_file(record, &target));
        let status = match &latest_confirmation {
            Some(record) if record.content_hash == content_hash => "confirmed",
            Some(_) => "changed",
            None => "unconfirmed",
        };
        // A deterministic excerpt of the exact preview replaces an implicit model call.
        let summary = content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .take(8)
            .collect::<Vec<_>>()
            .join("\n")
            .chars()
            .take(1200)
            .collect();
        Ok(RequirementsPreview {
            target,
            content,
            summary,
            content_hash,
            revision: history.revision,
            latest_confirmation,
            status,
        })
    }

    pub fn confirm_requirements(
        &self,
        decision: &RequirementsDecision,
    ) -> Result<RequirementsHistory> {
        let transaction = Transaction::new_unchecked(&self.conn, TransactionBehavior::Immediate)?;
        let preview = self.preview_requirements(&decision.target)?;
        let mut history = self.read_requirements_history(&decision.target.project_group_id)?;
        // A lost response may retry the exact decision. Only its own immediately
        // preceding write can satisfy a stale revision; unrelated writes still conflict.
        let immediate_retry = preview.status == "confirmed"
            && decision.expected_revision.checked_add(1) == Some(history.revision)
            && preview
                .latest_confirmation
                .as_ref()
                .map(|record| &record.id)
                == history.confirmations.last().map(|record| &record.id);
        if preview.content_hash != decision.content_hash
            || (preview.revision != decision.expected_revision && !immediate_retry)
        {
            return Err(anyhow!(
                "REQUIREMENTS_CONFLICT: requirements or history changed; refresh before confirming"
            ));
        }
        if preview.status != "confirmed" {
            if history.confirmations.len() >= 10000 {
                return Err(anyhow!(
                    "REQUIREMENTS_HISTORY_UNAVAILABLE: confirmation history is full"
                ));
            }
            history.confirmations.push(RequirementsConfirmation {
                id: Uuid::new_v4().to_string(),
                workspace_root: preview.target.workspace_root,
                relative_path: preview.target.relative_path,
                content_hash: preview.content_hash,
                confirmed_at: now_ms(),
            });
            history.revision += 1;
            self.kv_set(
                NAMESPACE,
                &history.project_group_id,
                &serde_json::to_value(&history)?,
            )?;
        }
        transaction.commit()?;
        Ok(history)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordinary_chat_requirements_confirmation_survives_restart_without_a_run() {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path().join("project");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(
            root.join("requirements.md"),
            "# Requirements\n\nA human decision.",
        )
        .unwrap();
        let db_path = scratch.path().join("test.db");
        let db = Database::open(&db_path).unwrap();
        let group = db
            .create_project_group("Project", &[root.to_str().unwrap().into()])
            .unwrap();
        let target = RequirementsTarget {
            project_group_id: group.id.clone(),
            workspace_root: group.roots[0].path.clone(),
            relative_path: "requirements.md".into(),
        };
        let preview = db.preview_requirements(&target).unwrap();
        let history = db
            .confirm_requirements(&RequirementsDecision {
                target: target.clone(),
                expected_revision: 0,
                content_hash: preview.content_hash,
            })
            .unwrap();
        assert_eq!(history.confirmations.len(), 1);
        assert_eq!(history.revision, 1);
        assert!(db.read_workflow_history(&group.id).unwrap().runs.is_empty());
        drop(db);
        let reopened = Database::open(&db_path).unwrap();
        assert_eq!(
            reopened
                .read_requirements_history(&group.id)
                .unwrap()
                .confirmations[0]
                .id,
            history.confirmations[0].id
        );
    }

    fn fixture() -> (tempfile::TempDir, Database, RequirementsTarget) {
        let scratch = tempfile::tempdir().unwrap();
        let root = scratch.path().join("project");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("spec.md"), "# Specification\n\nFirst version.").unwrap();
        let db = Database::open(&scratch.path().join("test.db")).unwrap();
        let group = db
            .create_project_group("Project", &[root.to_str().unwrap().into()])
            .unwrap();
        let target = RequirementsTarget {
            project_group_id: group.id,
            workspace_root: group.roots[0].path.clone(),
            relative_path: "spec.md".into(),
        };
        (scratch, db, target)
    }

    #[test]
    fn changed_content_requires_reconfirmation_and_retains_prior_decisions() {
        let (_scratch, db, target) = fixture();
        let first = db.preview_requirements(&target).unwrap();
        assert_eq!(first.status, "unconfirmed");
        let decision = RequirementsDecision {
            target: target.clone(),
            expected_revision: first.revision,
            content_hash: first.content_hash,
        };
        db.confirm_requirements(&decision).unwrap();
        assert_eq!(
            db.preview_requirements(&target).unwrap().status,
            "confirmed"
        );
        std::fs::write(
            Path::new(&target.workspace_root).join("spec.md"),
            "# Specification\n\nRevised behavior.",
        )
        .unwrap();
        let revised = db.preview_requirements(&target).unwrap();
        assert_eq!(revised.status, "changed");
        assert!(db.confirm_requirements(&decision).is_err());
        assert_eq!(
            db.read_requirements_history(&target.project_group_id)
                .unwrap()
                .revision,
            1
        );
        let history = db
            .confirm_requirements(&RequirementsDecision {
                target: target.clone(),
                expected_revision: revised.revision,
                content_hash: revised.content_hash,
            })
            .unwrap();
        assert_eq!(history.confirmations.len(), 2);
        assert_ne!(
            history.confirmations[0].content_hash,
            history.confirmations[1].content_hash
        );
        assert_eq!(
            db.preview_requirements(&target).unwrap().status,
            "confirmed"
        );
    }

    #[test]
    fn edits_after_preview_are_rejected_without_a_confirmation() {
        let (_scratch, db, target) = fixture();
        let preview = db.preview_requirements(&target).unwrap();
        std::fs::write(
            Path::new(&target.workspace_root).join("spec.md"),
            "Changed while preview was open.",
        )
        .unwrap();
        assert!(db
            .confirm_requirements(&RequirementsDecision {
                target: target.clone(),
                expected_revision: preview.revision,
                content_hash: preview.content_hash
            })
            .unwrap_err()
            .to_string()
            .contains("REQUIREMENTS_CONFLICT"));
        assert!(db
            .read_requirements_history(&target.project_group_id)
            .unwrap()
            .confirmations
            .is_empty());
    }

    #[test]
    fn retrying_the_same_human_decision_is_idempotent_but_other_writes_conflict() {
        let (_scratch, db, target) = fixture();
        let preview = db.preview_requirements(&target).unwrap();
        let decision = RequirementsDecision {
            target: target.clone(),
            expected_revision: preview.revision,
            content_hash: preview.content_hash,
        };
        let first = db.confirm_requirements(&decision).unwrap();
        let repeated = db.confirm_requirements(&decision).unwrap();
        assert_eq!(repeated.revision, first.revision);
        assert_eq!(repeated.confirmations.len(), 1);
        assert_eq!(repeated.confirmations[0].id, first.confirmations[0].id);
        let other_target = RequirementsTarget {
            relative_path: "other.md".into(),
            ..target
        };
        std::fs::write(
            Path::new(&other_target.workspace_root).join("other.md"),
            "# Other specification",
        )
        .unwrap();
        let other = db.preview_requirements(&other_target).unwrap();
        db.confirm_requirements(&RequirementsDecision {
            target: other_target,
            expected_revision: other.revision,
            content_hash: other.content_hash,
        })
        .unwrap();
        assert!(db.confirm_requirements(&decision).is_err());
    }

    #[test]
    fn multiple_specifications_share_project_history_without_unlocking_stages() {
        let (_scratch, db, target) = fixture();
        let workflow = db
            .create_workflow_run(&target.project_group_id, "Effort", 0)
            .unwrap();
        for file in ["spec.md", "other.md"] {
            std::fs::write(
                Path::new(&target.workspace_root).join(file),
                "# Independent specification",
            )
            .unwrap();
            let file_target = RequirementsTarget {
                relative_path: file.into(),
                ..target.clone()
            };
            let preview = db.preview_requirements(&file_target).unwrap();
            db.confirm_requirements(&RequirementsDecision {
                target: file_target,
                expected_revision: preview.revision,
                content_hash: preview.content_hash,
            })
            .unwrap();
        }
        assert_eq!(
            db.read_requirements_history(&target.project_group_id)
                .unwrap()
                .confirmations
                .len(),
            2
        );
        let current = db.read_workflow_history(&target.project_group_id).unwrap();
        assert_eq!(current.revision, workflow.revision);
        assert_eq!(
            current.runs[0].stages[1].status,
            super::super::WorkflowStageStatus::Locked
        );
        let other_root = Path::new(&target.workspace_root)
            .parent()
            .unwrap()
            .join("other-project");
        std::fs::create_dir(&other_root).unwrap();
        let other = db
            .create_project_group("Other", &[other_root.to_string_lossy().into_owned()])
            .unwrap();
        assert!(db
            .read_requirements_history(&other.id)
            .unwrap()
            .confirmations
            .is_empty());
        assert!(db
            .preview_requirements(&RequirementsTarget {
                project_group_id: other.id,
                ..target
            })
            .is_err());
    }

    #[test]
    fn unsafe_missing_binary_empty_and_oversized_files_are_rejected() {
        let (_scratch, db, target) = fixture();
        for relative_path in [
            "../spec.md",
            "./spec.md",
            "/spec.md",
            "C:/spec.md",
            "docs//spec.md",
            "missing.md",
            "spec.db",
        ] {
            assert!(
                db.preview_requirements(&RequirementsTarget {
                    relative_path: relative_path.into(),
                    ..target.clone()
                })
                .is_err(),
                "{relative_path}"
            );
        }
        for bytes in [
            vec![0xff],
            Vec::new(),
            vec![b'x'; MAX_CONTENT_BYTES as usize + 1],
        ] {
            std::fs::write(Path::new(&target.workspace_root).join("spec.md"), bytes).unwrap();
            assert!(db.preview_requirements(&target).is_err());
        }
    }

    #[test]
    fn unknown_storage_versions_are_preserved_and_cannot_be_overwritten() {
        let (_scratch, db, target) = fixture();
        let stored = serde_json::json!({ "formatVersion": 99, "projectGroupId": target.project_group_id, "revision": 0, "confirmations": [] });
        db.kv_set(NAMESPACE, &target.project_group_id, &stored)
            .unwrap();
        assert!(db.preview_requirements(&target).is_err());
        assert_eq!(
            db.kv_get(NAMESPACE, &target.project_group_id).unwrap(),
            Some(stored)
        );
    }

    #[test]
    fn rpc_decision_shape_deserializes_but_rejects_unknown_fields() {
        let input = serde_json::json!({ "projectGroupId": "p", "workspaceRoot": "r", "relativePath": "spec.md", "expectedRevision": 0, "contentHash": "a".repeat(64) });
        assert!(serde_json::from_value::<RequirementsDecision>(input.clone()).is_ok());
        let mut invalid = input;
        invalid["approveStage"] = Value::Bool(true);
        assert!(serde_json::from_value::<RequirementsDecision>(invalid).is_err());
    }
}
