use super::*;
use cap_std::fs::{Dir, OpenOptions};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};

const SHIPPED: &str = include_str!("../../resources/workflow-skills.json");
const MAX_BUNDLE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BundleFile {
    pub path: String,
    pub content: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BundlePackage {
    pub id: String,
    pub files: Vec<BundleFile>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SkillBundle {
    pub revision: String,
    pub packages: Vec<BundlePackage>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Installed {
    directory: String,
    digest: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BundleState {
    #[serde(default = "bundle_schema_version")]
    schema_version: u32,
    revision: String,
    packages: BTreeMap<String, Installed>,
}
fn bundle_schema_version() -> u32 {
    1
}
impl Default for BundleState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            revision: String::new(),
            packages: BTreeMap::new(),
        }
    }
}
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleResult {
    pub revision: String,
    pub updated: Vec<String>,
    pub preserved: Vec<String>,
}

fn digest(files: &[(String, Vec<u8>)]) -> String {
    let mut hash = Sha256::new();
    for (path, bytes) in files {
        hash.update((path.len() as u64).to_le_bytes());
        hash.update(path.as_bytes());
        hash.update((bytes.len() as u64).to_le_bytes());
        hash.update(bytes);
    }
    hash.finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn validate(bundle: &SkillBundle) -> Result<()> {
    if bundle.revision.is_empty()
        || bundle.revision.len() > 128
        || bundle.packages.is_empty()
        || bundle.packages.len() > MAX_SKILLS
    {
        bail!("SKILL_INVALID: invalid engineering skill bundle");
    }
    let mut ids = HashSet::new();
    let mut total = 0usize;
    for package in &bundle.packages {
        if !valid_id(&package.id)
            || !ids.insert(&package.id)
            || package.files.len() > MAX_SKILL_PACKAGE_FILES
        {
            bail!("SKILL_INVALID: invalid or duplicate bundle skill");
        }
        let mut paths = HashSet::new();
        for file in &package.files {
            bundle_file_path(Path::new("bundle"), &file.path)?;
            if file.path.contains(':')
                || file.path.chars().any(char::is_control)
                || !paths.insert(file.path.to_lowercase())
                || file.content.len() > MAX_SKILL_RESOURCE_BYTES
            {
                bail!("SKILL_INVALID: invalid bundle resource");
            }
            total = total.saturating_add(file.content.len());
        }
        let document = package
            .files
            .iter()
            .find(|file| file.path == "SKILL.md")
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle SKILL.md is missing"))?;
        let (front, body) = parse_front_matter(&document.content);
        if document.content.len() > MAX_SKILL_BYTES
            || body.trim().is_empty()
            || front.get("name") != Some(&package.id)
        {
            bail!("SKILL_INVALID: invalid bundle skill document");
        }
    }
    if total > MAX_BUNDLE_BYTES {
        bail!("SKILL_LIMIT_EXCEEDED: engineering bundle too large");
    }
    Ok(())
}

fn bundle_file_path(root: &Path, relative: &str) -> Result<PathBuf> {
    if relative == "SKILL.md" {
        Ok(root.join(relative))
    } else {
        package_destination(root, relative)
    }
}

fn files_digest(bundle: &Dir, relative: &str) -> Result<Option<String>> {
    let root = match bundle.open_dir(relative) {
        Ok(root) => root,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let metadata = match root.symlink_metadata("SKILL.md") {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    if metadata.file_type().is_symlink() {
        bail!("SKILL_INVALID: installed document is a symbolic link");
    }
    let size = metadata.len();
    if size > MAX_SKILL_BYTES as u64 {
        return Ok(None);
    }
    let mut files = Vec::new();
    let mut total = 0;
    collect_installed_files(&root, Path::new(""), &mut files, &mut total)?;
    files.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(Some(digest(&files)))
}

fn collect_installed_files(
    directory: &Dir,
    prefix: &Path,
    files: &mut Vec<(String, Vec<u8>)>,
    total: &mut usize,
) -> Result<()> {
    for entry in directory.entries()? {
        let name = entry?.file_name();
        let path = prefix.join(&name);
        let metadata = directory.symlink_metadata(&name)?;
        if metadata.file_type().is_symlink() {
            bail!("SKILL_INVALID: installed bundle contains a symbolic link");
        }
        if metadata.is_dir() {
            collect_installed_files(&directory.open_dir(&name)?, &path, files, total)?;
            continue;
        }
        if !metadata.is_file() || metadata.len() > MAX_SKILL_RESOURCE_BYTES as u64 {
            bail!("SKILL_LIMIT_EXCEEDED: invalid installed bundle resource");
        }
        let relative = package_relative_path(Path::new("bundle"), &Path::new("bundle").join(path))?;
        let bytes = read_bounded(directory, &name, MAX_SKILL_RESOURCE_BYTES)?;
        *total = total.saturating_add(bytes.len());
        files.push((relative, bytes));
        if files.len() > MAX_SKILL_PACKAGE_FILES || *total > MAX_SKILL_PACKAGE_BYTES {
            bail!("SKILL_LIMIT_EXCEEDED: installed bundle too large");
        }
    }
    Ok(())
}

fn read_bounded(directory: &Dir, path: impl AsRef<Path>, limit: usize) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    directory
        .open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        bail!("SKILL_LIMIT_EXCEEDED: bundle file too large");
    }
    Ok(bytes)
}

fn write_new(directory: &Dir, path: impl AsRef<Path>, bytes: &[u8]) -> Result<()> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    let mut file = directory.open_with(path, &options)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn state_from(directory: &Dir) -> Result<BundleState> {
    match directory.symlink_metadata("state.json") {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            bail!("SKILL_INVALID: bundle state is not a regular file")
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(BundleState::default())
        }
        Err(error) => return Err(error.into()),
    }
    match read_bounded(directory, "state.json", MAX_BUNDLE_BYTES) {
        Ok(bytes) => {
            let state: BundleState = serde_json::from_slice(&bytes)?;
            if state.schema_version != 1 {
                bail!("SKILL_INVALID: incompatible bundle manifest version");
            }
            Ok(state)
        }
        Err(error)
            if error
                .downcast_ref::<std::io::Error>()
                .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound) =>
        {
            Ok(BundleState::default())
        }
        Err(error) => Err(error),
    }
}

