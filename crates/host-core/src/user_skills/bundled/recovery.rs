use super::*;

impl UserSkillRegistry {
    // Snapshot complete package contents before changing the active manifest.
    // Immutable retained releases alone cannot capture local edits at backup time.
    pub(super) fn snapshot_bundle(
        &self,
        directory: &Dir,
        state: &BundleState,
    ) -> Result<Option<String>> {
        if state.revision.is_empty() {
            return Ok(None);
        }
        let mut snapshot = state.clone();
        snapshot.backup = None;
        let mut missing = Vec::new();
        for (id, installed) in &mut snapshot.packages {
            let destination = package_destination(&self.bundled_root, &installed.directory)?;
            ensure_no_symlink_path(&self.bundled_root, &destination)?;
            if files_digest(directory, &installed.directory)?.is_none() {
                missing.push(id.clone());
                continue; // A local removal remains a removal after restore.
            }
            let mut files = Vec::new();
            let mut total = 0;
            collect_installed_files(
                &directory.open_dir(&installed.directory)?,
                Path::new(""),
                &mut files,
                &mut total,
            )?;
            files.sort_by(|a, b| a.0.cmp(&b.0));
            let release = format!("releases/{}", Uuid::new_v4());
            let relative = format!("{release}/{id}");
            directory.create_dir_all("releases")?;
            directory.create_dir(&release)?;
            directory.create_dir(&relative)?;
            let package = directory.open_dir(&relative)?;
            for (path, bytes) in &files {
                let path = Path::new(path);
                if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
                    package.create_dir_all(parent)?;
                }
                write_new(&package, path, bytes)?;
            }
            // Abort if an external editor changed the package during copying.
            if files_digest(directory, &installed.directory)?.as_deref() != Some(&digest(&files)) {
                bail!("SKILL_INVALID: skill changed during backup");
            }
            // Keep the baseline digest: a restored local edit remains protected.
            installed.directory = relative;
        }
        for id in missing {
            snapshot.packages.remove(&id);
        }
        let name = format!("backup-{}.json", Uuid::new_v4());
        write_new(directory, &name, &serde_json::to_vec(&snapshot)?)?;
        Ok(Some(name))
    }

    pub fn restore_bundled(&mut self) -> Result<BundleResult> {
        let directory = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        let current = state_from(&directory)?;
        let name = current
            .backup
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: no skill backup"))?;
        let uuid = name
            .strip_prefix("backup-")
            .and_then(|s| s.strip_suffix(".json"))
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: invalid backup path"))?;
        if Uuid::parse_str(uuid).is_err() || name.contains(['/', '\\']) {
            bail!("SKILL_INVALID: invalid backup path");
        }
        if !directory.symlink_metadata(name)?.is_file()
            || directory.symlink_metadata(name)?.file_type().is_symlink()
        {
            bail!("SKILL_INVALID: backup is not a regular file");
        }
        let mut restored: BundleState =
            serde_json::from_slice(&read_bounded(&directory, name, MAX_BUNDLE_BYTES)?)?;
        if !matches!(restored.schema_version, 1 | 2) || restored.backup.is_some() {
            bail!("SKILL_INVALID: incompatible backup");
        }
        let mut result = BundleResult {
            revision: restored.revision.clone(),
            ..Default::default()
        };
        for (id, installed) in &current.packages {
            let path = package_destination(&self.bundled_root, &installed.directory)?;
            ensure_no_symlink_path(&self.bundled_root, &path)?;
            if files_digest(&directory, &installed.directory)?.as_deref() != Some(&installed.digest)
            {
                restored.packages.insert(id.clone(), installed.clone());
                result.preserved.push(id.clone());
            } else if !restored.packages.contains_key(id) {
                result.removed.push(id.clone());
            }
        }
        for (id, installed) in &restored.packages {
            let path = package_destination(&self.bundled_root, &installed.directory)?;
            ensure_no_symlink_path(&self.bundled_root, &path)?;
            // Also validates resources and rejects symlinks before activation.
            if files_digest(&directory, &installed.directory)?.is_none()
                && !result.preserved.contains(id)
            {
                bail!("SKILL_INVALID: backup package missing");
            }
            if !result.preserved.contains(id) {
                result.updated.push(id.clone());
            }
        }
        restored.schema_version = 2;
        restored.backup = None;
        let temporary = format!("state-{}.tmp", Uuid::new_v4());
        write_new(&directory, &temporary, &serde_json::to_vec(&restored)?)?;
        directory.rename(&temporary, &directory, "state.json")?;
        Ok(result)
    }
}
