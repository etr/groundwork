# Unworked Review Issues

**Run:** 2026-08-11 12:33:30
**Task:** manual-validation
**Total:** 5 (0 critical, 2 major, 3 minor)

## Major

1. [ ] **housekeeper** | `.debug/codex-monorepo-project-selection-clear.md:38` | action-item-not-marked-complete
   The action item "Verify the direct tmux environment identity fix across the full suite and independent reviewers." remains unchecked, and the same journal remains Status Active with Resolution Pending at lines 3-4 and 61-62, even though the direct TMUX/TMUX_PANE implementation is present, dedicated tests pass, and bash tests/run-tests.sh completes successfully.
   *Recommendation:* Check off the verification action item, change the journal status to Resolved (or Closed), and record the passing test/review evidence in the Resolution section.

2. [ ] **test-quality-reviewer** | `tests/project-context.test.js:193` | missing-test
   The cross-pane test changes only TMUX_PANE. It does not cover two distinct TMUX values with the same pane ID, so a regression that hashes only TMUX_PANE would pass despite violating the required TMUX + TMUX_PANE identity and allowing state collisions across tmux servers.
   *Recommendation:* Add a focused CLI test that selects in one TMUX server with TMUX_PANE=%1 and resolves under a different TMUX value with TMUX_PANE=%1; assert selection_required is true and state_file differs.

## Minor

3. [ ] **code-quality-reviewer** | `tests/project-context.test.js:190` | test-coverage
   The new isolation test changes only TMUX_PANE while retaining the same TMUX value. It therefore does not verify the other half of the new identity contract: two tmux servers with the same pane identifier must receive distinct state files.
   *Recommendation:* Add a focused case that selects under one TMUX value and resolves under a different TMUX value with the same TMUX_PANE, asserting selection_required is true and state_file differs.

4. [ ] **code-simplifier** | `lib/project-context.js:460` | code-structure
   The fallback comments still number the cwd and session branches as 2 and 3 even though the newly documented tmux branch makes them the third and fourth selection paths.
   *Recommendation:* Either remove the numeric labels or renumber them to match the actual order, so the fallback documentation remains a reliable map of the control flow.

5. [ ] **code-simplifier** | `tests/project-context.test.js:55` | code-structure
   cleanEnv removes TERM_SESSION_ID and CODEX_THREAD_ID, but the reviewed project-context implementation does not read either variable; the extra fixture setup obscures which environment inputs define pane identity.
   *Recommendation:* Keep the TMUX/TMUX_PANE cleanup needed by these tests and remove the unused variables unless a separate implementation path intentionally consumes them.
