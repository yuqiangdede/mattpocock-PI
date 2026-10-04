use super::*;

#[test]
fn update_backup_restore_and_upstream_removal_preserve_user_changes() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("profile")).unwrap();
    let mut registry = UserSkillRegistry::new(&root.path().join("profile"));
    registry.ensure_bundled().unwrap();
    let before = registry.bundle_state().unwrap();
    let mut bundle: SkillBundle = serde_json::from_str(SHIPPED).unwrap();
    bundle.revision = "b".repeat(40);
    let removed = bundle.packages.pop().unwrap().id;
    let changed = bundle.packages[0].id.clone();
    bundle.packages[0]
        .files
        .iter_mut()
        .find(|f| f.path == "SKILL.md")
        .unwrap()
        .content
        .push_str("\nUpdated fixture.");
    let result = registry.update_bundled(bundle).unwrap();
    assert!(result.removed.contains(&removed));
    assert!(registry.bundled_has_backup().unwrap());
    let current = registry.bundle_state().unwrap();
    assert!(!current.packages.contains_key(&removed));
    let path = package_destination(
        &registry.bundled_root,
        &current.packages[&changed].directory,
    )
    .unwrap()
    .join("SKILL.md");
    let edited = format!(
        "{}\nUser edit after updating.",
        fs::read_to_string(&path).unwrap()
    );
    fs::write(&path, &edited).unwrap();
    let restored = registry.restore_bundled().unwrap();
    assert!(restored.preserved.contains(&changed));
    assert_eq!(registry.bundled_revision().unwrap(), before.revision);
    assert!(registry
        .bundle_state()
        .unwrap()
        .packages
        .contains_key(&removed));
    assert_eq!(fs::read_to_string(path).unwrap(), edited);
    assert!(!registry.bundled_has_backup().unwrap());
}

#[test]
fn invalid_update_keeps_active_state_and_existing_backup() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir(root.path().join("profile")).unwrap();
    let mut registry = UserSkillRegistry::new(&root.path().join("profile"));
    registry.ensure_bundled().unwrap();
    let mut bundle: SkillBundle = serde_json::from_str(SHIPPED).unwrap();
    bundle.revision = "b".repeat(40);
    registry.update_bundled(bundle.clone()).unwrap();
    let state = fs::read(registry.bundled_root.join("state.json")).unwrap();
    bundle.packages[0].files[0].path = "../escape".into();
    assert!(registry.update_bundled(bundle).is_err());
    assert_eq!(
        fs::read(registry.bundled_root.join("state.json")).unwrap(),
        state
    );
    assert!(registry.bundled_has_backup().unwrap());
}

#[test]
fn bundled_revision_reads_actual_manifest_without_installing() {
    let root = tempfile::tempdir().unwrap();
    let profile = root.path().join("profile");
    let registry = UserSkillRegistry::new(&profile);
    assert_eq!(registry.bundled_revision().unwrap(), "");
    assert!(!profile.exists());

    let bundle_root = profile.join("engineering-skills");
    fs::create_dir_all(&bundle_root).unwrap();
    let manifest = bundle_root.join("state.json");
    let bytes = br#"{"schemaVersion":1,"revision":"actual-installed-revision","packages":{}}"#;
    fs::write(&manifest, bytes).unwrap();
    assert_eq!(
        registry.bundled_revision().unwrap(),
        "actual-installed-revision"
    );
    assert_eq!(fs::read(&manifest).unwrap(), bytes);
    assert!(!bundle_root.join("releases").exists());

    fs::write(&manifest, b"invalid manifest").unwrap();
    assert!(registry.bundled_revision().is_err());
    assert_eq!(fs::read(&manifest).unwrap(), b"invalid manifest");
}

