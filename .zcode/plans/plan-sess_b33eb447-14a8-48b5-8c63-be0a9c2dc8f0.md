# Add a `--zcode` export target to install-skills.sh

## Approach

ZCode (the harness) has documented file-based discovery roots for skills (`~/.zcode/skills/` user scope, `<repo>/.zcode/skills/` workspace scope) but custom agents and hooks only function inside marketplace-installed plugins. Following the Codex-target precedent (and the installer's plain-files philosophy), `--zcode` does a **transformed file export**: skills → `groundwork-<name>` SKILL.md directories, agents → `review-<agent>` skills (the existing Pi-target conversion). No hooks, no statusline, no external runner, no model-override machinery — all consistent with the other non-Claude targets. The marketplace route (native parallel agents + partial hooks) gets a short "alternative" note in the README instead of code.

Key ZCode facts driving the design (verified against the official `zcode-guide` plugin docs and live plugin dirs):
- SKILL.md frontmatter: only `name` + `description` are honored; description must be ≤ 1024 chars; name should match the directory name. Unknown frontmatter keys are ignored (harmless), but we emit only name+description like the other targets.
- No `SubagentStop`/`PreCompact` hook events exist, and config-file hooks require editing the app-owned `~/.zcode/cli/config.json` — so hooks stay manual-setup, like every other export target.
- No user-scope agent definition files exist; agents only load from plugins — hence the Pi-style `review-<agent>` skill conversion.

## Changes

### 1. `install-skills.sh`
- `usage()` (~32–37, 94): add `--zcode` to the target list and an example.
- `parse_args()` (68–72): accept `--zcode`.
- `get_dest_base()` (256–275): `zcode)` → global `$HOME/.zcode`, project `.zcode` (installer only ever writes the `skills/` subtree of `~/.zcode`).
- `transform_frontmatter()` (373–382): include `zcode` in the `codex|kiro|pi` skill arm, **but emit `name:` as the installed name** (`groundwork-<name>`) so the frontmatter name matches the directory — ZCode's convention, and it avoids identity collisions with users' own skills.
- `transform_body()` (393–483): zcode flows through the generic non-Codex path (statusline lines auto-deleted at 403–405); add a small zcode-only sed block next to the Codex model-map block (409–422) that **neutralizes Claude model names** (`you are Sonnet or Opus` → top-tier reasoning model phrasing, `Recommended: Sonnet or Opus at high effort`, `` `/model sonnet` if on Haiku ``, `model: "opus"` in just-do-it-swarming). Exact wording finalized during implementation; word-boundary seds; the recurring sentences are boilerplate repeated across ~8 skills, so exact-phrase seds cover nearly all instances.
- Skill destination case (795–800): `zcode)` → `$dest_base/skills/$installed/SKILL.md`.
- Everything generic applies unchanged: template-var portable preamble (`--harness zcode`), select-project/validate script rewrites, `write_portable_references`, `write_portable_skill_resources`, per-skill `scripts/` copies. Codex-only steps (statusline body, `apply-codex-skill-policy`, runtime preamble, model-override, `write_codex_agent`) stay codex-only — zcode uses plain `write_file` like kiro/pi.
- `install_agents_for_target` (856–945): new `zcode)` case modeled on `pi)` (929–938) — dest `skills/review-<agent>/SKILL.md`, body component forced to `skill`, transformed frontmatter (name `review-<agent>`), portable references bundled into the review-skill dir. Mirror exactly how pi handles `validation-fixer`'s helper script.
- Summary: the existing "Hooks require manual setup" note covers zcode automatically (1048).
- No `install-config.txt` changes (fail-closed; same drops apply).

### 2. `lib/transform-agents.js`
- Add `zcode` to usage strings (5, 9). `installedRef`/`refLabel` defaults already produce `review-<name>` + "skill" — add zcode explicitly so it can't drift into the codex branch.
- Add zcode branches to `formatSingleAgent`/`formatMultipleAgents` with **delegation-first phrasing** (better than pi's "in sequence", since ZCode can spawn general-purpose subagents that load skills): single agent → "Delegate to a subagent: spawn a general-purpose subagent instructed to follow the `review-<name>` skill with this task:" + blockquoted prompt; parallel reviewers → "Spawn these in parallel as general-purpose subagents (each instructed to follow the named skill), or run them in sequence:" + bullets. Non-groundwork agents (e.g. `Plan`) use the generic default.

### 3. `lib/project-context-cli.js` + `lib/project-context.js`
- Add `zcode` to the harness allowlist (`project-context-cli.js:34`) and a zcode state-dir branch in `project-context.js` mirroring the kiro/pi pattern (keep per-harness state isolated; no `~/.claude` writes).

### 4. `tests/install-config.test.js`
- Add `zcode` to the leakage loop (312), the statusline routing map (436–442), and the project-context loop (793–796).
- New zcode invariant test (modeled on the codex agent test at 883–923): skills land at `.zcode/skills/groundwork-<name>/` with name+description-only frontmatter, name == directory name, description ≤ 1024 chars; every agent exported exactly once as `skills/review-<name>/SKILL.md`; no `${CLAUDE_PLUGIN_ROOT}`, `Skill(skill=`, `groundwork:`, `~/.claude`, or Sonnet/Opus/Haiku anywhere in output.
- `createAgentFixture` helper list unchanged (no new lib files).

### 5. Docs
- `README.md`: ZCode row in the Supported Targets table; "What Gets Installed" / "Cross-harness Limitations" updates; install example; short ZCode notes paragraph — including the alternative of adding this repo as a local-directory marketplace for native agents/hooks, and that a ZCode restart is needed after install.
- `AGENTS.md` + `CLAUDE.md` multi-target section: add `--zcode` and the agents-as-review-skills line.
- `docs/getting-started.md`: update only if it enumerates targets.

## Constraints & verification
- All installer code stays bash 3.2 + BSD sed safe (no associative arrays, no `;`-joined sed programs).
- Uncommitted WIP in `bin/groundwork-run.js` / `tests/groundwork-run.test.js` is left untouched.
- Verify with `bash tests/run-tests.sh` (new zcode suite runs automatically) plus a smoke install into a temp `HOME` (`HOME=$(mktemp -d) bash install-skills.sh --zcode --global`), checking the tree against ZCode's documented discovery/drop rules. The real `~/.zcode` install is offered afterwards, not done automatically.