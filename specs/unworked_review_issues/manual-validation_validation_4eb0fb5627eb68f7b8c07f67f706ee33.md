# Unworked Review Issues

**Run:** 2026-09-11 22:23:48
**Task:** manual-validation
**Total:** 5 (0 critical, 0 major, 5 minor)

## Minor

1. [ ] **code-quality-reviewer** | `/Users/etr/progs/claude-groundwork/groundwork/lib/validation-session.js:582` | error-handling
   The active.json pointer read itself (readJson at line 582) sits outside the new try/catch, so a corrupted (non-JSON) pointer file would still throw under --force and leave the slot uncleared. This is pre-existing baseline behavior unrelated to the repair: the pointer is written atomically via writeJsonSyncAtomic, no refusal message recommends abandon --force for that failure mode, and corruption of .git-internal metadata requires external tampering outside the frozen baseline. Informational only; does not block.
   *Recommendation:* If desired in a future pass, hoist the pointer read into the same guarded block so --force also treats an unreadable pointer as stale state (unlink it under the lock). No action required for closure.

2. [ ] **conventions-reviewer** | `/Users/etr/progs/claude-groundwork/groundwork/statusline-command.sh:193` | code-pattern
   The repair hunk introduces a `;`-joined sed program: gw_repo_slug=$(echo "$gw_main_root" | sed 's|%|%25|g; s|/|%2F|g'). CLAUDE.md/AGENTS.md ('Multi-target installation') directs avoiding ';'-joined sed programs in bash-3.2/BSD-sed-targeted scripts. Mitigating context, hence minor only: (a) the documented rule is literally scoped to the installer (install-skills.sh, which contains no ';'-joined sed), (b) semicolon-joined plain 's' commands are functionally valid on BSD sed (the BSD incompatibility is ';' before a/i/c/{/#/label commands), and (c) the same idiom already exists pre-existing in this file (lines 47, 177) and in hooks/session-start.sh:254, none of which this repair touched. The adjacent new sed in build-zcode-marketplace.sh correctly uses separate -e expressions.
   *Recommendation:* For consistency with the documented BSD-sed idiom (and the -e style used in the new build-zcode-marketplace.sh hunk), rewrite as sed -e 's|%|%25|g' -e 's|/|%2F|g'. Non-blocking; cosmetic/consistency only.

3. [ ] **housekeeper** | `/Users/etr/progs/claude-groundwork/groundwork/CLAUDE.md:23` | documentation-stale
   CLAUDE.md's project-structure tree describes the checklists dir as '(testing: test-driven-development ↔ test-quality-reviewer; accessibility: ux-design ↔ design-consistency-checker)' while AGENTS.md line 23 says 'accessibility & design slop: ux-design ↔ design-consistency-checker'. AGENTS.md is the accurate side: references/checklists/ contains accessibility.md, design-slop.md, and testing.md. Verified pre-existing at base 6fce28d (git show of both files at base shows the same divergence), so it is unrelated to the repair and outside the scope of the repaired library-table/path-safety parity.
   *Recommendation:* Align CLAUDE.md line 23 with AGENTS.md by changing 'accessibility:' to 'accessibility & design slop:' so the mirrored sections stay in full parity. Non-blocking; can ride along with the next CLAUDE.md touch.

4. [ ] **test-quality-reviewer** | `tests/plan-check.test.js:206` | naming-convention
   Test name 'extracts fields from the bounded header only' asserts the opposite of what it pins: it verifies that a field line outside the ## Context section (under ## Steps) IS still scanned, and the body comment concedes 'the header is a hint, not a fence'. A future reader will misread the pinned contract from the name alone.
   *Recommendation:* Rename to state the actual pinned behavior, e.g. 'scans field lines anywhere in the bounded head (## Context is a hint, not a fence)'.

5. [ ] **test-quality-reviewer** | `tests/validation-lock.test.js:84` | excessive-setup
   The lockPath(repo) helper (lines 84-89) is defined but never used — every test computes the lock path inline via path.dirname(created.runDir). Dead setup code that suggests a shared helper the suite does not actually have.
   *Recommendation:* Delete the unused lockPath helper, or use it in the tests that currently inline path.dirname(created.runDir) to locate active.lock.