impl UserSkillRegistry {
    pub(super) fn move_bundled_package(
        &self,
        source: &Path,
        target: &Path,
        replacement: Option<&str>,
    ) -> Result<()> {
        let bundle = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        let relative = self.bundled_relative(source)?;
        let target_parent = target
            .parent()
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: move target parent missing"))?;
        let target_name = target
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: move target name missing"))?;
        Dir::create_ambient_dir_all(target_parent, cap_std::ambient_authority())?;
        let destination = Dir::open_ambient_dir(target_parent, cap_std::ambient_authority())?;
        match destination.symlink_metadata(target_name) {
            Ok(_) => bail!("SKILL_INVALID: move target already exists"),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        if replacement.is_none() {
            match bundle.rename(&relative, &destination, target_name) {
                Ok(()) => return Ok(()),
                Err(error) if error.kind() == std::io::ErrorKind::CrossesDevices => {}
                Err(error) => return Err(error.into()),
            }
        }
        let source_directory = bundle.open_dir(&relative)?;
        let mut files = Vec::new();
        let mut total = 0;
        collect_installed_files(&source_directory, Path::new(""), &mut files, &mut total)?;
        drop(source_directory);
        files.sort_by(|a, b| a.0.cmp(&b.0));
        let before = digest(&files);
        destination.create_dir(target_name)?;
        let target_directory = destination.open_dir(target_name)?;
        for (path, bytes) in &files {
            let path = Path::new(path);
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() {
                    target_directory.create_dir_all(parent)?;
                }
            }
            let bytes = if path == Path::new("SKILL.md") {
                replacement.map(str::as_bytes).unwrap_or(bytes)
            } else {
                bytes
            };
            write_new(&target_directory, path, bytes)?;
        }
        if files_digest(
            &bundle,
            relative
                .to_str()
                .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: package path encoding"))?,
        )?
        .as_deref()
            != Some(&before)
        {
            bail!("SKILL_INVALID: source changed during move; source retained");
        }
        bundle.remove_dir_all(relative)?;
        Ok(())
    }

    fn bundled_relative(&self, path: &Path) -> Result<PathBuf> {
        ensure_no_symlink_path(&self.bundled_root, path)?;
        Ok(path.strip_prefix(&self.bundled_root)?.to_path_buf())
    }

    pub(super) fn read_bundled_document(&self, path: &Path) -> Result<String> {
        let directory = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        let bytes = read_bounded(&directory, self.bundled_relative(path)?, MAX_SKILL_BYTES)?;
        Ok(String::from_utf8(bytes)?)
    }

    pub(super) fn write_bundled_document(&self, path: &Path, content: &[u8]) -> Result<()> {
        let directory = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        let relative = self.bundled_relative(path)?;
        let parent = relative
            .parent()
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle document parent missing"))?;
        let package = directory.open_dir(parent)?;
        let temporary = format!("document-{}.tmp", Uuid::new_v4());
        write_new(&package, &temporary, content)?;
        package.rename(&temporary, &package, "SKILL.md")?;
        Ok(())
    }

    pub(super) fn remove_bundled_document(&self, path: &Path) -> Result<()> {
        let directory = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        directory.remove_file(self.bundled_relative(path)?)?;
        Ok(())
    }

    pub(super) fn bundled_package_files(&self, path: &Path) -> Result<Vec<(String, Vec<u8>)>> {
        let directory = self
            .open_bundle_dir(false)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle missing"))?;
        let relative = self.bundled_relative(path)?;
        let package = directory.open_dir(
            relative
                .parent()
                .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle parent missing"))?,
        )?;
        let mut files = Vec::new();
        let mut total = 0;
        collect_installed_files(&package, Path::new(""), &mut files, &mut total)?;
        files.retain(|(path, _)| {
            !Path::new(path)
                .file_name()
                .is_some_and(|name| name.eq_ignore_ascii_case("SKILL.md"))
        });
        files.sort_by(|a, b| a.0.cmp(&b.0));
        Ok(files)
    }

