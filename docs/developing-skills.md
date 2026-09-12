# Developing Skills

This guide covers how to create and modify Groundwork skills.

## Skill Structure

Each skill lives in its own directory under `skills/`:

```
skills/
└── my-skill/
    ├── SKILL.md           # Main skill file (required)
    └── references/        # Optional supporting files
        └── example.md
```

## SKILL.md Format

```markdown
---
name: my-skill
description: Use when [condition] - [what it does]
---

# Skill Title

[Skill content in markdown]
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Lowercase with hyphens (e.g., `my-skill`) |
| `description` | Yes | When the skill applies + what it does (also shown in slash autocomplete) |
| `requires` | No | Comma-separated list of skill dependencies |
| `argument-hint` | No | Hint shown in `/groundwork:<name>` autocomplete (e.g. `"[task-number]"`) |
| `allowed-tools` | No | Pre-approves tools for the skill (e.g. `["Read", "Bash", "Skill"]`) |
| `disable-model-invocation` | No | `true` = user-only slash; blocks model auto-trigger **and** `Skill()` calls from other skills. Use only on leaf skills nothing else invokes. |
| `user-invocable` | No | `false` = hidden from the slash menu but still callable by the model / other skills (library tier). Default `true`. |
| `model` | No | Override the model when this skill is active |

#### Invocation tiers

| Tier | Frontmatter | User slash | Model auto | Callable by other skills |
|------|-------------|:--:|:--:|:--:|
| User workflow (leaf) | `disable-model-invocation: true` | ✅ | ❌ | ❌ |
| Chain / dual | *(defaults)* | ✅ | ✅ | ✅ |
| Hidden library | `user-invocable: false` | ❌ | ✅ | ✅ |

## Writing Good Descriptions

The description determines when Claude invokes your skill. Format:

```
Use when [trigger condition] - [outcome/purpose]
```

Examples:
- `Use when debugging test failures - systematic root cause analysis`
- `Use when creating new features - collaborative brainstorming`
- `Use when reviewing code - structured review checklist`

## Skill Content Guidelines

### Be Specific
Don't just describe what to do - provide exact steps, checklists, and examples.

### Include Verification
Add checkpoints where Claude should verify progress before continuing.

### Provide Examples
Show what good output looks like. Claude learns from examples.

### Use Checklists
```markdown
## Checklist

