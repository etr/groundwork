# Unworked Review Issues

**Run:** 2026-07-19 02:11:21
**Task:** manual-validation
**Total:** 4 (0 critical, 0 major, 4 minor)

## Minor

1. [ ] **code-simplifier** | `tests/install-config.test.js:225` | code-structure
   The new capture option changes runInstaller from returning a root-path string to returning an object, creating a flag-dependent union return type that callers must remember.
   *Recommendation:* Keep runInstaller returning one stable shape, preferably { root, stdout }, or add a clearly named runInstallerWithOutput wrapper for the one output-inspecting path.

2. [ ] **performance-reviewer** | `install-skills.sh:494` | missing-batching
   remove_legacy_codex_agent_skill invokes a new Node process for every bundled agent after export, including when the exact legacy SKILL.md is absent. With 18 current agents, isolated missing-path cleanup launches took about 0.47 seconds on this host and add 18 sequential process startups plus repeated lstat traversal to every Codex install. Scaling remains O(agent count) at fixed path depth, memory is bounded, and removeLegacySkill leaks no descriptors, so this cold-path overhead is non-blocking.
   *Recommendation:* Before launching Node, reuse the dry-run existence guard (`[[ -e "$legacy_skill" || -L "$legacy_skill" ]] || return 0`) so fresh installs pay no cleanup-process cost; the Node helper should still perform all containment and symlink checks whenever a candidate exists. Alternatively, pass all bundled legacy paths to one Node invocation and process them sequentially there.

3. [ ] **performance-reviewer** | `install-skills.sh:494` | missing-batching
   The iteration-1 process-scaling issue remains: every Codex install invokes remove-legacy-codex-agent-skill.js once for each bundled agent, even when the legacy SKILL.md is absent. The strengthened helper now performs fixed-depth lstat/stat/chdir verification and reliably restores cwd in a finally block, so it is leak-free and O(agent count), but 18 missing-path launches measured about 0.57 seconds on this host and the overhead grows linearly with the catalog.
   *Recommendation:* Short-circuit before Node when the exact candidate is neither present nor a symlink (`[[ -e "$legacy_skill" || -L "$legacy_skill" ]] || return 0`), retaining all inode/symlink verification whenever a candidate exists. Alternatively, pass all exact legacy paths to one Node process and call removeLegacySkill sequentially so each deletion keeps the same anchored verification without repeated runtime startup.

4. [ ] **security-reviewer** | `lib/remove-legacy-codex-agent-skill.js:92` | TOCTOU hardening (CWE-367)
   The SKILL.md unlink is now safely anchored to the verified review-directory inode. The subsequent empty-directory cleanup is not: process.chdir('..') follows the review directory's current parent. If that directory is concurrently moved under another parent after verification, rmdirSync(reviewDirectory) can remove an unrelated empty directory with the same name in that external parent. It cannot delete a file or non-empty directory, so impact is limited, but this remains outside the stated containment boundary.
   *Recommendation:* Keep an anchored handle to the verified skills directory and perform the final rmdir relative to that handle with inode verification, or omit automatic empty-directory removal when race-free directory-relative removal is unavailable. Add a race test that moves the active review directory to a differently named location before process.chdir('..') and verifies no external empty directory is removed.
