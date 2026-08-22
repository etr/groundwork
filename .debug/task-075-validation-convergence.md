# Debug: TASK-075 validation convergence

## Status
Diagnosis complete; no code change requested

## Symptoms
- TASK-075 validation ran for roughly 2h22m and reported five loop rounds.
- The preserved worktree contains a Bottle Budget test edit and seven persisted unworked findings.

## Evidence
- The resumed run launched three reviewer batches, not five comprehensive audits: iteration 2 (`initial-audit`), iteration 5 (`closure-review`, nine reviewers), and iteration 6 (`closure-review`, six reviewers). Gate/fixer transitions consumed the other iteration numbers.
- Every new blocking finding in iterations 5 and 6 declared a permitted repair-causal origin and concrete causal reference. No closure finding used `scope-expansion` or an unsupported fresh audit.
- Iteration 6 omitted housekeeper, performance, and cloud reviewers, showing targeted reviewer carry-forward.
- A project-gate fixer started at 23:29:42 PDT and changed `packages/bottle-budget/frontend/tests/components/layout/TabBar.test.tsx`, outside TASK-075's selected ArtistAI project.
- The installed convergence policy was rewritten at 23:34:28 PDT, after that unrelated fixer had already been authorized. The active coordinator had started earlier and could not hot-reload the new skill.
- The final persisted architecture major says the Dockerfile never writes `BAKED_RUNTIME_MANIFEST.json`, but the preserved worktree invokes `stage_qwen_runtime.py --verify-staged`, and that script writes the manifest. The finding is stale.
- The persistence helper excludes only exact global IDs listed in `findings_fixed`; it does not semantically close an approved duplicate when another reviewer reports and fixes the same root cause.
- Iteration 6 security review emitted `verdict: approve` while reporting a causal `major` `exposed-by-fix` broken-access-control finding. The current validator intentionally accepts approve-plus-major and persists it instead of fixing it.

## Conclusion
The prior runaway pattern—later reviewers reopening unchanged scope through repeated full audits—is not visible in the late TASK-075 batches. The long run was mainly a broad initial repair followed by concrete repair regressions and project-gate work.

Two convergence/accounting defects remain visible:
1. unrelated repository-gate failures could enter a fixer envelope; the newly installed policy addresses this, but TASK-075 was already running;
2. persisted unworked findings can be stale because resolution is tracked by exact reviewer ID rather than semantic identity.

A third policy choice deserves reconsideration: an approved repair-caused major security finding is accepted as non-blocking, which can make the loop appear converged while retaining a material defect.
