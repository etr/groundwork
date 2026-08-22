# Durable Validation Session Protocol

This protocol makes validation restartable without treating an interrupted fixer as completed work. The helper owns durable state under the repository Git common directory. Reviewer artifacts, coordinator state, repair envelopes, fixer results, gate logs, recovery snapshots, and the completion receipt live in one `groundwork-validation-<run_id>` directory.

Do not edit `.validation-session.json` or `active.json` directly. Write only the coordinator-owned artifacts named below, then ask `validation-session.js` to validate and checkpoint them atomically.

## Identity and opening

Open the session before gates, reviewer dispatch, or artifact creation:

```text
validation-session.js open --repo-root <repo> --project-root <project> --worktree <worktree> --task-id <TASK-NNN|manual-validation> --branch <branch> --base-head <sha> --protocol-version 1 [--runner-mode]
```

The JSON result supplies `run_id`, `run_dir`, `findings_dir`, `stage`, `iteration`, `coordinator_file`, and optional recovery/completion data. A runner invocation uses `--runner-mode`; an interactive invocation does not.

Handle its status exactly:

- `created`: freeze the baseline and start the one comprehensive audit.
- `resumed`: load the recorded coordinator file and continue from the recorded stage.
- `recovered`: load the recorded envelope and rerun the interrupted fixer or pending step named by `recovery.action`.
- `needs-recovery`: make no source change. Confirm the old fixer is no longer running and obtain direct user authorization before reopening with `--recover-partial-fixer`.
- `completed`: replay the stored metrics and action/commit receipt. Do not invoke gates, reviewers, or a fixer again.

Do not restart the initial audit after `created`. A resumed closure session retains the frozen baseline, finding ledger, carried approvals, and closure-review scope from its coordinator file.

## Durable stages

| Stage | Durable meaning | Resume action |
|---|---|---|
| `initial-audit-pending` | No complete comprehensive reviewer batch is recorded | Run the initial gate/reviewer batch |
| `review-batch-complete` | All assigned artifacts for the iteration were validated and the semantic ledger was checkpointed | Aggregate the recorded batch; fix or complete |
| `fixer-prepared` | A prior `fixer-inflight` transaction was recovered to its pre-fix tree | Rerun the same repair envelope |
| `fixer-inflight` | A pre-fix snapshot and envelope exist, but no validated result was adopted | Recover; never infer success from dirty files |
| `fixer-result-ready` | The result schema was validated and the post-fix tree became the new boundary | Run the required gate barrier |
| `gates-complete` | Post-fix required gates passed on the recorded tree | Run only impacted closure reviewers |
| `validated` | Metrics and runner action/commit receipt are final | Replay completion |

An interrupted reviewer batch has no completed checkpoint. Rerun only the exact pending batch for that stage and iteration, reusing its assigned artifact names. Existing files are evidence, not completion, until the coordinator validates every assigned artifact and checkpoints the batch.

## Coordinator checkpoint

After every fully validated reviewer batch, write `coordinator-iter<N>.json` directly inside `run_dir`:

```json
{
  "iteration": 3,
  "review_mode": "closure-review",
  "validation_baseline": {"task":"TASK-075","base_sha":"...","scope":["..."]},
  "finding_ledger": [],
  "carried_approvals": [],
  "disturbed_invariants": [],
  "fixed_ids": [],
  "findings_skipped": [],
  "active_reviewers": [],
  "latest_manifest": "fixer-manifest-iter3.json"
}
```

Checkpoint only these transitions:

```text
initial-audit-pending -> review-batch-complete
fixer-result-ready    -> review-batch-complete  # an in-scope gate failed and became a repair batch
fixer-result-ready    -> gates-complete
gates-complete        -> review-batch-complete
```

Use:

```text
validation-session.js checkpoint --run-dir <run_dir> --expected-stage <stage> --next-stage <stage> --iteration <N> --coordinator-file <absolute-direct-child-path>
```

The coordinator file is the compact restart contract. It must contain semantic closure records, not only finding IDs.

## Fixer transaction

Write `repair-envelope-iter<N>.json` directly inside `run_dir`, then create the recovery boundary before spawning the fixer:

```text
validation-session.js begin-fixer --run-dir <run_dir> --iteration <N> --envelope-file <absolute-direct-child-path>
```

After the normal fixer-result validator accepts `fixer-result-iter<N>.json`, adopt its tree:

```text
validation-session.js complete-fixer --run-dir <run_dir> --iteration <N> --result-file <absolute-direct-child-path>
```

If execution stops in `fixer-inflight`, partial changes are never treated as a result. Runner recovery first captures a quarantine patch, restores the exact pre-fix tree, and changes the stage to `fixer-prepared`. It then reruns the same envelope. Manual recovery leaves the worktree untouched as `needs-recovery` until the user authorizes `--recover-partial-fixer`; that path also preserves a quarantine patch before rollback.

Never spawn a replacement fixer while the prior fixer process may still be live. Runner mode relies on the runner's exclusive project lease; manual mode requires explicit confirmation.

## Completion

After approval, required gates, and unworked-finding persistence are complete, record the exact reusable result:

```text
validation-session.js complete --run-dir <run_dir> --expected-stage review-batch-complete --iterations <N> --fixed <M> --unworked <K> --action <commit|none> [--commit-subject <subject> --commit-body <body>]
```

Retain the session directory. A completed session is intentionally replayable; cleanup is eventual maintenance, not part of validation correctness.
