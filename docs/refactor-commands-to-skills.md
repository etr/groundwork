# Refactor Plan: Collapse Commands into Skills

**Status:** ✅ Executed. Installer config fully reconciled (option a). Validator clean
(0 errors). Kept as a record of the restructure rationale.
**Goal:** Express every Groundwork capability as a single skill under `skills/`, namespaced
`groundwork:<name>`, eliminating the parallel `commands/` layer. Invocation behavior is
controlled entirely by frontmatter dials.

## Decisions captured

1. **Canonical names = command names.** The user-facing slash name stays whatever the command
   was called (`/groundwork:debug`, `/groundwork:work-on`, …). Underlying skills are renamed to
   match. This keeps the public surface and all existing `/groundwork:*` references stable.
2. **Mechanical only.** Move bodies, set dials, fix references, update validator + docs. No
   workflow content changes, no merging of overlapping variants.
3. **Library tier hidden.** Low-level bearing skills are `user-invocable: false` — off the slash
   menu, still callable by other skills via the `Skill` tool.

## Invocation mechanics (confirmed against current Claude Code)

| Frontmatter | User slash menu | Model auto-trigger | Callable by other skills (`Skill` tool) |
|---|:--:|:--:|:--:|
| *(defaults)* | ✅ | ✅ | ✅ |
| `disable-model-invocation: true` | ✅ | ❌ | ❌ (blocks programmatic calls too) |
| `user-invocable: false` | ❌ | ✅ | ✅ |

**Key constraint:** `disable-model-invocation: true` also blocks other skills from calling the
skill programmatically. So "user-only, no model" can only go on **leaf** skills (nothing in the
orchestration graph invokes them). Skills in the dependency chain must stay model-invocable.

Skills support the same `$ARGUMENTS`/`$1`, `allowed-tools`, `argument-hint`, `model` frontmatter
and the same `{{specs_dir}}` / `{{effort_level}}` templating as commands (handled by
`lib/resolve-template-vars.js`), so command bodies port over unchanged.

## Tier assignment

### Tier A — leaf user workflows → `disable-model-invocation: true`
Created fresh from the 17 full-content commands (body moved into `skills/<name>/SKILL.md`):

`build-unplanned`, `check-specs-alignment`, `create-tasks`, `design-product`, `ux-design`,
`groundwork-check`, `groundwork-help`, `skills`, `review-pr`, `just-do-it`,
`just-do-it-swarming`, `swarm-debug`, `swarm-design-architecture`,
`source-product-specs-from-code`, `source-architecture-from-code`,
`source-ux-design-from-code`, `work-on-next-task`

These are entry points; nothing else calls them, so blocking model-invocation is safe and
preserves their current user-only behavior.

### Tier B — chain skills, dual-invocable → `user-invocable: true` (no model block)
Renamed from existing skills (forwarder command deleted). They're invoked programmatically by
other skills and/or were already model-invocable, so they **cannot** carry
`disable-model-invocation`. (Confirmed `split-architecture`/`split-specs` belong here:
`split-architecture-doc` is invoked by the `architecture` skill + `source-architecture-from-code`;
`split-specifications` by `design-product` + `source-product-specs-from-code` — so they're kept,
not eliminated, and must stay model-invocable.)

| Old skill dir | New name (= command) |
|---|---|
| `debugging` | `debug` |
| `architecture` | `design-architecture` |
| `task-planning` | `plan-task` |
| `task-implementation` | `implement-task` |
| `execute-task` | `work-on` |
| `validation-loop` | `validate` |
| `project-selector` | `select-project` |
| `repo-setup` | `setup-repo` |
| `split-architecture-doc` | `split-architecture` |
| `split-specifications` | `split-specs` |

> `split-architecture`/`split-specs` are leaf and could be Tier A, but they're tiny and currently
> `user-invocable: true`; left model-invocable to minimize behavior change. Flag if you'd rather
> make them user-only.

### Tier C — hidden library → `user-invocable: false`
Kept as-is (no command exists); called only by other skills:

