# Task Resume Protocol

Single source of truth for resuming in-flight task work across sessions.
When a batch or task session is killed mid-run, its progress survives in
durable artifacts: the task worktree and branch, the plan file, the runner
checkpoint, and the validation session records. This protocol classifies
those artifacts with one helper — the task-resume CLI — and turns the
classification into an exact continuation point. Never re-derive this state
by hand (git archaeology, process probing, ad-hoc reasoning): the helper is
the authority, and the interactive path and the terminal runner share its
single classification implementation.

## The resume gate

Before planning or starting any task, run:

```
task-resume.js check TASK-NNN [--project <name>] [--base-branch <branch>] [--fresh-window <minutes>]
```

It prints exactly one JSON line and changes nothing. In monorepos always
pass `--project <name>`. The base branch defaults to the primary worktree's
checked-out branch; pass `--base-branch` when HEAD is detached or the base
is known better from context.

## Reading the result

| Field | Meaning |
|---|---|
| `resume_at` | `fresh` \| `implement` \| `validate` \| `finalize` \| `done` \| `conflict` — where execution continues |
| `skip_phases` | Phases already complete for this task; skip them |
| `resume_existing_worktree` | The implement phase must resume inside the existing worktree, not create one |
| `plan.present` / `plan.file` | An existing plan file — reuse instead of re-planning |
| `live_owner` | `none` \| `validation-heartbeat` \| `recent-writer` — see the standdown rule |
| `actions` | Ready-to-run argv tails (`record …`, `clear …`); run them verbatim at the annotated moments, prefixed with this harness's task-resume CLI invocation |
| `evidence` | One-line reasons for the classification; surface them when reporting |
| `worktree`, `checkpoint`, `validation_session`, `merged_into_base` | The observed state behind the classification |

## The `resume_at` decision table

| `resume_at` | State | What to do |
|---|---|---|
| `fresh` | No branch, worktree, or session exists | Normal flow: plan, implement, validate, finalize |
| `implement` | Worktree exists but its state matches no recorded phase (dirty, or clean-but-unrecognized) | Skip planning when `plan.present`; dispatch the executor in **resume mode** (below); validate and finalize as normal afterward |
| `validate` | Implementation is present (recorded checkpoint, or a clean worktree with commits beyond the fork point and an In-Progress/Complete task record inside it) | Skip plan and implement; run validation from the worktree; pass `RESUME VALIDATION SESSION=<run_id>` when an action says an active session is resumable |
| `finalize` | A terminal validated session covers the current task head (possibly derived), or an accepted base integration exists | Skip plan, implement, and validate; invoke finalize-task from the worktree |
| `done` | The task branch is already merged into the base branch | Advance to the next task; clear the checkpoint when an action says so |
| `conflict` | The plan changed under an existing implementation; branch and worktree disagree; or a live owner holds the work | Stop. Surface `evidence` to the user, preserve the worktree, and let the user decide. In a batch, stop the batch |

The classification never crashes on odd state — it classifies ambiguity as
`conflict` with evidence. Treat `conflict` as a hard stop, not a puzzle to
solve autonomously.

## Standdown rule

- `live_owner: validation-heartbeat` — a validation session for this exact
  task is running right now (live heartbeat or a fresh open inside its
  grace window). Do not touch the worktree, do not start a competing run.
  Report and stop. This rule outranks every other classification.
- `live_owner: recent-writer` — the checkpoint was written moments ago
  (default 30 minutes; `--fresh-window` overrides). Another session may
  still be alive without a heartbeat. Interactive sessions: ask the user
  before proceeding. Batches: stop and report, listing the evidence.

## Recording contract (interactive runs)

Interactive runs write exactly two checkpoint records — after the plan is
persisted, and after the executor reports implementation — and clear once
the task lands. Do not invent other writes. The `actions` array carries the
exact argv tails with substituted values:

1. After persisting the plan file: run the `record-plan-after-persist`
   action (`record TASK-NNN --phase plan --plan-file <abs>`).
2. After `RESULT: IMPLEMENTED | <worktree> | <branch> | <base>`: run the
   `record-implemented-after-result` action
   (`record TASK-NNN --phase implemented --worktree <abs> --branch <b> --base <bb>`).
   The helper verifies the worktree is the registered task workspace and
   computes all commit heads itself; a mismatch is refused.
3. After finalize-task merges and cleans up: run the `clear-checkpoint`
   action (`clear TASK-NNN`).

Validation and integration states are never recorded interactively: the
validation session records own the former and git merge ancestry owns the
latter, and `check` derives both at read time.

## Resume-mode executor dispatch

When `resume_existing_worktree` is true, the implement dispatch must
include these lines (mirroring the terminal runner's contract):

```
WORKTREE PATH: <worktree path from the check result>
TASK BRANCH: <expected_branch from the check result>
RESUME EXISTING WORKTREE=true
```

The executor then verifies the registered worktree, inspects existing
commits, plan progress, and tests, and finishes only the remaining work —
it does not re-create the worktree and does not repeat completed work. If
`plan.present` is false in an `implement` state, plan first and record the
plan before dispatching.

## Sweep: stale worktree cleanup at batch start

Before a batch begins, run:

```
task-resume.js sweep [--project <name>] [--base-branch <branch>]
```

- `cleanable` — provably safe to remove: the branch is merged into the base
  branch, the task is marked Complete, the worktree is clean, and no live
  validation session exists. Batches remove these automatically, from the
  repository root, with absolute paths only:

  ```
  git worktree remove <absolute worktree path>
  git branch -d <branch>
  ```

  Both commands refuse unsafe states on their own, so a refusal means the
  classification is stale — stop and re-run the sweep rather than forcing.
- `needs_review` — anything ambiguous (unmerged, dirty, unknown task,
  detached). Report the entries and reasons; never remove them
  automatically.
- `ignored_live` — merged but a live validation session exists. Leave
  untouched; re-run the sweep later.

## Notes

- Task worktree and branch identity always comes from the worktree-identity
  helper; the check result's `expected_branch` and `expected_worktree`
  already reflect it (including legacy unqualified identities in
  monorepos — resolve those with the worktree-identity helper before
  acting).
- A task whose index row says `In Progress` with no worktree, branch, or
  session is a stale marker; the check reports it as `fresh` with evidence.
  Offer to reset the row to `Not Started`.
- The checkpoint files live under the repository's Git state directory and
  are owned by this helper; never read or write them directly.
