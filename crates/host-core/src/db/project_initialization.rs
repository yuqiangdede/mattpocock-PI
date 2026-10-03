use super::*;
use cap_std::{ambient_authority, fs::Dir};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::{Read, Write};
use uuid::Uuid;
const NS: &str = "projectInitialization";
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preview {
    id: String,
    version: u32,
    project_path: String,
    session_id: String,
    description: String,
    stack: String,
    files: Vec<FilePreview>,
    #[serde(default)]
    outcomes: Vec<Value>,
    #[serde(default)]
    selected: Vec<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct FilePreview {
    path: String,
    item: String,
    before: Option<String>,
    after: String,
}
fn read_existing(root: &Dir, path: &str) -> Result<Option<String>> {
    match root.open(path) {
        Ok(file) => {
            let mut content = String::new();
            file.take(128 * 1024 + 1).read_to_string(&mut content)?;
            if content.len() > 128 * 1024 {
                return Err(anyhow!("Existing file exceeds preview limit"));
            }
            Ok(Some(content))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.into()),
    }
}
impl Database {
    pub fn preview_project_initialization(
        &self,
        session: &str,
        path: &str,
        description: &str,
    ) -> Result<Value> {
        if description.trim().is_empty() || description.len() > 32000 {
            return Err(anyhow!("Task description required"));
        }
        let path =
            canonical_project_path(path).ok_or_else(|| anyhow!("Project directory required"))?;
        let selected: Option<String> = self.conn.query_row("SELECT p.path FROM sessions s JOIN projects p ON p.id = s.project_id WHERE s.id = ?1", [session], |row| row.get(0)).optional()?;
        if selected
            .as_deref()
            .and_then(canonical_project_path)
            .as_deref()
            != Some(path.as_str())
        {
            return Err(anyhow!("Select the project before initialization"));
        }
        let root = Dir::open_ambient_dir(&path, ambient_authority())?;
        let (stack, start, verify) = if root.try_exists("package.json")? {
            ("Node", "pnpm dev", "pnpm test")
        } else if root.try_exists("Cargo.toml")? {
            ("Rust", "cargo run --locked", "cargo test --locked")
        } else if root.try_exists("pyproject.toml")? || root.try_exists("requirements.txt")? {
            (
                "Python",
                "throw 'Configure the project entry point in this script before starting.'",
                "& './.venv/Scripts/python.exe' -m pytest",
            )
        } else {
            (
                "Unknown",
                "throw 'No known project manifest detected. Configure the startup command.'",
                "throw 'No known project manifest detected. Configure the verification command.'",
            )
        };
        let script = |command: &str| {
            format!("$ErrorActionPreference = 'Stop'\nSet-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)\n{command}\nif ($LASTEXITCODE) {{ exit $LASTEXITCODE }}\n")
        };
        let definitions = [
            ("AGENTS.md", "conventions", "# Coding conventions\n\nPreserve existing behavior and user data. Use dedicated worktrees for concurrent code changes.\nRun relevant checks and report actual verification outcomes. Never commit secrets.\n".to_string()),
            (".agents/README.md", "skills", "# Engineering skills\n\nUse the installed grill-with-docs, to-spec, to-tickets, implement, diagnosing-bugs, code-review and retro skills in any order.\nManage installation and enablement explicitly in Settings > Agent > Skills.\nProject skill definitions take precedence over the bundled fallback.\n".to_string()),
            ("scripts/start.ps1", "startup", script(start)),
            ("scripts/verify.ps1", "verification", script(verify)),
        ];
        let files = definitions
            .into_iter()
            .map(|(name, item, after)| {
                Ok(FilePreview {
                    path: name.into(),
                    item: item.into(),
                    before: read_existing(&root, name)?,
                    after,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let preview = Preview {
            id: Uuid::new_v4().to_string(),
            version: 1,
            project_path: path,
            session_id: session.into(),
            description: description.into(),
            stack: stack.into(),
            files,
            outcomes: vec![],
            selected: vec![],
        };
        let value = serde_json::to_value(preview)?;
        self.kv_set(
            NS,
            value["id"]
                .as_str()
                .ok_or_else(|| anyhow!("Preview identity missing"))?,
            &value,
        )?;
        Ok(value)
    }
    pub fn apply_project_initialization(&self, id: &str, selected: &[String]) -> Result<Value> {
        let mut preview: Preview = serde_json::from_value(
            self.kv_get(NS, id)?
                .ok_or_else(|| anyhow!("Preview unavailable"))?,
        )?;
        if preview.version != 1
            || selected.len() > preview.files.len()
            || selected
                .iter()
                .any(|path| !preview.files.iter().any(|file| &file.path == path))
        {
            return Err(anyhow!("Invalid initialization selection"));
        }
        let root = Dir::open_ambient_dir(&preview.project_path, ambient_authority())?;
        self.require_idle_initialization_root(&preview.project_path)?;
        preview.selected = selected.to_vec();
        for file in &preview.files {
            if preview
                .outcomes
                .iter()
                .any(|outcome| outcome["path"] == file.path && outcome["status"] == "completed")
            {
                continue;
            }
            preview
                .outcomes
                .retain(|outcome| outcome["path"] != file.path);
            if !selected.contains(&file.path) {
                preview
                    .outcomes
                    .push(json!({ "path": file.path, "status": "kept" }));
                continue;
            }
            let mut backup_path = None;
            let mut write = || -> Result<()> {
                let current = read_existing(&root, &file.path)?;
                if current != file.before {
                    return Err(anyhow!(
                        "File changed since preview; refresh preview before modifying"
                    ));
                }
                let relative = Path::new(&file.path);
                if let Some(parent) = relative.parent() {
                    root.create_dir_all(parent)?;
                }
                let temporary = relative.with_file_name(format!(".pi-init-{}", Uuid::new_v4()));
                let mut options = cap_std::fs::OpenOptions::new();
                options.write(true).create_new(true);
                let mut replacement = || -> Result<()> {
                    let mut target = root.open_with(&temporary, &options)?;
                    target.write_all(file.after.as_bytes())?;
                    target.sync_all()?;
                    drop(target);
                    if read_existing(&root, &file.path)? != file.before {
                        return Err(anyhow!(
                            "File changed while preparing replacement; refresh preview"
                        ));
                    }
                    if file.before.is_none() {
                        root.hard_link(&temporary, &root, relative)?;
                    } else {
                        let backup = relative
                            .with_file_name(format!(".pi-init-original-{}", Uuid::new_v4()));
                        root.rename(relative, &root, &backup)?;
                        backup_path = Some(backup.to_string_lossy().into_owned());
                        // Publish without replacing a file created concurrently.
                        // The displaced original remains recoverable, including
                        // later writes through an editor's already-open handle.
                        let publication = if read_existing(
                            &root,
                            backup
                                .to_str()
                                .ok_or_else(|| anyhow!("Invalid backup path"))?,
                        )? != file.before
                        {
                            Err(anyhow!("File changed during publication; retained original must be reviewed"))
                        } else {
                            root.hard_link(&temporary, &root, relative)
                                .map_err(anyhow::Error::from)
                        };
                        if publication.is_err() && !root.try_exists(relative)? {
                            root.hard_link(&backup, &root, relative)?;
                        }
                        publication?;
                    }
                    Ok(())
                };
                let result = replacement();
                if root.try_exists(&temporary)? {
                    root.remove_file(&temporary)?;
                }
                result
            };
            let mut outcome = match write() {
                Ok(()) => json!({"path": file.path, "status": "completed"}),
                Err(error) => {
                    json!({"path": file.path, "status": "failed", "error": error.to_string()})
                }
            };
            if let Some(path) = backup_path {
                outcome["backupPath"] = json!(path);
            }
            preview.outcomes.push(outcome);
        }
        let value = serde_json::to_value(&preview)?;
        self.kv_set(NS, id, &value)?;
        self.record_initialization_result(
            &preview.session_id,
            &preview.project_path,
            id,
            &preview.description,
            &preview.outcomes,
        )?;
        Ok(value)
    }
    pub fn read_project_initialization(&self, id: &str) -> Result<Value> {
        let preview: Preview = serde_json::from_value(
            self.kv_get(NS, id)?
                .ok_or_else(|| anyhow!("Preview unavailable"))?,
        )?;
        if preview.version != 1 {
            return Err(anyhow!("Unsupported initialization preview"));
        }
        Ok(serde_json::to_value(preview)?)
    }
    pub fn create_initialization_directory(&self, parent: &str, name: &str) -> Result<Value> {
        let reserved = name.split('.').next().unwrap_or("").to_ascii_uppercase();
        if name.is_empty()
            || name.len() > 80
            || name.ends_with(['.', ' '])
            || name
                .chars()
                .any(|character| character.is_control() || "\\/:*?\"<>|".contains(character))
            || matches!(name, "." | "..")
            || matches!(reserved.as_str(), "CON" | "PRN" | "AUX" | "NUL")
            || (reserved.len() == 4
                && (reserved.starts_with("COM") || reserved.starts_with("LPT"))
                && reserved.as_bytes()[3].is_ascii_digit())
        {
            return Err(anyhow!("Invalid project directory name"));
        }
        let parent =
            canonical_project_path(parent).ok_or_else(|| anyhow!("Parent directory required"))?;
        let root = Dir::open_ambient_dir(&parent, ambient_authority())?;
        root.create_dir(name)?;
        Ok(json!({"projectPath": Path::new(&parent).join(name).to_string_lossy()}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn modifying_an_existing_file_retains_its_original_and_later_open_handle_edits() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir(&root).unwrap();
        let original = root.join("AGENTS.md");
        std::fs::write(&original, "User rules").unwrap();
        let mut editor = std::fs::OpenOptions::new()
            .write(true)
            .open(&original)
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
        let preview = db
            .preview_project_initialization(&session.id, root.to_str().unwrap(), "Setup")
            .unwrap();
        let result = db
            .apply_project_initialization(preview["id"].as_str().unwrap(), &["AGENTS.md".into()])
            .unwrap();
        let row = result["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["path"] == "AGENTS.md")
            .unwrap();
        assert_eq!(row["status"], "completed");
        let retained = root.join(row["backupPath"].as_str().unwrap());
        assert_eq!(std::fs::read_to_string(&retained).unwrap(), "User rules");
        editor.set_len(0).unwrap();
        editor.write_all(b"Later user edits").unwrap();
        editor.sync_all().unwrap();
        assert_eq!(
            std::fs::read_to_string(&retained).unwrap(),
            "Later user edits"
        );
        assert_eq!(
            std::fs::read_to_string(original).unwrap(),
            preview["files"][0]["after"].as_str().unwrap()
        );
    }
    #[test]
    fn creates_only_a_new_named_directory_and_restores_original_retry_selection() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("pi.sqlite")).unwrap();
        let created = db
            .create_initialization_directory(dir.path().to_str().unwrap(), "new-project")
            .unwrap();
        let path = created["projectPath"].as_str().unwrap();
        assert!(Path::new(path).is_dir());
        assert!(db
            .create_initialization_directory(dir.path().to_str().unwrap(), "new-project")
            .is_err());
        assert!(db
            .create_initialization_directory(dir.path().to_str().unwrap(), "../escape")
            .is_err());
        let session =
            crate::sessions::create_session(&db, None, None, None, None, Some(path.into()))
                .unwrap();
        let preview = db
            .preview_project_initialization(&session.id, path, "Setup")
            .unwrap();
        let id = preview["id"].as_str().unwrap();
        db.apply_project_initialization(id, &["AGENTS.md".into()])
            .unwrap();
        let restored = db.read_project_initialization(id).unwrap();
        assert_eq!(restored["selected"], json!(["AGENTS.md"]));
        assert!(restored["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["path"] == "AGENTS.md" && row["status"] == "completed"));
    }
    #[test]
    fn initialization_keeps_existing_files_and_rejects_changed_preview() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir(&root).unwrap();
        std::fs::write(root.join("AGENTS.md"), "User rules").unwrap();
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
        let preview = db
            .preview_project_initialization(&session.id, root.to_str().unwrap(), "A coding project")
            .unwrap();
        let id = preview["id"].as_str().unwrap();
        let result = db.apply_project_initialization(id, &[]).unwrap();
        assert!(result["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["status"] == "kept"));
        assert_eq!(
            std::fs::read_to_string(root.join("AGENTS.md")).unwrap(),
            "User rules"
        );
        std::fs::write(root.join("AGENTS.md"), "Later edits").unwrap();
        let result = db
            .apply_project_initialization(id, &["AGENTS.md".into()])
            .unwrap();
        assert_eq!(result["outcomes"][0]["status"], "failed");
        assert_eq!(
            std::fs::read_to_string(root.join("AGENTS.md")).unwrap(),
            "Later edits"
        );
    }
    #[test]
    fn partial_retry_preserves_completed_files_and_retains_attempt_history() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("project");
        std::fs::create_dir(&root).unwrap();
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
        let preview = db
            .preview_project_initialization(&session.id, root.to_str().unwrap(), "Setup")
            .unwrap();
        let id = preview["id"].as_str().unwrap();
        std::fs::create_dir(root.join("scripts")).unwrap();
        std::fs::create_dir(root.join("scripts/verify.ps1")).unwrap();
        let selected = vec!["AGENTS.md".into(), "scripts/verify.ps1".into()];
        let first = db.apply_project_initialization(id, &selected).unwrap();
        assert!(first["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["status"] == "failed"));
        std::fs::write(root.join("AGENTS.md"), "Later user edits").unwrap();
        std::fs::remove_dir(root.join("scripts/verify.ps1")).unwrap();
        let second = db.apply_project_initialization(id, &selected).unwrap();
        assert!(second["outcomes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["status"] != "failed"));
        assert_eq!(
            std::fs::read_to_string(root.join("AGENTS.md")).unwrap(),
            "Later user edits"
        );
        assert_eq!(
            db.list_free_tasks(root.to_str().unwrap()).unwrap()["tasks"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
    }
}
