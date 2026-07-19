# Debug: stale model recommendation

## Status
Root Cause Found

## Symptoms
- A recent Groundwork session said: `Current model isn’t the skill’s recommended Sonnet/Opus at high effort. Continue validation anyway, or pause so you can switch with /effort high and /model sonnet?`
- This occurred after commit `31bc08b` claimed to translate Claude model recommendations for Codex.

## Reproduction
### Command Executed
```bash
rg -n "Sonnet or Opus|/model sonnet" /Users/etr/.codex/skills/groundwork-validate/SKILL.md
```

Executed twice with identical results.

### Actual Output
```text
14:... AND you are Sonnet or Opus.
16:If you are not Sonnet or Opus, you MUST show the recommendation prompt ...
23:... `/effort high` (and `/model sonnet` if on Haiku) ...
24:    "header": "Recommended: Sonnet or Opus at high effort",
```

### Expected Output
Codex-facing Groundwork skills must not recommend Claude-only Sonnet/Opus models or `/model sonnet`.

### Matches User Report?
Yes. This is the active Codex skill path and it contains the exact model gate that generated the reported paraphrase.

## Hypotheses

### Active
- [ ] None.

### Eliminated
- [x] The translation itself is broken: eliminated because `node tests/install-config.test.js` passes the Codex model translation test and generates translated temp output.
- [x] Codex loaded the repository source directly: eliminated because the active named skill path is `/Users/etr/.codex/skills/groundwork-validate/SKILL.md`, with transformed Codex frontmatter/body but an old timestamp.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Searched repository model recommendations | Source skills still contain `Sonnet or Opus`, `/model sonnet`, and Haiku checks | Claude-specific source remains on `main` |
| 2 | Read installed personal `groundwork-debug` skill | It contains Codex-facing `Opus (1M context)` text | At least one export/install path translates source content |
| 3 | Read active installed `groundwork-validate` twice | Both reads contain the reported Sonnet/Opus gate | Symptom reproduced consistently at the actual loaded path |
| 4 | Compared timestamps | Installed file: 2026-07-17 10:35; translation commit: 2026-07-17 12:17 | Installed copy predates the fix |
| 5 | Read `write_file()` | Existing destinations are skipped unless `--force` is passed | A normal reinstall does not refresh existing skills |
| 6 | Ran `node tests/install-config.test.js` | Codex translation regression test passed | Current exporter is fixed; installed state is stale |

## Root Cause
**Verification level:** Verified

Commit `31bc08b` changes only `transform_body()` in `install-skills.sh`; it does not migrate already-installed files. The active `groundwork-validate` file was installed about 1h42m before that commit and remains unchanged because `write_file()` skips existing destinations unless the installer runs with `--force`. Therefore the recent session read the stale pre-fix skill and emitted its Sonnet/Opus recommendation.

## Fix
No repository fix applied during diagnosis. Operational correction: reinstall the Codex export with `--force`, then start a fresh Codex session so its skill catalog/context is rebuilt.

## Resolution
Root cause isolated; awaiting authorization to update the global Codex skill installation if desired.
