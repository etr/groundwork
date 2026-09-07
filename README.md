# Groundwork

A comprehensive skills library for Claude Code and Codex, consolidating proven techniques for planning, design, TDD, debugging, collaboration, and problem-solving. Experimental exports are also available for OpenCode, Kiro, and Pi.

## Installation

### Via Marketplace

First, add the Groundwork marketplace:

```bash
claude plugin marketplace add https://github.com/etr/groundwork-marketplace
```

Then install the plugin:

```bash
claude plugin install groundwork
```

#### Update via Marketplace

```bash
claude plugin marketplace update groundwork-marketplace

claude plugin update groundwork
```

### Manual Installation

```bash
cd ~/.claude/plugins
git clone https://github.com/etr/groundwork.git
```

Or use the installer provided with the codebase.

### Multi-target Installer

Groundwork supports Claude Code and Codex. Exports for OpenCode, Kiro, Pi, and ZCode are experimental: the installer transforms Claude Code-specific constructs for those harnesses, but hooks, invocation, and skill chaining may not behave identically.

The included installer adapts Groundwork skills and agents to each target's native format. Claude Code users should normally use the marketplace; Codex users should use the installer.

#### Supported Targets

| Target | Flag | Maturity | Description |
|--------|------|----------|-------------|
| Claude Code | `--claude-code` | Supported | Recommends the marketplace install; an explicit opt-in allows a full plugin copy with no transformation |
| [Codex CLI](https://github.com/openai/codex) | `--codex` | Supported | Installs skills, native custom-agent TOML files with Codex model and reasoning settings, and the external task runner |
| [OpenCode](https://github.com/opencode-ai/opencode) | `--opencode` | Experimental | Installs transformed skills and standalone agent files |
| [Kiro](https://kiro.dev) | `--kiro` | Experimental | Installs transformed skills and JSON config + prompt file pairs for agents |
| Pi | `--pi` | Experimental | Installs transformed skills, `review-`prefixed agent skills, and a pre-built TypeScript extension (`pi-extension/`) |
| ZCode | `--zcode` | Experimental | Installs transformed skills to `~/.zcode/skills/` (or `.zcode/skills/`); agents become `review-`prefixed skills |
| ZCode (marketplace) | `--zcode-plugin` | Experimental | Plugin flavor for the managed marketplace: native `agents/*.md`, GLM model wording, filtered hooks — packaged by `build-zcode-marketplace.sh` |

##### Codex Agent Conversion

Codex agents are written to `.codex/agents/*.toml` for project installs (or
`~/.codex/agents/*.toml` globally). Claude model metadata maps as follows:

| Claude agent model | Codex model override |
|--------------------|----------------------|
| `sonnet` | `gpt-5.6-terra` |
| `opus[1m]` | `gpt-5.6-sol` |
| `inherit` or absent | No override; inherit the active Codex model |

Role-specific policy overrides that generic mapping. In particular, the
`task-executor` is exported as `gpt-5.6-sol` at high effort so implementation
does not inherit a weaker orchestration model.

Supported effort values (`low`, `medium`, `high`, and `max`) are preserved as
`model_reasoning_effort`; an absent effort is omitted. Unsupported model or
effort values stop the install with an explicit error so a silent fallback
cannot select an unintended model.

#### Codex Model Overrides

The Codex export can translate Groundwork's model policy without editing the
Claude-native source skills. Pass a JSON file with `--model-override`:

```bash
./install-skills.sh --codex --global --force \
  --model-override model-overrides/glm.json
```

The file has three logical tiers:

| Tier | Current default | Groundwork meaning |
|------|-----------------|--------------------|
| `light` | `gpt-5.6-luna` / Claude `haiku` | monitoring and lightweight work |
| `balanced` | `gpt-5.6-terra` / Claude `sonnet` | routine orchestration and bounded work |
| `deep` | `gpt-5.6-sol` / Claude `opus[1m]` | implementation, validation, security, and escalation |

A custom file may translate any subset of tiers and optionally force all
installer-controlled reasoning policies to one effort:

```json
{
  "effort": "max",
  "translation": {
    "light": "glm-5.3-flash",
    "balanced": "glm-5.3-flash",
    "deep": "glm-5.3"
  },
  "skills": {
    "validate": "glm-5.3"
  },
  "agents": {
    "task-executor": "glm-5.3"
  }
}
```

`translation` supplies the default actual model. Exact `skills` and `agents`
entries are exceptions and use canonical Groundwork IDs such as `validate` and
`task-executor`—not installed names such as `groundwork-validate`. A skill with
no installer-controlled model directive continues inheriting the active Codex
model; the installer rejects an exact override that would have no effect.

The builtin conversion itself is versioned as
`lib/codex-model-policy.json` and is the base policy for every install. A
`--model-override` file is only an overlay; it does not replace or deselect the
builtin validation rules.

The bundled `model-overrides/glm.json` uses only `glm-5.3` and
`glm-5.3-flash`, both at `max` effort; Flash handles both `light` and
`balanced`, while `glm-5.3` is reserved for `deep`. With Codex itself
configured for a GLM model, it prevents Groundwork's exported agent and
subagent directives from
selecting the built-in GPT models. It does not change unrelated Codex skills,
custom agents, or user configuration.

The option is Codex-only and must be the sole selected target. Existing files
changed by an override require `--force`. Use `--dry-run` to validate the file
and preview its effective values without writing output.

When installing Codex agents, the installer also removes the exact legacy
`.codex/skills/review-<bundled-agent>/SKILL.md` file for each bundled Groundwork
agent. It does not use a wildcard: unrelated `review-*` skills and any sidecar
files are preserved, and an empty legacy directory is removed.

#### ZCode Notes

There are two ZCode install paths.

**Managed marketplace (recommended).** A generated marketplace lives on the
[`zcode-marketplace` branch](https://github.com/etr/groundwork/tree/zcode-marketplace)
of this repository — the translated export packaged as a plugin with native
agents. In ZCode: **Settings → Plugin Management → Discover → `+`**, add
`etr/groundwork#zcode-marketplace`, then install **Groundwork**. Updates and
uninstall are handled by ZCode's plugin system. Rebuild the branch with:

```bash
bash build-zcode-marketplace.sh   # then push dist/zcode-marketplace to the branch
```

(CI republishes the branch automatically on every release.)

**File export.** `./install-skills.sh --zcode --global` installs transformed
skills to `~/.zcode/skills/` (`.zcode/skills/` for projects), each as a
`groundwork-<name>` directory whose frontmatter carries only `name` and
`description` (the fields ZCode honors; descriptions stay under its
1024-character limit). Because ZCode loads custom agents only from
marketplace-installed plugins, the file export ships agents as
`review-<agent>` skills and rewrites agent spawns into sub-task delegation.

Shared translation details: Claude model recommendations become concrete GLM
family recommendations — GLM with reasoning at max (GLM-Flash for the lighter
tier) — phrased as model-picker/settings actions, because ZCode has no
Claude-style `/model` or `/effort` commands. The marketplace flavor additionally
ships agents natively (`agents/*.md`, references inlined as appendices) and
hooks filtered to the seven events ZCode supports (SessionStart and PostToolUse
survive; SubagentStop and PreCompact have no ZCode equivalent).

#### Installation

Clone the repository and run the installer:

```bash
git clone https://github.com/etr/groundwork.git
cd groundwork
```

Install globally (available in all projects):

```bash
./install-skills.sh --codex --global
./install-skills.sh --zcode --global
```

Install for the current project only:

```bash
./install-skills.sh --opencode --project
```

You can install to multiple targets at once:

```bash
./install-skills.sh --codex --opencode --kiro --global
```

#### Installer Options

| Option | Description |
|--------|-------------|
| `--global` | Install to user-level config directory |
| `--project` | Install to current project directory |
| `--force` | Overwrite existing files |
| `--dry-run` | Preview actions without making changes |
| `--skills-only` | Install only skills (skip agents) |
| `--source DIR` | Groundwork source directory (default: auto-detect) |
| `--model-override FILE` | Apply a Codex-only model translation/exact-override JSON file |

#### What Gets Installed

- **Skills** — Workflow definitions (planning, TDD, debugging, etc.) are installed with a `groundwork-` prefix. On OpenCode, skill dependencies are automatically inlined as appendix sections.
- **Agents** — Verification and review agents (code quality, security, architecture alignment, etc.) are installed in each target's native agent format. On Pi and ZCode, agents are exported as `review-`prefixed skills because those harnesses load custom agents only from plugins.
- **Hooks** — Included in the Claude Code plugin. Transformed exports do not install equivalent harness hooks automatically.
- **Invocation** — Claude Code exposes `/groundwork:<name>` slash commands. Other harnesses discover the exported `groundwork-<name>` skills using their native skill interface.

#### Cross-harness Limitations

- Claude Code hooks (`SessionStart`, `PreCompact`, `PostToolUse`) are not portable and must be configured manually in other harnesses
- On OpenCode, complex multi-skill workflows may lose interactivity since skill dependencies are inlined as static appendix sections rather than invoked at runtime
- On ZCode, review agents run as `review-`prefixed skills (inline or via general-purpose subagents) rather than native custom agents; the invocation-tier frontmatter (`disable-model-invocation`, `user-invocable`) is not honored, so every exported skill is both model- and user-invocable
- Update checking is not available outside Claude Code

### Verify the Claude Code Installation

Restart Claude Code or start a new session. You should see:
- Start typing `/groundwork:`. It should show groundwork skills available

Run `/groundwork:groundwork-check` to validate the plugin installation.

## Dependencies

- **Required**: `node`, `python3`
- **Optional**: `gh` (GitHub CLI for PR workflows)

### Windows Users

Groundwork requires a Unix-like shell environment. Windows users should use one of:

- **WSL (Windows Subsystem for Linux)** - Recommended
- **Git Bash** - Included with Git for Windows

The plugin's shell scripts (`.sh` files) use bash and won't work directly in PowerShell or CMD.

**Troubleshooting Windows:**

| Issue | Solution |
|-------|----------|
| "bash not found" | Install Git Bash or WSL |
| Hook scripts fail | Run Claude Code from WSL/Git Bash terminal |
| Path errors | Use forward slashes in paths, not backslashes |
| Line ending issues | Configure git: `git config --global core.autocrlf input` |

## Quick Start

### Greenfield Project

Full planning-to-implementation workflow:

```
/groundwork:design-product           # Define requirements (PRD with EARS format)
/groundwork:design-architecture      # Design technical approach and decisions
/groundwork:ux-design                # Establish design system (for UI projects)
/groundwork:create-tasks             # Generate implementation tasks
/groundwork:work-on-next-task        # Start executing tasks with TDD
```

### Quick Feature

Skip formal planning and go straight to building:

```
/groundwork:build-unplanned Add user avatar upload with image resizing
```

### Monorepo Project

Set up a monorepo and start planning for a specific project:

```
/groundwork:setup-repo               # Detect monorepo, create .groundwork.yml
/groundwork:select-project           # Choose which project to work on
/groundwork:design-product           # Define requirements for selected project
```

### Existing Codebase

Analyze existing code to generate initial specifications:

```
/groundwork:design-product           # Analyzes codebase to propose PRD
```

## Skills

Every Groundwork capability is a skill. The examples below use Claude Code's slash syntax: `/groundwork:<name>` (the prefix can be omitted if no other plugin uses the same name). Codex and the experimental exports install applicable capabilities as `groundwork-<name>` skills for native discovery and invocation. Some skills are also invoked automatically by the model when relevant, and a few low-level "library" skills are used only by other skills (not listed below).

### Planning Skills

Define what to build and how to build it.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:design-product` | `[product-name]` | Create or update PRD with EARS requirements | Starting a new project or adding features |
| `/groundwork:design-architecture` | `[feature-name]` | Design technical architecture with decision records | After PRD exists, need technical design |
| `/groundwork:swarm-design-architecture` | `[feature-name]` | Parallel adversarial architecture design with agent teams | Multiple viable tech options, need balanced comparison |
| `/groundwork:ux-design` | `[product-name]` | Establish design system — foundations, brand, UX patterns | Need visual/UX consistency for UI projects |
| `/groundwork:create-tasks` | `[filter]` | Generate implementation tasks from PRD + architecture | After specs exist, ready to plan implementation |
| `/groundwork:setup-repo` | — | Configure repo — detect single-project or monorepo | First time using Groundwork in a repo |

### Design & Engineering Techniques

Sharpen a design or de-risk an approach before committing to it.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:domain-modeling` | — | Build and maintain a pure domain glossary | Project lacks shared, agreed terminology |
| `/groundwork:design-it-twice` | — | Generate 2–3 divergent interface designs and compare on depth/locality/seam | Before committing to a non-trivial module, service boundary, or public API |
| `/groundwork:doubt-driven-development` | — | Adversarially refute the chosen approach before building | High-stakes/hard-to-reverse change — migrations, auth, payments, destructive ops |
| `/groundwork:vertical-slice` | — | Structure work as thin, end-to-end, independently-shippable slices behind a flag | Feature large enough to span multiple layers |

### Implementation Skills

Execute tasks and build features.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:work-on` | `[task-number]` | Execute a specific task with worktree isolation and TDD | Want to work on a specific task by number |
| `/groundwork:work-on-next-task` | — | Execute the next unblocked task automatically | Working through tasks sequentially |
| `/groundwork:plan-task` | `[task-number-or-description]` | Plan a task or feature without implementing | Want to review a plan before committing to implementation |
| `/groundwork:implement-task` | `[task-number-or-plan-path]` | Implement a previously planned task | Resume implementation after reviewing a plan |
| `/groundwork:just-do-it` | — | Execute all remaining tasks in dependency order | Want batch execution inside the current session |
| `/groundwork:just-do-it-swarming` | `[--parallel]` | Execute all tasks using agent teams for context isolation | Large batches where context accumulation is a concern |
| `/groundwork:build-unplanned` | `[description]` | Build feature from description — no task definitions needed | Quick feature without formal planning |
| `/groundwork:select-project` | `[project-name]` | Switch to a different project in a monorepo | Working across multiple projects |

### Debugging Skills

Investigate and resolve issues systematically.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:debug` | `[bug description]` | Systematic 5-phase debugging workflow | Investigating bugs or test failures |
| `/groundwork:swarm-debug` | `[bug description]` | Parallel hypothesis investigation with agent teams | Multiple plausible root causes, needs adversarial testing |

### Verification Skills

Validate code quality and spec alignment.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:validate` | — | Re-run 9-agent verification on current changes | Verify code quality after manual changes |
| `/groundwork:finalize-task` | `[task-id] [--project name]` | Commit, merge, and clean up a validated task worktree | Completing the workflow manually phase by phase |
| `/groundwork:check-specs-alignment` | `[context]` | Audit code alignment with PRD and architecture | Periodic drift detection |

### Review Skills

Review pull requests with multi-agent analysis. Requires `gh` (GitHub CLI).

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:review-pr` | `[PR# or URL] [--no-interactive]` | Multi-agent PR review with inline GitHub comments | Reviewing PRs before merge |

### Shipping Skills

Make a change observable and roll it out safely.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:instrument-observability` | — | Add structured logging, RED metrics, trace spans, and symptom-based alerts | While building a change, before an incident proves it was unobservable |
| `/groundwork:staged-rollout` | — | Roll out behind a feature flag with a monitoring window and written rollback plan | Before shipping anything user-facing |
| `/groundwork:ship` | — | Sequence observability + staged rollout behind a final go/no-go gate | Ready to ship a validated change to production |

### Synchronization Skills

Keep specs in sync with what was actually built. Run these at the end of a session when implementation diverged from the original plan.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:source-product-specs-from-code` | `[files...]` | Update PRD to reflect implementation changes | After product decisions during implementation |
| `/groundwork:source-architecture-from-code` | `[files...]` | Update architecture docs with new decisions | After architectural changes during implementation |
| `/groundwork:source-ux-design-from-code` | `[files...]` | Update design system with token/pattern changes | After design changes during implementation |
| `/groundwork:split-specs` | — | Convert single-file PRD into directory format | PRD has grown large (auto-triggered at 500+ lines or 15+ features) |
| `/groundwork:split-architecture` | — | Convert single-file architecture doc into directory format | Architecture doc has grown large (auto-triggered at 500+ lines or 10+ DRs) |

### Utility Skills

Plugin management and reference.

| Skill | Args | Description | When to Use |
|---------|------|-------------|-------------|
| `/groundwork:handoff` | `[focus]` | Produce a compact handoff document transferring context, state, and next objective | Ending a session or passing work to another agent |
| `/groundwork:skills` | — | List all available Groundwork skills | Discovering available capabilities |
| `/groundwork:groundwork-check` | — | Validate plugin installation | Troubleshooting issues |
| `/groundwork:groundwork-help` | — | Show all skills | Quick reference |

## Model Recommendations

Skills vary in complexity. The table below lists the minimum model tier recommended for each skill. Running a skill below its recommended tier may produce lower-quality results or hit context limits.

| Tier | Minimum Model | Skills |
|------|---------------|----------|
| **Opus (1M)** | Opus at high effort | `/groundwork:design-product`, `/groundwork:design-architecture`, `/groundwork:ux-design`, `/groundwork:create-tasks`, `/groundwork:debug`, `/groundwork:swarm-debug`, `/groundwork:swarm-design-architecture`, `/groundwork:design-it-twice`, `/groundwork:doubt-driven-development` |
| **Sonnet+** | Sonnet or Opus at high effort | `/groundwork:work-on`, `/groundwork:work-on-next-task`, `/groundwork:just-do-it`, `/groundwork:just-do-it-swarming`, `/groundwork:build-unplanned`, `/groundwork:validate`, `/groundwork:finalize-task`, `/groundwork:check-specs-alignment`, `/groundwork:review-pr`, `/groundwork:source-product-specs-from-code`, `/groundwork:source-architecture-from-code`, `/groundwork:source-ux-design-from-code`, `/groundwork:domain-modeling`, `/groundwork:vertical-slice`, `/groundwork:instrument-observability`, `/groundwork:staged-rollout`, `/groundwork:ship` |
| **Any** | No requirement | `/groundwork:setup-repo`, `/groundwork:select-project`, `/groundwork:handoff`, `/groundwork:skills`, `/groundwork:groundwork-help`, `/groundwork:groundwork-check` |

## Workflows

### Greenfield Project

Full planning through implementation with continuous synchronization:

```
/groundwork:design-product              # 1. Define requirements
/groundwork:design-architecture         # 2. Design technical approach
/groundwork:ux-design                   # 3. Establish design system (UI projects)
/groundwork:create-tasks                # 4. Generate task list
/groundwork:work-on-next-task           # 5. Execute tasks one by one (repeat)
/groundwork:source-product-specs-from-code   # 6. Sync specs if implementation diverged
/groundwork:source-architecture-from-code    # 7. Sync architecture if decisions changed
```

### Adding Features to an Existing Project

Incrementally update specs, implement, then sync:

```
/groundwork:design-product              # Update PRD with new feature requirements
/groundwork:design-architecture         # Update architecture for new components
/groundwork:create-tasks                # Generate tasks for the new feature
/groundwork:work-on-next-task           # Execute tasks
/groundwork:source-product-specs-from-code   # Sync any implementation-time decisions
```

### Plan Then Implement (Split Workflow)

Plan a task first, review the plan, then implement separately:

```
/groundwork:plan-task 4                 # Plan task 4, saves to .groundwork-plans/
# ... review the plan, adjust if needed ...
/groundwork:implement-task 4            # Implement using the saved plan
/groundwork:validate                    # Validate and fix the task worktree
/groundwork:finalize-task 4             # Commit remaining fixes, merge, and clean up
```

Also works for ad-hoc features:

```
/groundwork:plan-task "Add SSO login"   # Plan from a description
/groundwork:implement-task .groundwork-plans/FEATURE-sso-login-plan.md
```

### Quick Unplanned Feature

Skip planning entirely — go straight to TDD:

```
/groundwork:build-unplanned Add password strength indicator to signup form
```

This gathers requirements inline, implements with TDD in a worktree, runs verification agents, and merges back.

### Debugging

Systematic 5-phase investigation:

```
/groundwork:debug Login fails silently when session cookie is expired
```

Phases: Observe → Hypothesize → Predict → Test → Conclude. No fix is applied until the root cause is confirmed.

### Batch Execution

Execute all remaining tasks in dependency order inside the current conversation:

```
/groundwork:just-do-it
```

All task phases run inline. This remains useful for small batches and interactive oversight.

### External Task Runner

The external runner is a start-once completion harness for Claude Code and Codex. Give it one or more implementation tasks, a range, or all remaining tasks; it creates an isolated linked worktree for each selected task and drives `plan-task → implement-task → validate → finalize-task` until the work is implemented, validated, integrated, and marked complete.

The runner is valuable when work should continue unattended. Fresh processes keep phase context focused, durable checkpoints make interrupted runs resumable, repair sessions handle recoverable failures, and verified Git handoffs prevent a model's claim of success from being treated as proof. Read-only status and logs expose phase progress, validation rounds, reviewer state, and credential-redacted diagnostics while it runs.

Use the runner for well-specified tasks when you want hands-off completion, repeatable validation, or a batch processed in dependency order. Use the same skills manually when requirements or architecture still need discussion, you want to approve each phase, or the change is small enough that an interactive session is simpler. The runner can commit and merge completed task work into the local base branch, so start it only when that workflow is intended.

Each phase runs in a fresh Claude Code or Codex process with the harness's native session persistence enabled. Groundwork passes compact receipts and verified Git state between phases; it neither disables native memory nor copies memory between harnesses.

#### Usage

```bash
node /path/to/groundwork/bin/groundwork-run.js task TASK-004 --harness claude
node /path/to/groundwork/bin/groundwork-run.js task TASK-004 TASK-009 TASK-012 --harness codex
node /path/to/groundwork/bin/groundwork-run.js all --harness codex
node /path/to/groundwork/bin/groundwork-run.js all --from TASK-010 --to TASK-025 --harness codex
node /path/to/groundwork/bin/groundwork-run.js all --harness codex --project api --dry-run
node /path/to/groundwork/bin/groundwork-run.js all --harness codex --revalidate-if-merge-conflicts
node /path/to/groundwork/bin/groundwork-run.js status TASK-005 --project api
node /path/to/groundwork/bin/groundwork-run.js logs TASK-005 --project api --tail 40 --follow
```

Run the repository's `bin/groundwork-run.js` with either harness. Codex exports also install it at `~/.codex/groundwork-run.js` for user scope or `.codex/groundwork-run.js` for project scope. The runner creates each linked task worktree before planning and runs every phase from its project root. It repeatedly chooses the lowest-numbered currently unblocked task, so dependency constraints take precedence and numeric priority breaks ties. When any phase invocation, receipt, or handoff fails, a fresh repair session receives the diagnostic, fixes the current selected-task worktree, and the runner retries that same phase. Repair changes remain for the retried phase and its normal commit flow; recovery creates no snapshots, rollback transaction, special commit, or repository-wide boundary comparison. Repair sessions never publish.

Range bounds are inclusive; either `--from` or `--to` may be used alone. Dependencies outside a selected list or range must already be complete. Default output is semantic: phase transitions, validation stages, named gate outcomes, repair summaries, next actions, and a heartbeat tied to the last known semantic state. Add `--verbose` to show sanitized commands and selected tool activity. Generic turn events and successful short-command completions remain suppressed; command failures and commands lasting at least 10 seconds remain visible.

Each task has three append-only artifacts under `<git-common-dir>/groundwork/reporting/<project-hash>/TASK-NNN/`: `runner.log` is the concise human timeline, `events.jsonl` is the versioned lifecycle journal, and `transcript.jsonl` records bounded credential-redacted activity, user-visible phase-agent messages, reviewer batches, semantic markers, and tool output without persisting raw provider events or hidden reasoning. `groundwork-run status TASK-NNN [--project NAME]` combines the newest runner event with the identity-bound validation session to show the validation round, stage, and per-reviewer state. `groundwork-run logs TASK-NNN [--tail N] [--follow]` renders the diagnostic transcript; successful tool output is hidden unless `--include-tool-output` is requested. Both commands are read-only and acquire no runner lease.

Rerunning is resumable. An existing conventional plan skips planning. An exact registered clean task worktree whose task is already `In Progress` or `Complete` skips implementation; dirty or ambiguous worktrees are passed back to `implement-task` in resume mode. Successful validation is checkpointed against the plan hash, base head, task head, branch, worktree, and project. Validation is skipped only while those proofs still match (or only verified completion bookkeeping was added). Checkpoints live under the Git common directory at `<git-common-dir>/groundwork/runner/`, do not dirty the repository, and are removed after a successful merge.

In monorepos, runner-created workspaces are project-qualified (for example, `task/api/TASK-004` and `.worktrees/api-TASK-004`) so projects may reuse task numbers. The runner does not inspect or compare unrelated worktree contents. Legacy unqualified worktrees remain resumable when their project checkpoint identifies the owner.

Multiple runner commands may be launched against the same repository. A project lease serializes complete tasks for one project, while different projects may execute model phases concurrently. Startup reads, model phases, and repair phases use a writer-preferred repository reader gate. Linked-worktree registration adds a short registry mutex, so another project can start while a model phase is active without exposing a half-created workspace. Publication and worktree removal remain writer-exclusive; wait diagnostics identify the holder. If another project advances the base, the stale task integrates it during finalization and continues to publication by default.

When upgrading to this parallel runner, first stop and drain every older runner process and launcher for the repository, then install and start the new version. Running the predecessor and v2 together is unsupported: v2 rejects a detected live `groundwork/runner.lock`, but that startup check cannot prevent an old launcher from starting afterward. Once the upgrade is drained, v2 runners may safely use their repository gate together.

In runner mode, agents leave prepared changes and return token-bound JSON receipts containing expressive commit and merge messages. The runner verifies the worktree and Git parents, creates every commit, and performs the outward merge. If the base branch advances, `finalize-task` prepares its integration without committing and reports whether conflicts were resolved. The runner seals that integration, invokes finalization again, performs the outward merge, and cleans up without repeating validation. Add `--revalidate-if-merge-conflicts` to repeat validation only when the base merge actually reported conflicts; clean base integration never revalidates.

The same four skills remain manually callable. Manual `finalize-task` still commits remaining validated work, merges into the base branch, and cleans up. In a monorepo, pass `--project <name>` to each phase.

#### Isolation boundary

The runner isolates each selected task in a linked worktree. It does not snapshot, roll back, or police other worktrees after a phase or repair session. Scoped leases still order runners that share Git state, and phase handoffs verify the selected task worktree and commit/merge results. Use OS sandboxing or private clones when hostile-process isolation is required.

### Swarming Mode (Claude Code only)

For parallel task execution, use swarming mode to run each task in its own agent-team session:

```
/groundwork:just-do-it-swarming
```

Each task is assigned to an agent team teammate — a full Claude Code session with its own context window that can spawn subagents (Plan, task-executor, 9 validation agents). This prevents context accumulation in the lead's conversation.

For independent tasks, enable parallel execution:

```
/groundwork:just-do-it-swarming --parallel
```

Parallel mode groups tasks by dependency level and runs independent tasks simultaneously (max 5 concurrent). Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to be enabled:

```json
// settings.json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### Swarm Debugging (Claude Code only)

When a bug has multiple plausible root causes, spawn an agent team to investigate hypotheses in parallel:

```
/groundwork:swarm-debug Login fails silently when session cookie is expired
```

Each teammate investigates a different hypothesis and actively tries to disprove the others. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` to be enabled — falls back to standard debugging otherwise.

### Verification

Check quality and alignment at any point:

```
/groundwork:validate                    # Run all 9 verification agents
/groundwork:check-specs-alignment       # Audit drift between code and specs
```

### PR Review

Review a pull request with 6-8 specialized agents:

```
/groundwork:review-pr 42
```

Agents (code quality, test quality, security, performance, simplifier, housekeeper — plus architecture and design consistency when specs exist) run in parallel. Findings are deduplicated and posted as a single atomic review to GitHub with inline comments. Supports incremental reviews when previous Groundwork reviews exist.

For CI or batch pipelines:

```
/groundwork:review-pr 42 --no-interactive
```

## Monorepo Support

Groundwork supports monorepos — repositories containing multiple projects, each with their own specs and tasks.

### Setup

Run `/groundwork:setup-repo` to configure your repository. Groundwork detects common monorepo patterns (workspace configs, `apps/`, `packages/`, `services/` directories) and asks you to confirm the structure. For monorepos, it creates a `.groundwork.yml` configuration file at the repo root.

### Configuration File

```yaml
version: 1
projects:
  web-app:
    path: apps/web-app
  api-server:
    path: services/api
  shared-lib:
    path: packages/shared
```

### Switching Projects

Use `/groundwork:select-project` to switch between projects. This sets the active project context so all planning, implementation, and sync skills operate on the correct project. Selection persists across sessions.

You can also pass a project name directly: `/groundwork:select-project api-server`

### How It Works

- Specs are stored per-project: `<project-path>/specs/`
- All planning, implementation, and sync skills are monorepo-aware
- Project selection persists per terminal pane in the active harness's state directory (for example, `$CODEX_HOME/groundwork-state` or the corresponding Claude, OpenCode, Kiro, or Pi home). Tmux identity comes from stable environment metadata, so Codex keeps tabs isolated even when its sandbox cannot access the tmux server socket.
- Exported skills use their bundled resolver to derive the active project name, project root, and specs directory from that harness-scoped selection

## Internals

For contributors and curious users — how the plugin works under the hood.

### Agents

Agents are specialized sub-processes that run verification and validation tasks. They are invoked automatically by skills like `validate`, `task-validation-loop`, and `review-pr`.

#### Implementation Verification (11 agents)

These run after task implementation via the `validate` skill:

| Agent | Description |
|-------|-------------|
| `code-quality-reviewer` | Reviews code for quality, readability, elegance, and test coverage |
| `conventions-reviewer` | Reviews changes against project-specific conventions documented in `CLAUDE.md` files |
| `test-quality-reviewer` | Reviews test quality — structural correctness, coverage completeness, redundancy, best practices |
| `security-reviewer` | Reviews for security vulnerabilities — OWASP Top 10, input validation, auth issues |
| `spec-alignment-checker` | Verifies implementation aligns with task definition and product specs |
| `architecture-alignment-checker` | Verifies implementation aligns with architecture decisions and technology choices |
| `code-simplifier` | Simplifies code for clarity and maintainability while preserving functionality |
| `housekeeper` | Verifies housekeeping — task status updates, action items, documentation changes |
| `performance-reviewer` | Reviews for performance issues — algorithmic complexity, memory, I/O |
| `cloud-infrastructure-reviewer` | Reviews cloud infrastructure-as-code against Well-Architected best practices — IAM, encryption, network segmentation, reliability, cost, provider-specific checks for AWS/Azure/GCP, and IaC anti-patterns |
| `design-consistency-checker` | Verifies design system compliance — tokens, accessibility, interaction quality, UX writing, pattern consistency |

#### Task Validation (3 agents)

These run after task list creation via the `task-validation-loop` skill:

| Agent | Description |
|-------|-------------|
| `prd-task-alignment-checker` | Validates task list covers all PRD requirements |
| `architecture-task-alignment-checker` | Validates tasks follow architecture decisions and patterns |
| `design-task-alignment-checker` | Validates UI/frontend tasks include design tokens and accessibility |

#### Architecture Validation (1 agent)

| Agent | Description |
|-------|-------------|
| `prd-architecture-checker` | Validates architecture proposals cover all PRD requirements and NFRs |

#### Task Execution (1 agent)

| Agent | Description |
|-------|-------------|
| `task-executor` | Executes task implementation with worktree isolation, TDD, and skill preloading |

#### Validation Fixing (1 agent)

| Agent | Description |
|-------|-------------|
| `validation-fixer` | Fixes findings from reviewer agents — TDD for behavioral fixes, direct changes for cosmetic ones; reports files touched and findings addressed |

#### Research (1 agent)

| Agent | Description |
|-------|-------------|
| `researcher` | Researches technologies and patterns before architecture decisions or task planning |

### Hooks

Hooks are event-driven automations that fire at specific points in the Claude Code lifecycle:

| Hook | Event | Description |
|------|-------|-------------|
| Session Start | `SessionStart` | Detects project state, loads skill context, checks for updates (1x/day) |
| Pre-Compact | `PreCompact` | Preserves critical skill state before context compaction |
| Commit Alignment | `PostToolUse` (on `git commit`) | Verifies commits align with specs and task definitions |
| Agent Output | `SubagentStop` | Validates agent output format |

## Configuration

### Update Checking

The plugin checks for updates once per day (throttled) and shows a notification if updates are available. Update by running:
```bash
cd ~/.claude/plugins/groundwork && git pull
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GROUNDWORK_SKIP_UPDATE_CHECK` | 0 | Set to 1 to skip update checking |

See `docs/hooks-configuration.md` for full documentation.

## Attribution

This plugin has sourced learnings and code from multiple sources:

### Superpowers
- **[superpowers](https://github.com/obra/superpowers)** by Jesse Vincent
  - The `using-groundwork` skill is based on the [using-superpowers skill](https://github.com/obra/superpowers/blob/main/skills/executing-plans/SKILL.md)
  - The general plugin structure and patterns were learned from studying this project

### Official Claude Plugins
- **[claude-plugins-official](https://github.com/anthropics/claude-plugins-official)** by Anthropic
  - claude-md-management plugin

### Impeccable
- **[impeccable](https://github.com/pbakaus/impeccable)** by Paul Bakaus ([impeccable.style](https://impeccable.style))
  - License: Apache 2.0 (itself based on Anthropic's [frontend-design skill](https://github.com/anthropics/skills/tree/main/skills/frontend-design))
  - The design system skill's reference guides for color & contrast, interaction design, motion design, spatial design, typography, and UX writing are adapted from Impeccable's domain-specific reference files
  - The design consistency checker agent's interaction quality, UX writing quality, and expanded accessibility checks are derived from these references

### Research Methodology
- **[get-shit-done](https://github.com/glittercowboy/get-shit-done)** by glittercowboy
  - The researcher agent's "Training as Hypothesis" guidance is adapted from this project's research methodology

## License

MIT License - See [LICENSE](LICENSE) for details.