`test-driven-development`, `understanding-feature-requests`, `use-git-worktree`,
`using-groundwork`, `task-validation-loop`

**Result:** 32 skills total (15 existing + 17 new), zero commands. 17 are strictly user-only,
10 are dual, 5 are hidden library.

## Reference rewrites (global, across all skill bodies)

Programmatic `Skill(skill="groundwork:OLD")` and in-text `groundwork:OLD` references:

| Old | New |
|---|---|
| `groundwork:project-selector` | `groundwork:select-project` |
| `groundwork:repo-setup` | `groundwork:setup-repo` |
| `groundwork:task-planning` | `groundwork:plan-task` |
| `groundwork:task-implementation` | `groundwork:implement-task` |
| `groundwork:validation-loop` | `groundwork:validate` |
| `groundwork:execute-task` | `groundwork:work-on` |
| `groundwork:split-architecture-doc` | `groundwork:split-architecture` |
| `groundwork:architecture` | `groundwork:design-architecture` |
| `groundwork:debugging` | `groundwork:debug` |

Unchanged (Tier C names stay): `test-driven-development`, `understanding-feature-requests`,
`use-git-worktree`, `using-groundwork`, `task-validation-loop`. Agent references
(`groundwork:researcher:researcher`, `groundwork:task-executor:task-executor`, the reviewers)
are **not** skills and stay untouched.

`requires:` fields:
- `work-on` (was `execute-task`): `requires: plan-task, implement-task, validate`
- `plan-task` (was `task-planning`): `requires: understanding-feature-requests` (unchanged)

In-text slash references (`/groundwork:work-on`, `/groundwork:create-tasks`, …) already use
command names and stay valid. Only the few in-text bare `groundwork:execute-task` mentions (e.g.
`build-unplanned` "use groundwork:execute-task instead", `execute-task` self-references) follow
the rename table above.

## `lib/validate-plugin.js` changes

1. Extend skill `allowedFields` (line 50) to:
   `['name', 'description', 'requires', 'user-invocable', 'disable-model-invocation', 'allowed-tools', 'argument-hint', 'model']`
2. Move the `allowed-tools` empty-check and `argument-hint` check (currently gated on
   `/commands/`, lines 78–101) to apply to skill files, since that's where these fields now live.
3. Relax the description-format warning (lines ~55–58): skills are now user-facing slash entries,
   so the third-person "This skill should be used when…" requirement is dropped (or downgraded to
   accept the concise "… Usage /groundwork:x" command style).
4. Remove the now-dead `dir.includes('commands')` branch in `checkDirectory` (line 169) — the
   `commands/` directory no longer exists.

## Frontmatter format for new (Tier A) skills

Port command frontmatter to skill form — drop the `groundwork:` prefix from `name` (the namespace
comes from the plugin, matching existing skills), keep the rest:

```yaml
---
name: build-unplanned
description: Build a feature from description with worktree isolation and TDD. Usage /groundwork:build-unplanned "Add user login"
argument-hint: "[feature-description]"
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "Grep", "Task", "Skill", "AskUserQuestion"]
disable-model-invocation: true
---
```

## Docs & metadata

- `CLAUDE.md`: line 7 "32 skills and 27 commands" → "32 skills"; update Project Structure tree
  (drop `commands/`), Component Formats (fold command format into skill format + document the
  invocation dials), and the "Adding a New Skill" section.
- `docs/developing-skills.md`: extend the frontmatter-fields table with `user-invocable`,
  `disable-model-invocation`, `allowed-tools`, `argument-hint`, `model`.
- `docs/command-comparison.md` → **rename to `docs/skill-comparison.md`**. Slash names are
  preserved so the comparison content stays accurate; reframe "command" wording to "skill".
- `.claude-plugin/plugin.json`: bump version `2.1.0` → **`3.0.0`** (breaking restructure).
- Grep `references/` and `hooks/` for any stale `groundwork:<old-skill>` mentions and apply the
  rename table.

### README.md
- Reframe the **"Commands"** section (line ~175 "Commands are what you type…") as **"Skills"** —
  the slash names in every table are preserved, only the surrounding "command" wording changes.
