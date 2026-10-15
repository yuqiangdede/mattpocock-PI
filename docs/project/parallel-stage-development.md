# Parallel Stage Development

Date: 2026-10-11. Status: parallel branch setup; policy adoption through a main-targeted PR.
Authority: [AGENTS.md](https://github.com/yuqiangdede/mattpocock-PI/blob/main/AGENTS.md#parallel-stage-development-fork-exception).

| Ref | Role |
| --- | --- |
| main | Stable accepted product; includes the stage-one Skill Launcher |
| stage1-complete | Immutable source baseline at 14dba93431fefe9e4ba990e07d8c5e8be5fadcff; not a new release certification |
| codex/stage1-maintenance | Optional combined acceptance candidate for stage-one improvements |
| codex/stage2-development-navigator | Experimental stage-two integration candidate |
| codex/parallel-stage-policy | This documentation request; no product implementation |

## Discover working directories

Run `git worktree list --porcelain` to locate the primary checkout and the
stage worktrees on the current host. Use a new task-specific path when
creating a request worktree. Preserve unrelated changes in every checkout.

## Task routes

Stage-one fixes and improvements use a fresh branch/worktree from current
origin/main and the normal main PR gates. No stage-two code is needed to
maintain the Skill Launcher.

Stage-two experiments use a fresh branch/worktree from the selected,
committed exploration head:

```bash
git worktree add -b codex/stage2-<task> <new-task-worktree> codex/stage2-development-navigator
```

Before the first experiment, update the stage branches from the main commit containing this policy. Record that base SHA before editing. Experimental results are not stable
delivery. An authorized experimental PR targets the stage-two branch and
validates its actual integration candidate. Before validation or a PR update, refresh the stage branch from latest origin/main and incorporate the latest stage head into the task. Run node scripts/check-pr-base-main.mjs --base <latest-stage-head> and record both the stage base and main SHA. Do not depend on uncommitted
changes in the stage worktree.

For a mature slice, create a fresh delivery branch/worktree from current
origin/main and transfer only its coherent changes after commit authorization.
Do not merge the complete exploration branch into main as a shortcut.
Run the normal latest-main ancestry, targeted checks and integration gates.

## Synchronization and retention

When authorized, fetch origin/main and merge it into each long-lived stage
branch inside that branch's worktree. Preserve shared history; do not rebase
a long-lived stage branch. A no-op or fast-forward update needs no merge
commit; other updates remain subject to commit authorization.

Stage integration worktrees remain while their stage is active. Individual
task worktrees are removed after authorized delivery and a clean-state check.
Separate experimental profiles and databases from stable application data.
Reuse compatible tools and caches; do not create another dependency
environment solely for testing.

## Setup verification

The three new/retained worktrees initially pointed at 14dba934. Active stage branches must receive the landed policy before experiments begin.
The stage1-complete annotated tag records the same source commit.
No PR #53/#63 content was merged as part of the parallel branch setup.
Documentation checks do not constitute runtime, installer or release tests.
