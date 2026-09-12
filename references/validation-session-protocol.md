# Durable Validation Session Protocol

This protocol makes validation restartable without treating an interrupted fixer as completed work. The helper owns durable semantic state under the repository Git common directory. Reviewer artifacts, coordinator state, repair envelopes, fixer results, gate logs, and the completion receipt live in one `groundwork-validation-<run_id>` directory. It does not inspect, compare, copy, restore, or clean worktree contents.

Do not edit `.validation-session.json` or `active.json` directly. Write only the coordinator-owned artifacts named below, then ask `validation-session.js` to validate and checkpoint them atomically.

## Ownership: capability, epoch, heartbeat

A validation session (schema version 2) is owned by a **bearer capability**, not by whoever names its run id:

- `open` returns `owner_token` exactly once per successful create, authorized resume, or reclaim — the only place the raw token ever appears. Durable state stores only its SHA-256 digest, an owner `epoch`, and a monotonic `revision`.
- Every mutating command (`checkpoint`, `begin-fixer`, `complete-fixer`, `complete`, `heartbeat-*`) requires `--owner-token`. Mutations acquire the run's mutation lock, reload state, authenticate the digest, validate the expected stage (and revision, when `--expected-revision` is passed), and write one new revision. Authorized contenders serialize on the lock; the loser rereads state and fails the stage/revision check instead of overwriting the winner.
- Liveness is a **heartbeat worker**, not the brief `open` process. Start it before long gate/reviewer/fixer work and stop it through trap/finalization handling:

```text
validation-session.js heartbeat-loop --run-dir <run_dir> --owner-token <token>
validation-session.js heartbeat-stop --run-dir <run_dir> --owner-token <token>
```

The loop registers its PID and process-start identity, emits one `{"status":"heartbeat-ready"}` line, refreshes the lease each interval (default 15 s, `GROUNDWORK_VALIDATION_BEAT_MS`), and exits when the session completes, its stop is recorded, or its capability is revoked by a successor. A session is **live** while its registered worker's last beat is inside the staleness window (default 2 h, `GROUNDWORK_VALIDATION_STALE_MS`). A just-opened or just-reclaimed session is protected by a startup grace window (default 60 s, `GROUNDWORK_VALIDATION_GRACE_MS`) until its worker registers.

- **Takeover:** a stale owner (no fresh heartbeat, grace expired) is reclaimed by simply opening again — under the slot lock the claimant revalidates staleness, mints epoch+1 with a fresh capability, and revokes the old one. An old worker or orchestrator holding the previous capability can no longer write. A stale `fixer-inflight` session is recovered as `fixer-prepared` for the successor.
- **Redaction:** the token never appears in state JSON, status output, reporter events, error text, or diagnostics. Runner mode persists its continuity capability only in a private `runner-capability.json` (mode 0600) beside the slot — never in reporter artifacts.
- **Runner/manual arbitration:** the runner's project lease does not authorize validation mutation. A live manual session blocks runner continuation (`open --runner-mode` is refused, nothing is stolen); runner continuation resumes through its retained capability; a provably stale manual owner is reclaimed and the runner then starts its own heartbeat worker.
- **No live-owner override:** `abandon --force` cannot remove a live v2 owner (fresh heartbeat or startup grace). Its documented legacy scope is wedged/unreadable slots and version-1 state after user-confirmed quiescence. Abandon revalidates the pointer immediately before unlinking, so a successor session published mid-abandon survives.

## Version boundary

Completed version-1 sessions remain replayable read-only. An incomplete version-1 session is rejected — never silently adopted in place — with recovery through `abandon --force` (documented legacy scope) or the documented quiescent migration. Old unsafe records are preserved on disk for inspection; nothing is rewritten during rollout.

## Identity and opening

Open the session before gates, reviewer dispatch, or artifact creation:

```text
validation-session.js open --repo-root <repo> --project-root <project> --worktree <worktree> --task-id <TASK-NNN|manual-validation> --branch <branch> --base-head <sha> --protocol-version 1 [--runner-mode] [--resume-run <run_id> --owner-token <token>]
```

The JSON result supplies `run_id`, `run_dir`, `findings_dir`, `stage`, `iteration`, `coordinator_file`, `owner_token` (create/resume/reclaim only), and optional recovery/completion data. A runner invocation uses `--runner-mode`; an interactive invocation does not.

Handle its status exactly:

- `created`: freeze the baseline, start the heartbeat worker, and start the one comprehensive audit.
- `resumed`: your capability was accepted; restart the heartbeat worker (if it is not already running) and continue from the recorded stage.
- `reclaimed`: the previous owner was provably stale; you hold a successor capability and epoch. Restart the heartbeat worker before continuing.
- `recovered`: confirm the old fixer is no longer running, preserve the current worktree, load the recorded envelope, and rerun the interrupted fixer named by `recovery.action`.
- `completed`: replay the stored metrics and action/commit receipt. Do not invoke gates, reviewers, or a fixer again.

Do not restart the initial audit after `created`. A resumed closure session retains the frozen baseline, finding ledger, carried approvals, and closure-review scope from its coordinator file.

## Durable stages

| Stage | Durable meaning | Resume action |
|---|---|---|
| `initial-audit-pending` | No complete comprehensive reviewer batch is recorded | Run the initial gate/reviewer batch |
| `review-batch-complete` | All assigned artifacts for the iteration were validated and the semantic ledger was checkpointed | Aggregate the recorded batch; fix or complete |
| `fixer-prepared` | A prior `fixer-inflight` process ended without a validated result | Preserve current changes and rerun the same repair envelope |
| `fixer-inflight` | The repair envelope is recorded, but no validated result was adopted | Confirm the old fixer ended, then resume the same repair |
| `fixer-result-ready` | The fixer-result schema and artifacts were validated | Run the required gate barrier |
| `gates-complete` | Post-fix required gates passed | Run only impacted closure reviewers |
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
validation-session.js checkpoint --run-dir <run_dir> --expected-stage <stage> --next-stage <stage> --iteration <N> --coordinator-file <absolute-direct-child-path> --owner-token <token>
```

The coordinator file is the compact restart contract. It must contain semantic closure records, not only finding IDs.

## Fixer transaction

Write `repair-envelope-iter<N>.json` directly inside `run_dir`, then record the semantic `fixer-inflight` transition before spawning the fixer:

```text
validation-session.js begin-fixer --run-dir <run_dir> --iteration <N> --envelope-file <absolute-direct-child-path> --owner-token <token>
```

After the normal fixer-result validator accepts `fixer-result-iter<N>.json`, record that result:

```text
validation-session.js complete-fixer --run-dir <run_dir> --iteration <N> --result-file <absolute-direct-child-path> --owner-token <token>
```

If execution stops in `fixer-inflight`, partial changes are never treated as a completed result. After confirming the prior fixer process ended, reopening with your capability changes the stage to `fixer-prepared` and reruns the same envelope against the preserved current worktree. The replacement fixer must reconcile any partial implementation idempotently.

Never spawn a replacement fixer while the prior fixer process may still be live. Runner mode relies on the runner's exclusive project lease plus its retained validation capability; manual mode requires explicit confirmation.

## Completion

After approval, required gates, and unworked-finding persistence are complete, record the exact reusable result (this also marks ownership terminal, which stops the heartbeat worker):

```text
validation-session.js complete --run-dir <run_dir> --expected-stage review-batch-complete --iterations <N> --fixed <M> --unworked <K> --action <commit|none> [--commit-subject <subject> --commit-body <body>] --owner-token <token>
```

Retain the session directory. A completed session is intentionally replayable; cleanup is eventual maintenance, not part of validation correctness.
