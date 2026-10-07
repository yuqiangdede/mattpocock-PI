# Three-Stage Engineering Product Direction

Date: 2026-10-07

Status: Recorded product direction from the three-stage discussion. Stages two
and three are planned capabilities, not implementation or release claims. This
document does not authorize implementation, delivery, or architecture changes.
The [stage-one specification](skill-launcher-spec.md) remains authoritative for
the current Launcher contract.

## Product progression

Make engineering methods accessible, organize the current development process,
then expose the versions, decisions, and evidence behind engineering results.

| Stage | User question | Capability | Acceptance outcome |
| --- | --- | --- | --- |
| Skill Launcher | What do I want to do now? | Click an engineering action to prepare an editable native Skill instruction; submit explicitly. | Methods are discoverable and independently usable. |
| Development Navigator | Where is this task, and what can I do next? | Associate a development task with its artifacts and evidence, show gaps, and suggest available actions. | Users understand progress and freely choose the next action. |
| Engineering Control Surface | What supports this result, which version was accepted, and how can I trace it? | Inspect and select artifact versions, record confirmations and Review, and connect implementation with validation evidence. | Users can trace requirements, design, implementation, tests, and Review for a result. |

## Stage one: Skill Launcher

- Buttons express engineering intent, such as technical design, diagnosis, or
  code review; Skill identifiers remain the underlying references.
- Actions remain independent. Users may review before designing or implementing.
- Selection prepares an editable Composer draft. Only explicit Send executes
  through the native Skill Loader and current Session Pi Agent.
- Action configuration does not own project progress, artifact freshness, stage
  completion, or a second agent execution model.

Completion means methods can be discovered, configured, and invoked reliably
without requiring a fixed Workflow. Detailed compatibility and acceptance
requirements remain in the stage-one specification.

## Stage two: Development Navigator

The Navigator helps users understand what they just requested, inspect associated
results, and choose what to do next. Its first release is scoped to the current
conversation; it does not require a separate development-task entity. See the
[first-release requirements](development-navigator-requirements.md) for the
accepted discovery decisions and acceptance scenarios.

- Status comes from artifacts, execution results, or explicit human confirmation.
  Chat text alone is insufficient evidence that a stage is complete.
- Recommendations disclose their basis and uncertainty. Users can inspect that
  basis, choose another action, or continue without accepting the suggestion.
- Suggestions do not enforce a stage sequence or automatically advance work.
- A standalone Ask next step button remains a Launcher action. Navigation
  requires persistent associations with the current task and actual evidence.

Example: requirements change after a design was produced. Show that the design
may need review, with actions to inspect the change, update the design, or
continue implementation. Do not silently mark the design invalid or regenerate it.

The first implementation should prove one minimal user loop:

1. Submit an engineering Skill request in the current conversation.
2. Continue the engineering activity across multiple rounds and inspect results.
3. Explicitly end the activity, then optionally request analysis-only `ask-matt`
   suggestions while idle; an individual reply ending does not trigger navigation.
4. Prepare a suggested or independently selected action with editable context.
5. Send through the native agent path and associate results with the activity.

Start retaining the minimum conversation, request, execution, and result
associations needed by this loop. Project-wide tasks and artifact-version
management remain later capabilities rather than first-release prerequisites.
Concrete schemas, ownership, and storage contracts require a separate design.

## Stage three: Engineering Control Surface

The Control Surface adds versions, explicit selection, confirmation, and evidence
tracing to task navigation. Tabs alone do not establish this capability.

Users should be able to answer:

- Which requirement and design versions were used for this implementation?
- Which tests and Review results apply to that implementation revision?
- After a requirement changes, which conclusions may need revalidation, and why?
- Who confirmed which content version, and on what evidence?
- What happened in earlier attempts, retries, and rework?

Confirmations apply to identifiable content versions. Updating content must not
silently transfer an earlier confirmation to the new version. Selecting an
execution basis should be explicit and inspectable.

Traceability initially means viewing history, comparing versions, and following
associations between decisions and evidence. Restoring code or data is a separate
operation requiring its own safety, compatibility, and interaction design.

Completion means a user can inspect the chain from selected requirements and
design through implementation to tests and Review, including historical attempts
and the limits of each conclusion.

## Shared boundaries and rollout

- Evolve cumulatively: retain action access, add task context, then add version
  selection and evidence tracing. Later stages do not replace earlier ones.
- Preserve native agent execution, permissions, cancellation, queues, and
  existing persisted user data. Do not introduce a parallel Runtime.
- Product progression does not prescribe a fixed development sequence. Users
  remain free to revisit requirements, design, implementation, tests, or Review.
- Historical Workflow records are compatibility data, not proof that the planned
  Navigator or Control Surface already exists.
- This direction does not freeze process architecture or introduce public APIs,
  persistence schemas, automated orchestration, or automatic rollback.

Before stage-two implementation, define task identity and scope, artifact and
execution associations, status evidence, and a representative user-path test.
Before stage three, define artifact versioning, confirmation scope, revision-bound
validation evidence, history retention, and revalidation rules. Update relevant
product specifications and acceptance scenarios when implementing behavior; use
an ADR if frozen architecture, ownership, or public boundaries must change.
