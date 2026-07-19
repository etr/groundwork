# Unworked Review Issues

**Run:** 2026-07-19 14:16:37
**Task:** manual-validation
**Total:** 27 (0 critical, 6 major, 21 minor)

## Major

1. [ ] **code-quality-reviewer** | `statusline-command.sh:129` | integration
   The Groundwork project segment is gated exclusively on ~/.claude/plugins/cache/groundwork-marketplace. The newly supported manual plugin layout installs at ~/.claude/plugins/groundwork, so its renderer executes but can never display the selected Groundwork project even when .groundwork.yml and pane state are present. The manual-layout test verifies execution only and misses this end-to-end behavior.
   *Recommendation:* Recognize both marketplace and manual Groundwork installations, or remove the installation-layout gate now that the renderer ships inside Groundwork. Extend the manual-copy test with .groundwork.yml and pane state and assert the Project segment is rendered.

2. [ ] **code-quality-reviewer** | `statusline-command.sh:53` | error-handling
   sanitize_terminal_text invokes jq in raw-input mode without slurping. jq therefore splits an input containing a newline into separate values and emits a newline between the sanitized outputs; the filter never sees or removes that delimiter. Repository-controlled project names and filesystem paths can consequently add extra visual lines even though the renderer promises exactly three lines. The current exact-line test uses only a newline-free temporary path, so this boundary is untested.
   *Recommendation:* Sanitize the entire string as one value (for example, use jq raw-input plus slurp mode before explode/select/implode), and add a behavioral case whose cwd or selected project contains an actual newline. Assert that the rendered output remains exactly three lines and contains no injected line break.

3. [ ] **code-quality-reviewer** | `statusline-command.sh:7` | error-handling
   The renderer parses its required stdin payload and the optional settings.json in one jq invocation. If settings.json exists but is malformed or unreadable, --slurpfile aborts the whole jq program, parsed_input is empty, and the valid cwd/model/context payload silently collapses to defaults. An unrelated optional effort-setting failure therefore removes the core statusline information.
   *Recommendation:* Isolate optional settings parsing from renderer-input parsing (or validate/fallback settings before the combined jq call) so a bad settings file only defaults effort. Add a malformed-settings regression test that still expects model, context, and cwd to render.

4. [ ] **code-simplifier** | `install-skills.sh:395` | code-structure
   The complete Codex statusline workflow is embedded as a 30-line heredoc inside the already 763-line generic installer. This mixes authored skill content with installation mechanics and leaves the Claude and Codex workflows in two structurally different locations, making future ownership/install semantics easier to drift.
   *Recommendation:* Move the Codex body, unchanged, to a statusline-owned source file adjacent to skills/statusline/SKILL.md (for example skills/statusline/SKILL.codex.md), and have the installer read that file when exporting to Codex. This preserves behavior while restoring a clear content-versus-installer seam.

5. [ ] **code-simplifier** | `statusline-command.sh:217` | code-structure
   One 81-line anonymous command group performs cache-age selection, credential discovery, a network request, response validation, usage extraction, and reset-cache persistence. Although comments explain each section, the block has several responsibilities and relies on shared global state, so it is difficult to reason about or change independently.
   *Recommendation:* Extract behavior-preserving named helpers for loading/refreshing usage JSON, extracting usage fields, and reconciling reset timestamps, then keep the top-level flow as a short sequence of those calls. Retain the current fallback rules and stderr suppression exactly.

6. [ ] **performance-reviewer** | `statusline-command.sh:293` | unbounded-concurrency
   Every render with a missing or stale usage cache starts a detached refresh without acquiring a lock or advancing a last-attempt timestamp. When credentials are unavailable, curl times out, or the API returns null/invalid utilization, the cache is never replaced, so a frequently invoked statusline can continuously launch overlapping Python, security, and curl processes.
   *Recommendation:* Add single-flight refresh control, such as an atomically acquired lock/lease with trap-based cleanup, and record a short retry cooldown even when refresh fails. Continue serving stale data immediately, but permit at most one usage refresh per cooldown window.

## Minor

7. [ ] **code-quality-reviewer** | `skills/statusline/codex-skill-body.md:3` | error-handling
   The Claude workflow explicitly rejects actions other than install/uninstall, but the Codex-owned replacement body only names the two actions and supplies a default. Because export replaces the entire body, Codex loses the explicit invalid-action behavior.
   *Recommendation:* Add the same reject-and-show-usage instruction to the Codex body and cover it in the export assertions.

