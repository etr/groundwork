# Unworked Review Issues

**Run:** 2026-07-19 01:16:52
**Task:** manual-validation
**Total:** 9 (0 critical, 0 major, 9 minor)

## Minor

1. [ ] **code-quality-reviewer** | `README.md:48` | documentation
   The documentation says Codex receives model and reasoning settings but omits the behavior users and contributors need to predict the conversion: sonnet to gpt-5.6-terra, opus[1m] to gpt-5.6-sol, inherit/absence to no model override, and effort preservation.
   *Recommendation:* Add a compact Codex mapping table or sentence near the supported-target entry, including inheritance/omission behavior and the handling of unsupported values.

2. [ ] **code-quality-reviewer** | `install-skills.sh:615` | backward-compatibility
   Fresh installs no longer create legacy `review-*` skills, but upgrades never remove previously generated `.codex/skills/review-*/SKILL.md` files, including when `--force` is used. Existing users can therefore retain duplicate legacy skills alongside the new custom agents while the installer reports only the native agents.
   *Recommendation:* Define an explicit migration policy: safely remove only known Groundwork-generated legacy agent skill directories during a forced Codex install, or warn and document the manual cleanup. Add an upgrade-style test that pre-creates a legacy review skill before rerunning the installer.

3. [ ] **code-quality-reviewer** | `install-skills.sh:638` | backward-compatibility
   Fresh installs no longer create legacy `review-*` skills, but an upgrade still leaves previously generated `.codex/skills/review-*` directories in place, including with `--force`. Existing users can therefore retain discoverable legacy review skills alongside the new native agents.
   *Recommendation:* Document a one-time cleanup instruction or implement a narrowly scoped migration for known Groundwork-generated legacy agent skill directories, with an upgrade-style test.

4. [ ] **code-simplifier** | `lib/transform-agents.js:286` | code-structure
   The Codex-specific single-agent branch repeats the generic blockquote prompt emission, and the Codex multi-agent branch similarly repeats list construction. Target-specific wording is now coupled to duplicate formatting loops.
   *Recommendation:* Select the target-specific header/reference label first, then reuse one prompt-blockquote path and one agent-list path; preserve the existing Pi tool-call branch unchanged.

5. [ ] **code-simplifier** | `lib/transform-agents.js:306` | code-structure
   The Codex single-agent branch duplicates the generic blockquote prompt loop, and the Codex multi-agent branch duplicates the generic list loop. Future prompt-formatting changes must remain synchronized across branches.
   *Recommendation:* Choose the target-specific header and reference text first, then share one blockquote-prompt emitter and one agent-list emitter; retain the distinct Pi tool-call path.

6. [ ] **code-simplifier** | `tests/install-config.test.js:456` | code-structure
   The Codex native-agent suite adds a distinct 176-line concern to an installer-config test file that is now 635 lines, creating a clear Rule-of-500 seam.
   *Recommendation:* Move the Codex agent export suite and its agent-specific helpers into a focused tests/codex-agent-export.test.js file; keep shared setup minimal and favor DAMP duplication over a broad test-helper abstraction.

7. [ ] **conventions-reviewer** | `AGENTS.md:84` | build-test-convention
   The Running Tests section says `tests/install-config.test.js` checks for zero Codex-only leakage, while CLAUDE.md, the test suite name, and AGENTS.md line 126 correctly describe the invariant as zero Claude-Code-only leakage in exported output.
   *Recommendation:* Change `zero Codex-only leakage` to `zero Claude-Code-only leakage` so the documented testing practice is consistent throughout the repository.

8. [ ] **performance-reviewer** | `install-skills.sh:474` | missing-batching
   Each Codex agent now incurs a third sequential Node startup: one in transform_body, one at lines 633-634 to render TOML, and one here to perform the confined write. For 18 agents, the forced Codex install measured 10.51 seconds versus 8.99 seconds in iteration 1 before the writer process was added; even a no-op reinstall still took 8.62 seconds because transformation, rendering, and the writer process all run before the writer reports skipped. The algorithm remains O(agent count), memory is bounded, and this is a cold CLI path, so impact is non-blocking, but process overhead grows directly with the agent catalog.
   *Recommendation:* Combine TOML rendering and confined writing in one Node invocation per agent by importing renderAgent into the writer, or preferably batch all Codex agent records through one installer process. Preserve the current per-destination containment, symlink, atomic-rename, and descriptor-cleanup checks. If retaining the current design, consider an early non-force skip only if it can perform equivalent symlink-safe validation without weakening confinement.

9. [ ] **performance-reviewer** | `install-skills.sh:613` | missing-batching
   Codex TOML rendering starts one additional Node process per agent, sequentially. With the current 18 agents, isolated renderer launches took about 1.18 seconds on this host; a complete Codex install took about 8.99 seconds. The work is still O(agent count), bounded, and occurs only during installation, so it is not release-blocking, but it adds roughly 13% to the observed cold-install time and scales directly with future agent growth.
   *Recommendation:* Batch all Codex agent render requests through one Node invocation, or combine body transformation and TOML rendering into one per-agent process so installation does not pay a second Node startup for every agent. Keep the present implementation if simplicity is preferred until agent count or install latency becomes material.
