# Engineering Workflow V0 Tickets

- Date: 2026-10-01
- Status: Published; implementation not started
- Tracker: GitHub Issues in yuqiangdede/mattpocock-PI
- Source: Accepted Engineering Workflow V0 implementation specification from the discovery conversation
- Approval: The user authorized automatic acceptance of subsequent recommendations
- Parent issue: None; no parent issue was created or modified
- Baseline for this ticketing worktree: 51c839596
- Source specification and tracker setup are included in the documentation delivery; the issues contain self-contained requirements

## Published vertical slices

| Slice | Issue | User-visible delivery | Blocked by |
| --- | --- | --- | --- |
| T1 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5) | Create, inspect, archive, and retain project-owned runs | None |
| T2 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6) | Execute Discovery in an existing Pi session with accurate durable outcomes | #5 |
| T3 | [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) | Stop, continue, retry, and recover interrupted work without replay | #6 |
| T4 | [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) | Explicitly accept and complete the six-stage workflow | #7 |
| T5 | [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9) | Reopen earlier work and return Review to Implement | #8 |
| T6 | [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) | Register, inspect, and safely open artifact references | #5 |

All six issues carry ready-for-agent. That label means fully specified, not
unblocked. The initial frontier is #5. Once #5 is complete, #6 and #10 become
eligible; the execution progression then follows #6 -> #7 -> #8 -> #9.

## Acceptance coverage

Each issue contains concrete acceptance checklists and representative user-path
tests. The mapping below is traceability, not a claim that tests were run.

| Spec criterion | Tickets |
| --- | --- |
| AC-01 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5) |
| AC-02 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-03 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-04 | [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-05 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-06 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5), [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |
| AC-07 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) |
| AC-08 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6) |
| AC-09 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-10 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8), [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9) |
| AC-11 | [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9), [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |
| AC-12 | [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8), [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9) |
| AC-13 | [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8) |
| AC-14 | [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) |
| AC-15 | [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) |
| AC-16 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5), [#6](https://github.com/yuqiangdede/mattpocock-PI/issues/6), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7) |
| AC-17 | [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |
| AC-18 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5), [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |
| AC-19 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5), [#8](https://github.com/yuqiangdede/mattpocock-PI/issues/8), [#9](https://github.com/yuqiangdede/mattpocock-PI/issues/9), [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |
| AC-20 | [#5](https://github.com/yuqiangdede/mattpocock-PI/issues/5), [#7](https://github.com/yuqiangdede/mattpocock-PI/issues/7), [#10](https://github.com/yuqiangdede/mattpocock-PI/issues/10) |

## Dependency and publication evidence

The issue bodies contain explicit blocker links. All five native GitHub
dependencies were created and verified through their remote blocked_by lists:
#6 depends on #5, #7 on #6, #8 on #7, #9 on #8, and #10 on #5.
No parent issue or unrelated issue was edited, closed, assigned, or commented on.

## Implementation boundaries

Each ticket cuts through the user entry point and its required host/API/state
behavior rather than delegating UI or persistence as separate horizontal work.
There is no standalone speculative refactor ticket. Any necessary behavior-
preserving extraction is part of the relevant slice and must retain normal
composer behavior.

Use existing Pi execution and the Rust host-owned kv extension. Normal turn
completion never accepts a stage. The model's Skill tool loads instructions;
it does not supply a business-completion signal. Missing engineering skills
are blockers rather than automatic installations.

Re-read current code, scoped repository rules, and remote issue state before
implementation. Refresh a dedicated task branch/worktree from current remote
main. Source documents in unrelated worktrees are not implementation
dependencies. Do not commit unless the user explicitly requests it.

## Checks for this ticketing task

- Six issues published with ready-for-agent and read back for body/label/state.
- All 20 specification acceptance criteria mapped to ticket acceptance tests.
- All blocker references precede dependent tickets; no dependency cycle.
- No specific source file paths or code snippets in ticket bodies.
- Local Markdown, links, encoding, and diff checks are performed before delivery.
- Runtime tests, application launch, and provider calls are outside this
  documentation-and-tracker task; implementation validation is required by each issue.
