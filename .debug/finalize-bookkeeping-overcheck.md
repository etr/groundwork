# Debug: finalize-bookkeeping-overcheck

## Status
Fixed

## Symptoms
- Runner fails after validation and finalization even though TASK-188 was already Complete.
- Exact error: `finalize-task changed task bookkeeping after validated TASK-188 was already Complete`
- Reported finalization commands only show a commit-range diff and worktree status check.

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
`allows finalization to synchronize a stale index after validation completes the task detail` failed with:

`TASK-004 failed: finalize-task changed task bookkeeping after validated TASK-004 was already Complete`

### Expected Output
Finalization should accept the index-only status synchronization and publish the validated task.

### Matches User Report?
Yes. The integration test follows the same split-task state seen in TASK-188: detail file already `Complete`, index row still `Not Started`.

## Hypotheses

### Active
- [x] The runner treats a `Complete` detail record as proof that no other status representation may need synchronization.

### Eliminated

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Located exact error text | Two throws in `bin/groundwork-run.js` | Both finalization paths enforce the same guard. |
| 2 | Inspected preserved TASK-188 worktree | Detail file is `Complete`; `_index.md` is the sole dirty file and changes only TASK-188 from `Not Started` to `Complete` | Finalize made the update required by its documented workflow. |
| 3 | Added split-task integration reproduction | Current runner fails with the exact user-reported error | The zero-change rule, not unsafe content, causes the failure. |

## Root Cause
**Verification level:** Verified

`parseTaskCatalog` reads the authoritative heading-based detail record and sees `Complete`. Finalization then synchronizes the stale table row. The existing path allowlist and masked content comparison approve the mutation, but the final `beforeTask.status === 'Complete' && changed` condition rejects every bookkeeping change, contradicting `finalize-task` step 2.

## Fix
Remove the redundant zero-change condition in both prepared-tree and committed-tree verification. Retain the allowed-path check, selected-status-only content comparison, and final `Complete` assertion.

## Resolution
- Regression test failed before the fix with the exact reported error and passes after it.
- `node tests/groundwork-run.test.js`: 117 passed, 0 failed.
- `bash tests/run-tests.sh`: all test suites passed.