8. [ ] **code-quality-reviewer** | `skills/statusline/codex-skill-body.md:3` | error-handling
   The Claude workflow explicitly rejects actions other than install/uninstall, but the Codex replacement body only lists the two actions and provides a default. Because export replaces the full source body, invalid-action handling is inconsistent across the two supported harnesses.
   *Recommendation:* Add the same reject-and-show-usage instruction to the Codex body and assert it survives export.

9. [ ] **code-quality-reviewer** | `skills/statusline/codex-skill-body.md:3` | error-handling
   The Claude workflow explicitly rejects actions other than install or uninstall, but the Codex-owned replacement body only names the two supported actions and supplies a default. Because the export replaces the entire body, invalid-action handling remains less explicit on Codex.
   *Recommendation:* Add the same reject-and-show-usage instruction to the Codex body and assert that the instruction survives export.

10. [ ] **code-quality-reviewer** | `statusline-command.sh:64` | clean-code
   git_info and gw_segment are initialized but never read, while the cwd SHA-1 expression is repeated at lines 158 and 178. These leftovers add noise and, on the no-TTY path, duplicate the hashing pipeline during every render.
   *Recommendation:* Remove the unused assignments, compute the cwd-derived pane key once, and reuse it for both the pane fallback and fallback-state filename.

11. [ ] **code-quality-reviewer** | `statusline-command.sh:68` | clean-code
   git_info and gw_segment are initialized but never read. The revised hash helper and project lookup are otherwise cohesive, so these leftover variables are now pure noise in an already substantial shell renderer.
   *Recommendation:* Remove the unused git_info and gw_segment assignments.

12. [ ] **code-simplifier** | `install-skills.sh:395` | code-structure
   After extracting the Codex statusline body to its own file, translate_statusline_body is now a one-line, one-call wrapper that adds an extra navigation seam without hiding any meaningful behavior.
   *Recommendation:* Read the source file directly at the sole call site (for example, new_body=$(<"$SOURCE_DIR/skills/statusline/codex-skill-body.md")) and remove the wrapper function.

13. [ ] **code-simplifier** | `statusline-command.sh:158` | needless-repetition
   The cwd-derived pane key is calculated here and then calculated again as `gw_cwd_hash_key` at line 178, duplicating both the expression and its subprocesses on the no-TTY path.
   *Recommendation:* Compute `gw_cwd_hash_key` once before choosing `gw_pane_key`, assign `gw_pane_key=$gw_cwd_hash_key` in the fallback branch, and reuse the same value for `gw_fallback_file`.

14. [ ] **code-simplifier** | `statusline-command.sh:158` | needless-repetition
   The cwd-derived pane key is calculated here and then calculated again as `gw_cwd_hash_key` at line 178, duplicating both the expression and its subprocesses on the no-TTY path.
   *Recommendation:* Compute `gw_cwd_hash_key` once before choosing `gw_pane_key`, assign `gw_pane_key=$gw_cwd_hash_key` in the fallback branch, and reuse the same value for `gw_fallback_file`.

15. [ ] **code-simplifier** | `statusline-command.sh:58` | code-structure
   git_info and gw_segment are initialized but never read after output rendering was changed to print each segment directly. They are stale state from the previous rendering approach and suggest a second output path that no longer exists.
   *Recommendation:* Remove both unused initializations and keep the direct rendering path as the single representation.

16. [ ] **code-simplifier** | `statusline-command.sh:58` | code-structure
   git_info and gw_segment (line 104) are initialized but never read after the renderer switched to assembling line 3 directly with printf.
   *Recommendation:* Remove both dead assignments so the remaining state reflects the renderer's current output path.

17. [ ] **code-simplifier** | `statusline-command.sh:64` | code-structure
   The new renderer initializes `git_info` and `gw_segment`, but neither variable is read anywhere in the script.
   *Recommendation:* Remove both unused assignments; the surrounding `git_root`/`git_repo` and `gw_project` state already carries the rendered values.

