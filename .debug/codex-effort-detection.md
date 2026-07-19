# Debug: Codex effort detection

## Status
Resolved

## Symptoms
- Groundwork prompted to switch model/effort during a Codex session already running `gpt-5.6-sol` at `high` effort.
- The user identified the recommendation as a detection bug.

## Reproduction

### Commands Executed
```bash
node -e "const {getEffortLevel}=require('./lib/skills-core'); console.log(getEffortLevel())"
node /Users/etr/.codex/skills/groundwork-build-unplanned/scripts/project-context-cli.js resolve --harness codex
```

Both commands were executed twice with identical results.

### Actual Output
```text
xhigh
project-context error: No .groundwork.yml found
```

The active Codex skill also contains the unresolved text:
```text
**Your current effort level is `{{effort_level}}`.**
```

### Expected Output
The Codex export must expose the effective configured model and effort (`gpt-5.6-sol`, `high`) to the workflow before it applies the recommendation gate.

### Matches User Report?
Yes. The workflow has neither the Codex effort value nor a reliable Codex model identity, so it falsely prompts even when both satisfy the gate.

## Hypotheses

### Confirmed
- [x] Codex exports preserve `{{effort_level}}` but provide no Codex runtime binding for it.
- [x] The shared `getEffortLevel()` reads Claude settings only, so it cannot supply Codex's configured effort.
- [x] The only bundled portable resolver binds project variables and fails in single-project repositories without `.groundwork.yml`.

### Eliminated
- [x] The Codex model-name translation is stale: active skills already contain Terra/Sol recommendations.
- [x] The user config is missing the setting: `~/.codex/config.toml` contains `model = "gpt-5.6-sol"` and `model_reasoning_effort = "high"`.

## Root Cause
**Verification level:** Verified

The export transform translates Claude model names to Codex names but does not add a runtime binding for `{{effort_level}}` or current model. Codex does not run the Claude-only template hook, and `getEffortLevel()` reads `~/.claude/settings.json`. Therefore exported skills retain an unresolved effort placeholder and the workflow guesses model/effort from incomplete session metadata.

## Fix Direction
Bundle a Codex runtime-context resolver with recommendation-bearing skills. It must read Codex's configured `model` and `model_reasoning_effort`, and the generated skill preamble must bind both values before the recommendation gate.

## Fix Applied
- Added `lib/runtime-context-cli.js` to read Codex's top-level configured model and reasoning effort.
- Updated the Codex exporter to bundle the resolver and prepend runtime-binding instructions to every skill containing `{{effort_level}}`.
- Added export/runtime regression coverage in `tests/install-config.test.js`.
- Force-refreshed the globally installed Codex skills.

## Verification
- RED: new export test failed with `Codex recommendation skill has no runtime resolver`.
- GREEN: `node tests/install-config.test.js` — 15 passed, 0 failed.
- Regression: `bash tests/run-tests.sh` — all suites passed.
- Live resolver: returned `{"model":"gpt-5.6-sol","effort_level":"high"}` from `~/.codex/config.toml`.
- Installed resolver returned the same values after global refresh.