fn directory_link(target: &Path, link: &Path) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let output = std::process::Command::new("powershell.exe").args(["-NoProfile", "-NonInteractive", "-Command", "New-Item -ItemType Junction -Path $env:PI_BUNDLE_LINK -Target $env:PI_BUNDLE_TARGET | Out-Null"])
            .env("PI_BUNDLE_LINK",link).env("PI_BUNDLE_TARGET",target).creation_flags(0x08000000).output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(target, link).unwrap();
    }
}
fn unlink_directory(link: &Path) {
    #[cfg(windows)]
    {
        fs::remove_dir(link).unwrap();
    }
    #[cfg(unix)]
    {
        fs::remove_file(link).unwrap();
    }
}

#[test]
fn dangling_release_links_are_rejected_without_writing_outside_the_profile() {
    let root = tempfile::tempdir().unwrap();
    let profile = root.path().join("profile");
    let outside = root.path().join("outside");
    fs::create_dir_all(profile.join("engineering-skills")).unwrap();
    fs::create_dir(&outside).unwrap();
    let link = profile.join("engineering-skills/releases");
    directory_link(&outside, &link);
    fs::remove_dir(&outside).unwrap();
    let mut registry = UserSkillRegistry::new(&profile);
    assert!(registry
        .ensure_bundled()
        .unwrap_err()
        .to_string()
        .contains("SKILL_INVALID"));
    assert!(!outside.exists());
    assert!(!profile.join("engineering-skills/state.json").exists());
    unlink_directory(&link);
}

#[test]
fn captured_directory_writes_remain_confined_after_a_new_link_is_inserted() {
    let root = tempfile::tempdir().unwrap();
    let profile = root.path().join("profile");
    fs::create_dir(&profile).unwrap();
    let registry = UserSkillRegistry::new(&profile);
    let directory = registry.open_bundle_dir(true).unwrap().unwrap();
    write_new(&directory, "inside.md", b"owned content").unwrap();
    assert_eq!(
        fs::read(profile.join("engineering-skills/inside.md")).unwrap(),
        b"owned content"
    );
    let outside = root.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("sentinel"), "untouched").unwrap();
    let link = profile.join("engineering-skills/new-link");
    directory_link(&outside, &link);
    assert!(write_new(&directory, "new-link/escape.md", b"must not escape").is_err());
    assert!(!outside.join("escape.md").exists());
    assert_eq!(
        fs::read_to_string(outside.join("sentinel")).unwrap(),
        "untouched"
    );
    unlink_directory(&link);
}

#[test]
fn legacy_manifest_reads_without_reset_and_future_schema_is_preserved_on_rejection() {
    let root = tempfile::tempdir().unwrap();
    let mut registry = UserSkillRegistry::new(root.path());
    registry.ensure_bundled().unwrap();
    let path = root.path().join("engineering-skills/state.json");
    let mut value: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    value.as_object_mut().unwrap().remove("schemaVersion");
    fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
    assert!(registry.ensure_bundled().unwrap().updated.is_empty());
    value["schemaVersion"] = serde_json::json!(99);
    let bytes = serde_json::to_vec(&value).unwrap();
    fs::write(&path, &bytes).unwrap();
    assert!(registry
        .ensure_bundled()
        .unwrap_err()
        .to_string()
        .contains("incompatible"));
    assert_eq!(fs::read(&path).unwrap(), bytes);
}
#[test]
fn shipped_bundle_is_complete_and_restarts_preserve_disable_edit_and_delete() {
    let dir = tempfile::tempdir().unwrap();
    crate::agent_capabilities::test_support::with_global_agents(&dir.path().join("agents"), || {
        let mut registry = UserSkillRegistry::new(dir.path());
        let first = registry.ensure_bundled().unwrap();
        assert_eq!(first.updated.len(), 37);
        let records = registry.list(CapabilityLevel::Global, None).unwrap();
        for id in [
            "grill-with-docs",
            "to-spec",
            "to-tickets",
            "implement",
            "code-review",
            "retro",
            "tdd",
            "grilling",
        ] {
            let record = records.iter().find(|item| item.id == id).unwrap();
            assert!(record.enabled);
            assert!(!registry
                .read(id, Some(CapabilityLevel::Global), None)
                .unwrap()
                .unwrap()
                .1
                .is_empty());
        }
        assert!(registry
            .package_files("tdd", CapabilityLevel::Global, None)
            .unwrap()
            .iter()
            .any(|(path, _)| path == "mocking.md"));
        registry
            .set_enabled("retro", false, Some(CapabilityLevel::Global), None)
            .unwrap();
        let selected = records.iter().find(|item| item.id == "grilling").unwrap();
        let original = fs::read_to_string(&selected.path).unwrap();
        fs::write(&selected.path, format!("{original}\nUser notes.")).unwrap();
        registry
            .remove("teach", Some(CapabilityLevel::Global), None)
            .unwrap();
        let mut restarted = UserSkillRegistry::new(dir.path());
        assert!(restarted.ensure_bundled().unwrap().updated.is_empty());
        let updated = restarted
            .update_bundled(serde_json::from_str(SHIPPED).unwrap())
            .unwrap();
        assert!(updated.preserved.contains(&"grilling".into()));
        assert!(updated.preserved.contains(&"teach".into()));
        assert!(
            !restarted
                .list(CapabilityLevel::Global, None)
                .unwrap()
                .iter()
                .find(|item| item.id == "retro")
                .unwrap()
                .enabled
        );
        assert!(fs::read_to_string(&selected.path)
            .unwrap()
            .ends_with("User notes."));
    });
}

