# Triage Labels

These five labels map the canonical engineering-skill roles to GitHub labels.

| Role | Tracker label | Meaning |
| --- | --- | --- |
| needs-triage | needs-triage | Maintainer evaluation required |
| needs-info | needs-info | Waiting for information from the reporter |
| ready-for-agent | ready-for-agent | Fully specified for agent implementation |
| ready-for-human | ready-for-human | Requires human implementation or action |
| wontfix | wontfix | Will not be actioned |

When a skill names a canonical role, use its tracker label from this table.
Tickets produced from an accepted spec are agent-ready and need no redundant
triage round. Existing unrelated labels remain available and unchanged.

Repository label provisioning creates only missing labels. Preserve existing
label colors, descriptions, and issue assignments. Remote availability must
be verified separately from this local vocabulary mapping.
