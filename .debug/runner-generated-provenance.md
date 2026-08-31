# Debug: Runner generated-state provenance

## Status
Superseded

## Symptoms
- The recovery classifier globally treats every `.venvs` path as generated.
- `.venvs` is an ArtistAI convention, not a repository-independent ownership signal.
- A different repository could use that name for protected human-authored ignored content.
- The first structural replacement repeated ancestor and `pyvenv.cfg` probes for every ignored file.

## Reproduction
### Command Executed
`node tests/groundwork-run.test.js`

### Actual Output
`Recovery overwrote pre-existing work: .python-envs/maillist-administrator/installed.txt, .python-envs/maillist-administrator/pyvenv.cfg`

### Expected Output
Recovery refreshes an arbitrarily named Python virtual environment identified by `pyvenv.cfg`, without any `.venvs` path segment.

The large-environment regression must also perform fewer than 50 marker probes across 1,800 files.

### Matches User Report?
Yes. An equivalent managed Python environment fails unless its parent path uses a hard-coded generated directory name.

## Hypotheses

### Active

### Eliminated
- [x] The behavior is already environment-structural: eliminated because the arbitrary-name regression failed on both the marker and environment content.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Traced `recoveryStatusSnapshot` through `createRecoveryRescue`, `assertSafeRecoveryDelta`, and `restoreRecoveryRescue` | Every selected-worktree ignored path is classified only by `GENERATED_RECOVERY_SEGMENTS` or filename suffix | `.venvs` support is name-based and globally applied |
| 2 | Ran the runner suite with `.python-envs/maillist-administrator/pyvenv.cfg` | Recovery rejected both virtual-environment files as pre-existing work | Directory-name classification is the failing boundary |
| 3 | Instrumented `lstatSync` in a 1,800-file arbitrary-name virtual environment | Initial structural implementation made 10,812 `pyvenv.cfg` probes | Structural detection needs a per-snapshot prefix cache |

## Root Cause
**Verification level:** Verified

`isGeneratedRecoveryArtifact()` has no repository-root input and recognizes generated ownership only from path segments/suffixes. Consequently `.venvs` succeeds solely because its name is globally hard-coded, while an identically structured Python virtual environment at another path fails.

## Fix
Removed `.venv`, `venv`, and `.venvs` from the directory-name classifier. Python virtual environments are now recognized structurally when a real ancestor directory contains a regular, non-symlink `pyvenv.cfg`. The classifier receives the selected worktree root so it can verify the marker without trusting a project-specific path spelling. Each recovery snapshot caches positive and negative directory/marker probes by prefix, and downstream rescue/restore steps reuse the snapshot classification.

## Resolution
The structural classifier was an intermediate fix and has now been removed. Git-ignored state in the selected conventional worktree and primary checkout is outside runner accounting regardless of artifact name or ecosystem. Unrelated worktrees retain full ignored-state protection. See `.debug/runner-worktree-ownership.md`.
