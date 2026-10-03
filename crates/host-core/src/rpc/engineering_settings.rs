use serde_json::Value;

const ACTIONS: &[&str] = &[
    "initialize",
    "discovery",
    "spec",
    "tickets",
    "implement",
    "diagnose",
    "review",
    "retro",
    "ask",
    "grillMe",
    "grilling",
    "handoff",
    "prototype",
    "improveArchitecture",
    "codebaseDesign",
    "domainModeling",
    "tdd",
    "wayfinder",
    "triage",
    "research",
    "resolveConflicts",
    "teach",
    "questionnaire",
    "waitWhat",
    "wizard",
    "writingForAgents",
];

/// Optional fields preserve old profiles; an empty instruction is an explicit override.
pub(super) fn validate(value: &Value) -> Result<(), String> {
    let Some(object) = value.as_object() else {
        return Ok(());
    };
    if let Some(mode) = object.get("engineeringSkillUpdateMode") {
        if !matches!(mode.as_str(), Some("auto-check" | "manual")) {
            return Err("invalid engineeringSkillUpdateMode".into());
        }
    }
    if let Some(prompts) = object.get("engineeringShortcutPrompts") {
        let Some(prompts) = prompts.as_object() else {
            return Err("invalid engineeringShortcutPrompts".into());
        };
        for (action, prompt) in prompts {
            if !ACTIONS.contains(&action.as_str())
                || (!prompt.is_null()
                    && !prompt.as_str().is_some_and(|text| {
                        text.encode_utf16().count() <= 16000 && !text.contains('\0')
                    }))
            {
                return Err("invalid engineeringShortcutPrompts".into());
            }
        }
    }
    if let Some(check) = object.get("engineeringSkillCheck") {
        let Some(check) = check.as_object() else {
            return Err("invalid engineeringSkillCheck".into());
        };
        for key in ["attemptedAt", "checkedAt"] {
            if (key == "attemptedAt" || check.contains_key(key))
                && check
                    .get(key)
                    .and_then(Value::as_u64)
                    .is_none_or(|time| time > 9_007_199_254_740_991)
            {
                return Err("invalid engineeringSkillCheck timestamp".into());
            }
        }
        if check.get("latestRevision").is_some_and(|revision| {
            !revision.as_str().is_some_and(|revision| {
                revision.len() == 40
                    && revision
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            })
        }) {
            return Err("invalid engineeringSkillCheck revision".into());
        }
        if check.get("error").is_some_and(|error| {
            error
                .as_str()
                .is_none_or(|error| error.encode_utf16().count() > 1000)
        }) {
            return Err("invalid engineeringSkillCheck error".into());
        }
        if check.get("preserved").is_some_and(|ids| {
            !ids.as_array().is_some_and(|ids| {
                ids.len() <= 128
                    && ids.iter().all(|id| {
                        id.as_str().is_some_and(|id| {
                            !id.is_empty()
                                && id.len() <= 128
                                && id.bytes().all(|byte| {
                                    byte.is_ascii_lowercase()
                                        || byte.is_ascii_digit()
                                        || byte == b'-'
                                })
                        })
                    })
            })
        }) {
            return Err("invalid engineeringSkillCheck preserved".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn old_settings_empty_override_and_restore_are_compatible() {
        for settings in [
            json!({"theme":"dark"}),
            json!({"engineeringShortcutPrompts":{"ask":"", "implement":null}}),
            json!({"engineeringSkillUpdateMode":"manual"}),
            json!({"engineeringSkillCheck":{"attemptedAt":0,"latestRevision":"a".repeat(40),"preserved":["retro"]}}),
        ] {
            assert!(validate(&settings).is_ok());
        }
    }

    #[test]
    fn rejects_invalid_preferences_and_metadata() {
        for settings in [
            json!({"engineeringSkillUpdateMode":"auto-install"}),
            json!({"engineeringShortcutPrompts":{"unknown":"x"}}),
            json!({"engineeringShortcutPrompts":{"ask":true}}),
            json!({"engineeringShortcutPrompts":{"ask":"x".repeat(16001)}}),
            json!({"engineeringSkillCheck":{"attemptedAt":-1}}),
            json!({"engineeringSkillCheck":{"attemptedAt":0,"latestRevision":"bad"}}),
            json!({"engineeringSkillCheck":{"attemptedAt":0,"preserved":["../escape"]}}),
        ] {
            assert!(validate(&settings).is_err());
        }
    }
}