#[test]
fn invalid_bundle_is_rejected_before_installation() {
    let dir = tempfile::tempdir().unwrap();
    let mut registry = UserSkillRegistry::new(dir.path());
    let mut bundle: SkillBundle = serde_json::from_str(SHIPPED).unwrap();
    bundle.packages[0].files.push(BundleFile {
        path: "../escape".into(),
        content: "unsafe".into(),
    });
    assert!(registry.update_bundled(bundle).is_err());
    assert!(!dir.path().join("engineering-skills").exists());
}

#[test]
fn updates_resources_preserves_user_overrides_and_detects_new_nested_documents() {
    let dir = tempfile::tempdir().unwrap();
    crate::agent_capabilities::test_support::with_global_agents(&dir.path().join("agents"), || {
        let mut registry = UserSkillRegistry::new(dir.path());
        registry.ensure_bundled().unwrap();
        let custom = registry
            .create(UserSkillInput {
                id: Some("retro".into()),
                name: Some("retro".into()),
                body: Some("Personal retro.".into()),
                ..Default::default()
            })
            .unwrap();
        assert_eq!(
            registry
                .read("retro", Some(CapabilityLevel::Global), None)
                .unwrap()
                .unwrap()
                .1
                .trim(),
            "Personal retro."
        );
        let existing = registry.list(CapabilityLevel::Global, None).unwrap();
        let tdd = existing.iter().find(|record| record.id == "tdd").unwrap();
        let prior = PathBuf::from(&tdd.path);
        let grilling = existing
            .iter()
            .find(|record| record.id == "grilling")
            .unwrap();
        let nested = Path::new(&grilling.path).parent().unwrap().join("custom");
        fs::create_dir(&nested).unwrap();
        fs::write(nested.join("SKILL.md"), "User companion.").unwrap();
        let mut bundle: SkillBundle = serde_json::from_str(SHIPPED).unwrap();
        bundle.revision = "fixture-new".into();
        bundle
            .packages
            .iter_mut()
            .find(|package| package.id == "tdd")
            .unwrap()
            .files
            .push(BundleFile {
                path: "new-reference.md".into(),
                content: "Updated reference.".into(),
            });
        let result = registry.update_bundled(bundle).unwrap();
        assert!(result.updated.contains(&"tdd".into()));
        assert!(result.preserved.contains(&"grilling".into()));
        let current = registry.list(CapabilityLevel::Global, None).unwrap();
        let new_path = Path::new(
            &current
                .iter()
                .find(|record| record.id == "tdd")
                .unwrap()
                .path,
        );
        assert_ne!(new_path, prior);
        assert!(prior.is_file());
        assert_eq!(
            fs::read_to_string(new_path.parent().unwrap().join("new-reference.md")).unwrap(),
            "Updated reference."
        );
        assert!(fs::read_to_string(custom.path)
            .unwrap()
            .contains("Personal retro."));
    });
}

