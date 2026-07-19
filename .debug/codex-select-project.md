# Debug: codex-select-project

## Status
Resolved

## Symptoms
- `groundwork:select-project` does not work on Codex because its JavaScript invocation is not ported.
- Project-selection persistence may be keyed to Claude Code-specific terminal/session state.

## Reproduction
### Command Executed
```bash
bash install-skills.sh --codex --project --force --skills-only --source <repo>
node .codex/lib/persist-project.js demo
```

### Actual Output
The exported `groundwork-select-project/SKILL.md` still instructs:

```bash
node ${PLUGIN_ROOT}/lib/persist-project.js <selected-name>
```

No `persist-project.js` is exported. Executing the expected installed path fails:

```text
Error: Cannot find module '/private/tmp/gw-codex-repro-20260717/.codex/lib/persist-project.js'
code: 'MODULE_NOT_FOUND'
```

### Expected Output
Codex selects a configured monorepo project and later skills restore that selection.

### Matches User Report?
Yes.

## Hypotheses

### Verified
- [x] Bundle a canonical selection and resolution interface with each context-aware exported skill.

### Eliminated
- [x] The script is exported somewhere else: `find .codex -path '*persist-project.js'` returned no files.

## Evidence Log
| # | Action | Observation | Conclusion |
|---|--------|-------------|------------|
| 1 | Located select-project workflow and persistence entry point | Skill invokes `node ${PLUGIN_ROOT}/lib/persist-project.js`; persistence delegates identity and storage to `project-context.js` | Both invocation portability and state-path behavior require tracing |
| 2 | Ran the Codex installer in a clean temp directory | Only skill Markdown was emitted; the instructed JS path throws `MODULE_NOT_FOUND` | User-reported failure reproduced |
| 3 | Resolved a pane file with a temporary HOME | Output was `<HOME>/.claude/groundwork-state/panes/...` | State storage is Claude-specific |
| 4 | Inspected exported downstream skills | `{{project_name}}` and `{{specs_dir}}` remain unresolved | Persisting selection alone cannot make Codex workflows consume it |
| 5 | Checked current official Codex manual | Skills may bundle scripts; `CODEX_HOME` is the supported Codex state root | A bundled runtime can be portable and state can be harness-scoped |

## Root Cause
**Verification level:** Verified

The multi-target installer treats skills as Markdown-only artifacts, but `select-project` depends on plugin-root JavaScript and Claude lifecycle hooks. The Codex export therefore references a runtime file it does not install. Independently, `project-context.js` fixes state under `~/.claude`, and exported downstream skills retain hook-resolved template variables with no Codex resolver. These three Claude-plugin assumptions cross the export boundary unchanged.

## Fix
Chosen design: bundle a canonical `select`/`resolve` project-context CLI beside every exported context-aware skill. The installer supplies the harness explicitly; the runtime maps state into that harness's home. Exported placeholder consumers receive a resolver preamble. Claude's existing plugin-root entry point remains compatible.

Rejected alternatives:
- One shared installed runtime: deep API, but generated skills need brittle global-vs-project scope paths.
- Instruction-only repo state: zero runtime, but weaker validation, no pane isolation, and model-dependent resolution.

## Resolution
Implemented a bundled `select`/`resolve` CLI, explicit harness routing, harness-scoped pane state, and resolver preambles for exported context-aware skills. Verified Codex selection and resolution plus storage routing for Claude, OpenCode, Kiro, and Pi with the project-context and installer test suites.
