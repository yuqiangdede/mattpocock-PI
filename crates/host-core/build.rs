use std::{env, fs, io, path::Path};

fn files(root: &Path, directory: &Path, output: &mut String) -> io::Result<()> {
    println!("cargo:rerun-if-changed={}", directory.display());
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_dir() {
            files(root, &path, output)?;
        } else if kind.is_file() {
            let relative = path.strip_prefix(root).map_err(io::Error::other)?;
            let relative = relative.to_string_lossy().replace('\\', "/");
            output.push_str(&format!(
                "BundleFile {{ path: {relative:?}.into(), content: include_str!({:?}).into() }},\n",
                path.to_string_lossy()
            ));
        } else {
            return Err(io::Error::other(
                "Matt skills must contain only regular files and directories",
            ));
        }
    }
    Ok(())
}

fn main() -> io::Result<()> {
    let root = Path::new(&env::var("CARGO_MANIFEST_DIR").map_err(io::Error::other)?)
        .join("../../apps/desktop/resources/skills/matt")
        .canonicalize()?;
    println!("cargo:rerun-if-changed={}", root.display());
    let revision = fs::read_to_string(root.join("REVISION"))?;
    let mut output = format!("fn shipped_bundle() -> SkillBundle {{ SkillBundle {{ revision: {:?}.into(), packages: vec![\n", revision.trim());
    let mut entries = fs::read_dir(&root)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            return Err(io::Error::other("Matt skill links are not supported"));
        }
        if !kind.is_dir() {
            continue;
        }
        if !entry.path().join("SKILL.md").is_file() {
            return Err(io::Error::other("Matt skill directory is missing SKILL.md"));
        }
        output.push_str(&format!(
            "BundlePackage {{ id: {:?}.into(), files: vec![\n",
            entry.file_name().to_string_lossy()
        ));
        files(&entry.path(), &entry.path(), &mut output)?;
        output.push_str("] },\n");
    }
    output.push_str("] } }\n");
    fs::write(
        Path::new(&env::var("OUT_DIR").map_err(io::Error::other)?).join("matt-skills.rs"),
        output,
    )
}