- Line ~95 (installer notes: "**Commands** — Not applicable…") and line ~106 ("show all
  groundwork commands available") — reword to skills.
- Sweep remaining "command(s)" prose (lines ~113, ~175, ~423, ~430) → "skill(s)" where it refers
  to Groundwork entry points (leave genuine references to `gh`/git CLI commands alone).

### Doc-generating skills (`groundwork-help`, `skills`)
These scan directories at runtime, so they must stop scanning `commands/`:
- `groundwork-help`: drop step "Scan `${CLAUDE_PLUGIN_ROOT}/commands/`"; scan only `skills/`.
  Reframe the "commands organized by purpose" output as skills, grouped by tier
  (user workflows / chain / hidden library). Update the hardcoded `/groundwork:*` example list.
- `skills`: already scans `skills/` only — verify wording, no functional change.

### Installer subsystem (`install-skills.sh` + `install-config.txt`)  ⚠️ non-trivial
Post-refactor there is no `commands/` directory, so the installer's command-sourced path
(`command:<slug>` entries, `commands/<slug>.md` reads, the `command` flag, `HAS_COMMAND` /
`COMMAND_MAP` machinery, `install_commands_for_target`) becomes dead and must be collapsed to a
flat **skill → installed-name** map.

> **Heads-up — `install-config.txt` is already stale.** Its skill-sourced LHS names (`tasks`,
> `product-design`, `sync-architecture`, `sync-specs`, `sync-design-system`, `design-system`,
> `next-task`, `validation-loop`, `execute-task`, `project-selector`, `repo-setup`, …) reflect a
> *pre-merge* skill layout that no longer matches `skills/`. This refactor is a good moment to
> reconcile it to the new 32-skill set, but it's more than a mechanical edit — see open item below.

## Execution order

1. Rename the 10 Tier-B skill dirs; clear their `user-invocable: false`, set the new names.
2. Create the 17 Tier-A skill dirs from command bodies with ported frontmatter.
3. Set Tier-C `user-invocable: false` (already set — verify).
4. Apply the global reference-rewrite table across all skill bodies + `requires:` fields.
5. `rm -rf commands/`.
6. Update `lib/validate-plugin.js`, `CLAUDE.md`, `docs/` (incl. rename to `skill-comparison.md`),
   `README.md`, the `groundwork-help`/`skills` doc-generators, `plugin.json`.
7. Rework `install-skills.sh` + `install-config.txt` to the unified skill model (collapse the
   command-sourced path; reconcile stale LHS names to the new 32-skill set).
8. Run `node lib/validate-plugin.js` — expect clean.
9. Spot-check: each renamed `Skill()` target resolves; no dangling `groundwork:<old>` refs
   (`grep -rn "groundwork:\(architecture\|debugging\|execute-task\|task-planning\|task-implementation\|validation-loop\|project-selector\|repo-setup\|split-architecture-doc\|split-specifications\)" skills/`).
10. Run the installer against a scratch dir for one non-Claude target (e.g. `--codex --project`)
    to confirm it still produces skills without the `commands/` path.

## Resolved sign-off items

- **`split-architecture` / `split-specs`:** kept, Tier B (dual-invocable) — they're called by
  other skills, so not eliminated and not user-only. ✅
- **`plugin.json` version:** bump to `3.0.0`. ✅
- **Rename `command-comparison.md` → `skill-comparison.md`** and align README + all doc functions
  (groundwork-help, skills, installer). ✅

## Remaining open item

- **`install-config.txt` reconciliation.** It currently maps *pre-merge* skill names that no
  longer exist. Two options for execution:
  - **(a) Full reconcile** — rewrite it to the new 32-skill set with correct `groundwork-<name>`
    installed names. Cleanest, but I'll be inferring intent for the stale entries.
  - **(b) Mechanical only** — collapse the command path and fix names that map 1:1, leaving any
    genuinely ambiguous stale entries flagged with a `TODO` for you to confirm.
  Which do you want?
</content>
</invoke>