    fn bundle_state(&self) -> Result<BundleState> {
        match self.open_bundle_dir(false)? {
            Some(directory) => state_from(&directory),
            None => Ok(BundleState::default()),
        }
    }

    fn open_bundle_dir(&self, create: bool) -> Result<Option<Dir>> {
        if fs::symlink_metadata(&self.bundled_root)
            .is_ok_and(|metadata| metadata.file_type().is_symlink())
        {
            bail!("SKILL_INVALID: bundle root cannot be a symbolic link");
        }
        let profile_path = self
            .bundled_root
            .parent()
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle profile root missing"))?;
        let profile = match Dir::open_ambient_dir(profile_path, cap_std::ambient_authority()) {
            Ok(profile) => profile,
            Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None)
            }
            Err(error) => return Err(error.into()),
        };
        if create {
            profile.create_dir_all("engineering-skills")?;
        }
        let directory = match profile.open_dir("engineering-skills") {
            Ok(directory) => directory,
            Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(None)
            }
            Err(error) => return Err(error.into()),
        };
        if profile
            .symlink_metadata("engineering-skills")?
            .file_type()
            .is_symlink()
        {
            bail!("SKILL_INVALID: bundle root is a symbolic link");
        }
        Ok(Some(directory))
    }

    pub(super) fn bundled_paths(&self) -> Result<Vec<PathBuf>> {
        let state = self.bundle_state()?;
        state
            .packages
            .values()
            .map(|installed| {
                let directory = package_destination(&self.bundled_root, &installed.directory)?;
                let path = directory.join("SKILL.md");
                ensure_no_symlink_path(&self.bundled_root, &path)?;
                Ok(path)
            })
            .collect()
    }

    pub fn ensure_bundled(&mut self) -> Result<BundleResult> {
        let state = self.bundle_state()?;
        if !state.revision.is_empty() {
            return Ok(BundleResult {
                revision: state.revision,
                ..Default::default()
            });
        }
        self.update_bundled(serde_json::from_str(
            SHIPPED.trim_start_matches('\u{feff}'),
        )?)
    }

    pub fn update_bundled(&mut self, bundle: SkillBundle) -> Result<BundleResult> {
        validate(&bundle)?;
        let directory = self
            .open_bundle_dir(true)?
            .ok_or_else(|| anyhow::anyhow!("SKILL_INVALID: bundle directory missing"))?;
        let mut state = state_from(&directory)?;
        let mut result = BundleResult {
            revision: bundle.revision.clone(),
            ..Default::default()
        };
        // Each replacement is written to a new directory. The old package is
        // never overwritten, including edits made by an external editor.
        for package in bundle.packages {
            if let Some(previous) = state.packages.get(&package.id) {
                let previous_path = package_destination(&self.bundled_root, &previous.directory)?;
                ensure_no_symlink_path(&self.bundled_root, &previous_path)?;
                if files_digest(&directory, &previous.directory)?.as_deref()
                    != Some(&previous.digest)
                {
                    result.preserved.push(package.id);
                    continue;
                }
            }
            let mut files: Vec<_> = package
                .files
                .iter()
                .map(|file| (file.path.clone(), file.content.as_bytes().to_vec()))
                .collect();
            files.sort_by(|a, b| a.0.cmp(&b.0));
            let hash = digest(&files);
            if state
                .packages
                .get(&package.id)
                .is_some_and(|previous| previous.digest == hash)
            {
                continue;
            }
            let release = format!("releases/{}", Uuid::new_v4());
            let relative = format!("{release}/{}", package.id);
            let package_path = package_destination(&self.bundled_root, &relative)?;
            ensure_no_symlink_path(&self.bundled_root, &package_path)?;
            directory.create_dir_all("releases")?;
            directory.create_dir(&release)?;
            directory.create_dir(&relative)?;
            let package_directory = directory.open_dir(&relative)?;
            for file in package.files {
                let path = PathBuf::from(&file.path);
                if let Some(parent) = path.parent() {
                    if !parent.as_os_str().is_empty() {
                        package_directory.create_dir_all(parent)?;
                    }
                }
                write_new(&package_directory, path, file.content.as_bytes())?;
            }
            state.packages.insert(
                package.id.clone(),
                Installed {
                    directory: relative,
                    digest: hash,
                },
            );
            result.updated.push(package.id);
        }
        state.revision = bundle.revision;
        let temporary = format!("state-{}.tmp", Uuid::new_v4());
        write_new(&directory, &temporary, &serde_json::to_vec(&state)?)?;
        directory.rename(&temporary, &directory, "state.json")?;
        Ok(result)
    }
}

#[cfg(test)]
mod tests;