18. [ ] **code-simplifier** | `statusline-command.sh:64` | code-structure
   The renderer initializes `git_info` and `gw_segment`, but neither variable is read anywhere in the script.
   *Recommendation:* Remove both unused assignments; the surrounding `git_root`/`git_repo` and `gw_project` state already carries the rendered values.

19. [ ] **code-simplifier** | `statusline-command.sh:68` | code-structure
   The renderer still initializes `git_info` here and `gw_segment` at line 132, but neither variable is read anywhere after line 3 was changed to render its segments directly.
   *Recommendation:* Remove both unused assignments so the script has a single, explicit representation of its output state.

20. [ ] **housekeeper** | `CLAUDE.md:7` | documentation-stale
   CLAUDE.md still reports 40 skills although the repository now contains 41, and its Library Utilities inventory does not mention the newly added `lib/runtime-context-cli.js` Codex runtime resolver.
   *Recommendation:* Update the skill count to 41 and add `lib/runtime-context-cli.js` to the Library Utilities table with its Codex model/effort resolution purpose.

21. [ ] **housekeeper** | `CLAUDE.md:7` | documentation-stale
   CLAUDE.md still reports 40 skills although the repository now contains 41, and its Library Utilities inventory still omits the added `lib/runtime-context-cli.js` Codex runtime resolver.
   *Recommendation:* Update the skill count to 41 and add `lib/runtime-context-cli.js` to the Library Utilities table with its Codex model/effort resolution purpose.

22. [ ] **housekeeper** | `README.md:175` | documentation-stale
   README.md says its Skills section lists user-facing skills, but the new `/groundwork:statusline [install|uninstall]` user workflow is absent from every skills table even though it is now part of the plugin.
   *Recommendation:* Add the statusline workflow to an appropriate README skills/configuration section, including its install/uninstall argument and opt-in behavior; the detailed steps can continue to live in docs/getting-started.md.

23. [ ] **housekeeper** | `README.md:175` | documentation-stale
   README.md says its Skills section lists user-facing skills, but the new `/groundwork:statusline [install|uninstall]` user workflow remains absent from every skills table even though it is now part of the plugin.
   *Recommendation:* Add the statusline workflow to the README Utility Skills table, including its install/uninstall argument and opt-in purpose; the detailed setup and dependency notes can remain in docs/getting-started.md.

24. [ ] **performance-reviewer** | `statusline-command.sh:271` | missing-batching
   A cache-hit render repeatedly forks `jq` to parse the same input and usage/reset JSON and starts Python separately for each reset countdown. Together with the unconditional plugin-inspection Python process, this creates substantial process-launch overhead for a command executed frequently.
   *Recommendation:* Parse each JSON document once (for example, emit tab-separated fields from one `jq` call) and calculate both reset strings in a single Python invocation or in shell. Consider measuring cold and cache-hit render latency and keeping the cache-hit path comfortably below interactive thresholds.

25. [ ] **performance-reviewer** | `statusline-command.sh:299` | missing-batching
   The repeatedly executed cache-hit path still parses the same input, usage cache, and reset cache through many separate `jq` processes and can launch Python once per reset countdown, in addition to unconditional plugin-inspection Python and multiple Git/process utilities.
   *Recommendation:* Parse each JSON source once into multiple shell fields, compute both reset labels in one Python invocation, and benchmark warm render latency after consolidation to keep the interactive statusline path lightweight.

26. [ ] **performance-reviewer** | `statusline-command.sh:321` | blocking-io
   Whenever either reset timestamp is available, every render synchronously launches jq and rewrites statusline-reset-cache.json even when the values are unchanged. This adds process and disk I/O to the repeated path and concurrent renderer instances can observe the directly-truncated file while it is being replaced.
   *Recommendation:* Compare the desired reset values with the cached values and skip unchanged writes; when they differ, write to a uniquely named temporary file and atomically rename it into place.

27. [ ] **performance-reviewer** | `statusline-command.sh:79` | unbounded-concurrency
   An expired or absent PR cache can start one detached `gh pr view` per render until the first refresh completes. Successful and failed refreshes eventually create the cache and stop launches for 60 seconds, so this is burst-limited, but a slow three-second request can still produce a refresh stampede during rapid status updates.
   *Recommendation:* Use an atomic per-cache-key lock or in-progress marker before spawning the PR refresh, and release it after the atomic cache replacement so only one `gh` request runs for a repository/branch at a time.