- [ ] Step one completed
- [ ] Step two verified
- [ ] Step three documented
```

### Reference Supporting Files
```markdown
See the example at: references/example.md
```

## Path Safety

Skills produce files. Three invariants prevent the collision bug class where two projects (or two concurrent sessions) silently overwrite each other's artifacts — `tests/path-safety.test.js` enforces them repo-wide, so a violating skill fails CI:

1. **Scope by the key that makes a name unique.** Task IDs, feature slugs, and bug slugs are only unique *per project*, so any artifact named after one must live under the project root — use the template variables, never a bare CWD-relative path. Run-keyed artifacts (handoffs, per-invocation outputs) must carry a uniqueness suffix (timestamp + PID, or the run id).
2. **No fixed shared temp paths.** Run-scoped data never goes to a fixed `/tmp/groundwork-*` path; use `mktemp`/`mkdtemp` or the run-scoped directories the helpers provide.
3. **Shared pointers are locked, not conventional.** Anything acting as an "active/current" pointer across processes needs an O_EXCL lock with staleness recovery (see `lib/validation-session.js`), not just a conventional filename.

### Reserved directories (project-scoped template variables)

| Variable | Directory | Written by |
|----------|-----------|------------|
| `{{specs_dir}}` | `<project>/specs` | design-product, design-architecture, ux-design, create-tasks, … |
| `{{plans_dir}}` | `<project>/.groundwork-plans` | plan-task, just-do-it (read by implement-task) |
| `{{debug_dir}}` | `<project>/.debug` | debug, swarm-debug (bug-slug journals; gitignored) |
| `{{research_dir}}` | `<project>/.architecture` | swarm-design-architecture (feature-slug research; gitignored) |

All four resolve through `lib/project-context.js` (exposed by the PostToolUse resolver, session-start bindings, and the portable `project-context-cli.js`) and are exported through `install-skills.sh`'s content gate — a new variable must be wired into all of those plus `tests/path-safety.test.js`, and a new reserved directory must be added to the gitignore entries `setup-repo` maintains.

Worktrees and task branches must be resolved through `node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js <task-id>` — never derived by hand in a skill. The helper is the same source of truth the terminal runner uses, so overlapping `TASK-NNN` identifiers across monorepo projects cannot collide in the one shared branch namespace.

### Accepted boundaries (do not "fix" these casually)

- **Single writer per project for fixed-name spec artifacts** (`architecture.md`, `glossary.md`, task status rows): two concurrent sessions in the *same* project may overwrite each other. This is the documented operating assumption; adding locks here would fight the collaborative-editing nature of spec files.
- **Task claiming is the loud branch collision, not a marker.** We deliberately do not write claim markers into `specs/tasks.md` before dispatch: that file lives in the base checkout, and dirtying the base breaks the runner's clean-tree contracts. Two sessions picking the same task fail loudly at `git worktree add` (branch exists) and route into use-git-worktree's existing recovery.
- **`split-specs`/`split-architecture` preflight races**: their "target directory must not exist" check is TOCTOU-unsafe in theory; they are interactive single-user conversions and the window is accepted.

## Skill Types

### Rigid Skills
Follow exactly as written. Used for disciplined processes like TDD.

Mark with:
```markdown
**This is a rigid skill.** Follow steps exactly.
```

### Flexible Skills
Adapt principles to context. Used for patterns and guidelines.

Mark with:
```markdown
**This is a flexible skill.** Adapt to your context.
```

## Testing Skills

1. Create the skill file
2. Invoke it with the Skill tool
3. Verify Claude follows the workflow
4. Adjust based on results

Use the `test-driven-development` skill as a model for disciplined skill development.

## Personal Skills

Create skills in `~/.claude/skills/` to override or extend plugin skills:

```
~/.claude/skills/
└── my-custom-skill/
    └── SKILL.md
```

Personal skills with the same name as plugin skills take precedence.

## Best Practices

1. **One skill, one purpose** - Don't overload skills
2. **Clear triggers** - Make description specific
3. **Actionable steps** - Avoid vague instructions
4. **Exit criteria** - Define what "done" looks like
5. **Error handling** - Include what to do when stuck

## Authoring Discipline

Skills create **predictability** — the agent runs the same process every time. Two failure modes erode that: **sprawl** (so long the agent skims) and **sediment** (stale lines nobody pruned). Edit ruthlessly.

- **The no-op test.** For each sentence ask: "Does this change behavior versus the model's default?" If the model already does it unprompted, delete the sentence — don't rewrite it. No-ops are the main cause of sprawl.
- **Single source of truth.** One authoritative place per fact. If a rule lives in another skill or a reference, link to it (`[[skill-name]]`, `references/...`) instead of restating it. Duplication rots out of sync.
- **Leading words.** Anchor behavior with a compact concept the model already knows ("deep module", "Chesterton's Fence", "tight") rather than three sentences of explanation.
- **Front-load the description.** For model-invocable skills the description loads every turn — every word costs. Lead with the trigger word; one trigger per genuine branch; cut identity already obvious from the body.

## Progressive Disclosure

Keep `SKILL.md` to what the agent needs on every run. Move branch-specific or reference material into sibling files opened on demand:

```
skills/my-skill/
  SKILL.md     # the workflow + an index of when to open each sibling
  FORMAT.md    # a template consulted only when producing the artifact
```

Name each sibling and the condition for opening it ("When producing the report, follow `FORMAT.md`"). Inline only what *every* run needs. Split into a *separate skill* (not just a sibling) only when the cut earns its context cost: a distinct leading word worth independent invocation.

## Router Discoverability

A user-only leaf (`disable-model-invocation: true`) is invisible to the model — it can be surfaced only through the lifecycle router in `using-groundwork`. When you add a leaf, add its router entry too, or it's a dead end.

## Validation

Run `/groundwork:groundwork-check` to validate your skill:

```bash
node lib/validate-plugin.js
```

This checks:
- Valid YAML frontmatter
- Required fields present
- Description format
- File references exist