#[test]
fn a_bundled_package_can_move_to_a_project_without_losing_resources_or_activation() {
    let dir = tempfile::tempdir().unwrap();
    crate::agent_capabilities::test_support::with_global_agents(&dir.path().join("agents"), || {
        let mut registry = UserSkillRegistry::new(dir.path());
        registry.ensure_bundled().unwrap();
        registry
            .set_enabled("tdd", false, Some(CapabilityLevel::Global), None)
            .unwrap();
        let project = dir.path().join("project");
        fs::create_dir(&project).unwrap();
        let moved = registry
            .transfer(
                "tdd",
                &CapabilityTarget {
                    level: CapabilityLevel::Global,
                    project_path: None,
                },
                &CapabilityTarget {
                    level: CapabilityLevel::Project,
                    project_path: Some(project.to_string_lossy().into_owned()),
                },
            )
            .unwrap();
        assert!(!moved.enabled);
        assert!(Path::new(&moved.path)
            .parent()
            .unwrap()
            .join("mocking.md")
            .is_file());
        assert!(registry.ensure_bundled().unwrap().updated.is_empty());
        assert!(!registry
            .list(CapabilityLevel::Global, None)
            .unwrap()
            .iter()
            .any(|record| record.id == "tdd"));
    });
}

#[test]
fn bundled_fallback_does_not_consume_user_skill_capacity() {
    let dir = tempfile::tempdir().unwrap();
    crate::agent_capabilities::test_support::with_global_agents(&dir.path().join("agents"), || {
        let mut registry = UserSkillRegistry::new(dir.path());
        let owned = crate::agent_capabilities::global_agents_dir().join("skills");
        fs::create_dir_all(&owned).unwrap();
        for index in 0..100 {
            fs::write(
                owned.join(format!("user-{index}.md")),
                format!("---\nname: user-{index}\n---\n\nUser skill.\n"),
            )
            .unwrap();
        }
        registry.ensure_bundled().unwrap();
        registry
            .create(UserSkillInput {
                name: Some("additional-user".into()),
                body: Some("New user skill.".into()),
                ..Default::default()
            })
            .unwrap();
        let records = registry.list(CapabilityLevel::Global, None).unwrap();
        assert_eq!(
            records
                .iter()
                .filter(|record| record.source != "bundled")
                .count(),
            101
        );
        assert_eq!(
            records
                .iter()
                .filter(|record| record.source == "bundled")
                .count(),
            37
        );
    });
}

#[test]
fn moving_a_bundled_package_handles_a_project_name_collision_without_overwriting_it() {
    let root = tempfile::tempdir().unwrap();
    crate::agent_capabilities::test_support::with_global_agents(
        &root.path().join("agents"),
        || {
            let project = root.path().join("project");
            fs::create_dir(&project).unwrap();
            let mut registry = UserSkillRegistry::new(root.path());
            registry.ensure_bundled().unwrap();
            registry
                .create(UserSkillInput {
                    name: Some("tdd".into()),
                    body: Some("Project override.".into()),
                    level: Some("project".into()),
                    project_path: Some(project.to_string_lossy().into_owned()),
                    ..Default::default()
                })
                .unwrap();
            let moved = registry
                .transfer(
                    "tdd",
                    &CapabilityTarget {
                        level: CapabilityLevel::Global,
                        project_path: None,
                    },
                    &CapabilityTarget {
                        level: CapabilityLevel::Project,
                        project_path: Some(project.to_string_lossy().into_owned()),
                    },
                )
                .unwrap();
            assert_ne!(moved.id, "tdd");
            assert!(Path::new(&moved.path)
                .parent()
                .unwrap()
                .join("mocking.md")
                .is_file());
            assert_eq!(
                registry
                    .read("tdd", Some(CapabilityLevel::Project), project.to_str())
                    .unwrap()
                    .unwrap()
                    .1
                    .trim(),
                "Project override."
            );
        },
    );
}
