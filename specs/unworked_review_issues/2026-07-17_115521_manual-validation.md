# Unworked Review Issues

**Run:** 2026-07-17 11:55:21
**Task:** manual-validation
**Total:** 8 (0 critical, 3 major, 5 minor)

## Major

1. [x] **code-quality-reviewer** | `lib/project-context-cli.js:67` | error-handling
   The CLI calls persistSelection(), whose underlying persistPaneSelection() catches and suppresses every write error, and then unconditionally prints a successful binding with selection_required=false. For example, setting CODEX_HOME to a regular file makes the state write impossible, yet `select` exits 0 and reports success even though the next `resolve` cannot restore the selection.
   *Recommendation:* Make persistence report failure (preferably by allowing write errors to propagate, or by returning a boolean that the CLI checks), exit non-zero on failure, and add a regression test using an unwritable/invalid harness state path.

2. [x] **code-quality-reviewer** | `lib/project-context-cli.js:93` | error-handling
   The select command calls persistSelection and unconditionally prints a successful binding, while persistPaneSelection catches and suppresses every filesystem error. If the harness state directory is unwritable or malformed (for example, CODEX_HOME points to a file), the command exits 0 and says selection_required is false even though no state file exists and the next resolve requires selection again.
   *Recommendation:* Make the persistence path report failure (return a boolean or throw), have the CLI exit nonzero instead of emitting success when the state file was not written, and add a regression test using an invalid or unwritable harness state directory. Preserve best-effort behavior only for callers that explicitly opt into it.

3. [x] **code-quality-reviewer** | `tests/project-context.test.js:49` | test-coverage
   The new harness-specific getStateDir implementation has branches for Codex, OpenCode, Kiro, Pi, and Claude, but the new tests exercise only Codex. Regressions in OPENCODE_CONFIG_DIR/XDG_CONFIG_HOME, KIRO_HOME, PI_HOME, CLAUDE_CONFIG_DIR, or their default paths would pass the suite despite harness-specific storage being a core requirement.
   *Recommendation:* Convert the storage checks to table-driven tests covering explicit and default homes for every supported harness, and run select plus resolve for at least one non-Codex exported target. Add installer assertions for the non-Codex harness arguments as well.

## Minor

4. [x] **code-simplifier** | `lib/project-context-cli.js:38` | code-structure
   bindings() computes path.relative(repoRoot, projectPath) twice, which makes the relationship between project_root and specs_dir slightly less direct than necessary.
   *Recommendation:* Compute a single projectRoot local, then return project_root: projectRoot and specs_dir: path.join(projectRoot, 'specs'). This preserves behavior while making the shared boundary calculation explicit.

5. [x] **code-simplifier** | `lib/project-context-cli.js:47` | code-structure
   bindings() still computes path.relative(repoRoot, projectPath) twice, obscuring slightly that project_root and specs_dir derive from the same value.
   *Recommendation:* Compute one projectRoot local, then use it for both project_root and path.join(projectRoot, 'specs').

6. [x] **code-simplifier** | `tests/project-context.test.js:97` | patterns
   The standalone Codex HOME-fallback test duplicates the codex entry in the table-driven defaultCases tests, including the same selection and state-directory assertion.
   *Recommendation:* Remove the standalone test and retain the table-driven codex case, which additionally verifies that the state file exists.

7. [x] **performance-reviewer** | `lib/project-context-cli.js:54` | blocking-io
   A successful resolve/select invocation discovers repository roots repeatedly: loadConfig(), the explicit getRepoRoot(), getMainRepoRoot(), persistSelection()/restoreSelection(), and bindings() collectively launch several synchronous git subprocesses. The work is bounded and occurs only once per workflow, but most results are identical within the short-lived CLI process.
   *Recommendation:* Resolve repoRoot and stateRepoRoot once in main() and pass them into config loading, selection persistence/restoration, and bindings, or cache getRepoRoot()/getMainRepoRoot() for the process lifetime. This would retain behavior while reducing subprocess startup overhead.

8. [x] **test-quality-reviewer** | `tests/install-config.test.js:227` | missing-test
   Installer tests verify that runtime files exist and that SKILL.md contains expected command text, but never execute the bundled project-context-cli.js from an installed skill. A copied runtime that is truncated, stale, or unable to resolve its sibling module could still satisfy these assertions.
   *Recommendation:* In the temporary installed tree, create a minimal monorepo and execute the bundled select/resolve CLI for at least Codex, asserting its JSON and persisted state. Keep the current string assertions as focused transform checks.
