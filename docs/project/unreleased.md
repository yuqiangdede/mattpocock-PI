# Unreleased changes

- Remove native Workflow navigation and the work-panel surface. Legacy Workflow
  tabs are filtered while other session resources survive; Host history and APIs
  remain intact. Coding Actions continue as independent Skill shortcuts.
- Add project-relative PowerShell startup and verification wrappers plus a short
  engineering-skill reference under `.agents/README.md`.

- Extension Settings shows effective localized Coding Action prompts and the
  same guidance used by button tooltips. Prompt status distinguishes defaults,
  custom instructions and explicit marker-only requests. Restore default prompt
  affects only the selected Action and is applied when saved.

- Stage-one Skill Launcher provides six independent Coding Actions using the
  current session's native Pi Skills. Extension Settings edits names, prompts,
  order and enabled state, with Actions JSON import/export. Existing shortcut
  prompts migrate safely; damaged configuration preserves the original file,
  keeps Chat usable and offers an explicit reset with backup.


- Coding Actions removes the separate Confirm requirements button. Workflow
  retains confirmation history; Cancel and Escape remain available during
  pending requests. Users inspect a
  specification file and approve its content version without starting an Agent
  or creating a Workflow Run. Changed content requires renewed confirmation;
  historical decisions remain available after restart.

- Settings > Info now updates the Matt Pocock skill bundle and mattpocock-PI
  independently, with stable/prerelease channels. The upstream comparison row
  is removed. Skill updates snapshot the previous catalog, preserve local edits,
  and offer Restore last backup. Running tasks block skill maintenance and app
  restart. Windows installs explicitly download and restart; Portable/ZIP
  downloads are checksum-verified and revealed for manual replacement.

- Coding Workbench prioritizes Ask next step, Discuss requirements, Implement,
  Diagnose bug and Review code in the first Composer row. Workflow navigation
  and More occupy a subdued second row; More groups occasional skills, including
  initialization and retrospective. Skill selection preserves the draft and
  requires manual Send. Usage guidance and examples explain each skill.
- `/compact` and automatic context compaction work again on a gateway that
  fronts a Codex backend. The summary request of a checkpoint now carries the
  conversation identity every other turn of the session sends
  (`prompt_cache_key`), instead of being the one request the gateway answers
  with `400 invalid codex request`.

- Claude models on a GitHub Copilot account no longer fail with "missing
  required Authorization header". Their Anthropic Messages requests now
  authenticate with `Authorization: Bearer` instead of sending the Copilot
  token as `X-Api-Key`.

- Google Gemini rows send requests again. A provider row on the native
  generative-AI endpoint no longer hands pi-ai's Google adapter the internal
  response-capture `fetch` it refuses before the request leaves, custom provider
  headers still reach Google, and an adapter refusal now fails the turn instead
  of spending all ten transient retries on it (issue #1072).

- Deleting a provider no longer leaves a dangling image-generation default.
  An image default or marked candidate whose provider row is gone is dropped
  on the next settings read or write, instead of staying stored as a binding
  every generation request rejects as an unavailable model.

- Subagent topology cards and their live process rows now follow the main
  conversation's responsive width behavior: long descriptions, paths,
  commands, and summaries wrap inside the dock instead of requiring repeated
  divider dragging to read them.

- Resuming a subagent no longer selects another definition's private model
  binding. On-demand delegation permissions are checked again on the next parent
  turn, so revoking automatic delegation takes effect without restarting the runtime.
- Trusted extension cancellation now retires SDK commands, tool updates,
  subprocesses and queued or visible prompts. Late hook payload mutations are
  isolated; legitimate long commands and tools retain their runtime budget.

- Copy individual Markdown tables, download them as CSV, or expand them for
  reading without leaving the conversation.

- A stored hosted web-search record that cannot be replayed no longer fails every
  later request in that conversation: the message continues without search replay,
  so histories written before the contract change stay usable.

- Hosted web search now has a complete replay and estimation contract, including
  tool/Task continuation and restart recovery. Context rebuilding preserves
  system-prefix semantics, and structured local preparation failures no longer
  masquerade as retryable provider failures. Existing search histories need no migration.

- Trusted extension startup, shutdown, and notification handlers now have
  bounded waits. Stop cancels pending hook waits before a model request, and
  disposal ignores late results and runs shutdown once. Deferred event
  registrations now appear in plugin diagnostics.

- The Composer reasoning slider now moves smoothly to clicked or
  keyboard-selected levels, follows dragging immediately, and respects
  reduced-motion settings. Rapid clicks redirect the animation; failed saves
  restore the confirmed selection. Opening the menu no longer leaves a
  press-animation offset that jumps on the first selection.
- The reasoning slider's filled track covers the entire starting dot, so
  its left cap no longer leaves a gray half-dot exposed.
- Hovering a reasoning stop or its label highlights the corresponding label.
  Only unfilled dots brighten and enlarge; filled dots and the current thumb
  keep their appearance.
- OpenAI Codex OAuth models can now opt into provider-hosted native web search.
  The feature remains off by default and search history is replayed only for
  the same Codex model.

## Development Navigator implementation candidate

- Adds conversation-scoped engineering activities, explicit multi-round
  boundaries, evidence inspection, and optional ask-matt navigation analysis.
- Recommendations prepare editable context drafts; explicit Send remains required.
- Candidate implemented and locally validated in PR #53; not merged or released.
