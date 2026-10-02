# Engineering Workflow

Open **Workflow** from the coding Work Panel and create a named run for the
current project. Runs belong to the logical project, across its chats and roots.
Only one run is active at a time. Archived and completed runs remain inspectable.

Configure a model and select an existing Agent-mode chat in the same project.
Matt Pocock skills and their companion files are bundled and enabled on first
startup. **Settings > Agent > Skills** initially shows the six stage skills; use Show all skills or
search to manage the others. Type `/tdd` or another skill name to invoke an
auxiliary skill directly. Update engineering skills checks upstream explicitly,
preserving locally edited/removed packages and enabled states. Existing personal
skills take precedence over the bundled fallback.

Enable the stage's skill on that page if you previously disabled it.
Workflow never creates
chats, switches modes, approves a Plan, installs skills, or queues its own prompt.
Resolve active/queued chat work and pending approvals before starting a stage.

The sequence is Discovery (`grill-with-docs`), Spec (`to-spec`), Tickets
(`to-tickets`), Implement (`implement`), Review (`code-review`), Retro (`retro`).
Pi performs the stage in the selected chat. A normal end means **awaiting user
acceptance**. Inspect the result, Continue if needed, then explicitly accept the
stage. This unlocks one successor. Implement may run repeatedly before **Confirm
all tasks complete**; Review requires **Confirm review passed**. Accept Retro to
complete the run, then create a new run for another effort.

To revise accepted work, choose **Reopen** for that stage. The confirmation lists
it and every later stage whose acceptance will be withdrawn. Cancel keeps all
state unchanged. Confirm creates new stage revisions; predecessor decisions stay
accepted and earlier attempts/references remain labeled Historical. Run the
selected stage again and explicitly accept it before continuing. During Review,
**Return to Implement** applies this operation to Implement, Review and Retro.
Reopening is unavailable while work is pending/running or for archived/done runs.

Stop cancels only the attributed workflow turn. Retry creates a new attempt and
preserves history. Failed cancellation retains ownership until the turn settles.
Closing the panel or changing chats does not cancel work. A renderer reload reads
the live execution; runtime/application restart marks unsettled work Interrupted
and requires explicit Retry. Ordinary chat remains independent of acceptance.
An unresolved or mismatched admission acknowledgement keeps its turn reserved;
wait for reconciliation or use Stop rather than resending the same work.

In **Artifact references**, choose the artifact type, stage and registered root,
enter a root-relative path and optional ticket identity, then **Register reference**.
References can be registered before stage execution. **Open** uses the existing
file preview and current workspace permissions. Missing files, unavailable roots
and denied paths remain visible; **Refresh** checks availability again. Historical
references retain their original revision after reopening. Registering or opening
does not accept a stage or verify the artifact's engineering content. Archived
and completed runs retain read-only references.

Development validation: `pnpm test:e2e:workflow-runs`,
`pnpm test:e2e:workflow-discovery`, `pnpm test:e2e:workflow-recovery`,
`pnpm test:e2e:workflow-stages`, `pnpm test:e2e:workflow-reopen`, and
`pnpm test:e2e:workflow-artifacts` use isolated
local fixtures without live accounts.
Use the repository README for initialization and Desktop startup requirements.
