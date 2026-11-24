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

Every description is loaded into context in every session, and on export it is the only place a flag is advertised (the installer drops `argument-hint` and strips a `Usage /groundwork:…` suffix). So:

- Do not repeat the usage line in the description — that is what `argument-hint` is for.
- Do not open with "This skill should be used when"; start with the trigger or the imperative.
- Explain every flag the argument hint advertises in portable prose, with the wording the other skills use (`tests/skill-descriptions.test.js` fails on a new spelling).
- Keep it under about 330 characters; only a skill that carries three flags has a reason to run longer.

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

Skills produce files. The guard in `tests/path-safety.test.js` enforces the five invariants below with per-rule scope, stated exactly in the guard header and repeated here: invariant 1 is a corpus-wide text scan over every authored surface (`skills/`, `agents/`, `references/`, `lib/`, `hooks/`, `bin/`, `pi-extension/`, root scripts/docs) plus targeted contract checks for its journal and handoff applications; invariant 2 is a functional contract check (the resolve CLI must emit absolute normalized bindings — it is not a corpus scan); invariant 3 is a corpus-wide text scan; invariant 4 checks the lock-primitive implementations themselves plus a corpus-wide prohibition on touching shared pointers outside the approved helper; invariant 5 is a targeted contract check over the instruction surfaces (skills and agents):

1. **Scope by the key that makes a name unique.** Task IDs, feature slugs, and bug slugs are only unique *per project*, so any artifact named after one must live under the project root — use the template variables, never a bare CWD-relative path. Run-keyed artifacts (handoffs, per-invocation outputs) must carry a uniqueness suffix (timestamp + PID, or the run id). Its journal application is invocation-unique: debug and research journals are per-invocation artifacts that allocate an atomically unique run directory with `mktemp -d "{{debug_dir}}/${SLUG}-XXXXXX"` (journal at `$RUN_DIR/journal.md`; research equivalent under `{{research_dir}}`), pass the literal generated path to every collaborator, return it in the final or handoff output, and find prior runs by slug-prefixed directories when resuming — several matches require the handoff literal path or user selection. Never a fixed slug-only name, never a timestamp+PID-only contract (same-second and PID-reuse collisions), never a shared `current` pointer.
2. **Absolute bindings, invariant to the caller's cwd.** Every operational binding (`project_root`, `specs_dir`, `plans_dir`, `debug_dir`, `research_dir`) is an absolute normalized path resolved through `lib/project-context.js`. Relative spellings are legacy-read forms (old plan headers, old persisted state) — never emitted by new writers.
3. **No fixed shared temp paths.** Run-scoped data never goes to a fixed `/tmp/groundwork-*` path; use `mktemp`/`mkdtemp` or the run-scoped directories the helpers provide. Library temporaries go through `lib/atomic-write.js`, whose names are O_EXCL plus cryptographically unique.
4. **Shared pointers are locked, not conventional.** Anything acting as an "active/current" pointer across processes needs an O_EXCL lock with holder identity and staleness recovery (see `lib/owned-lock.js` and `lib/validation-session.js`), not just a conventional filename. Pointer code appears only in the approved helper; instruction surfaces may only *prohibit* editing pointers. Every fixed-lock transition — acquire, reap, release, lease publication, release of an owned lock — runs inside a serialized mutation turn (`lib/lease-mutation.js`) with holder identity from `lib/process-identity.js`; a compare-and-delete of a fixed path never happens outside that turn.
5. **Worktree and branch identity comes from the shared helper.** Worktrees and task branches must be resolved through `node ${CLAUDE_PLUGIN_ROOT}/lib/worktree-identity.js <task-id>` — never derived by hand in a skill. The helper is the same source of truth the terminal runner uses, so overlapping `TASK-NNN` identifiers across monorepo projects cannot collide in the one shared branch namespace. Resume classification is the same discipline: before (re)starting a task, skills run `node ${CLAUDE_PLUGIN_ROOT}/lib/task-resume.js check <task-id>` and follow `references/task-resume-protocol.md` — never reconstruct in-flight state by hand.

### Reserved directories (project-scoped template variables)

| Variable | Directory | Written by |
|----------|-----------|------------|
| `{{specs_dir}}` | `<project>/specs` | design-product, design-architecture, ux-design, create-tasks, … |
| `{{plans_dir}}` | `<project>/.groundwork-plans` | plan-task, just-do-it (read by implement-task) |
| `{{debug_dir}}` | `<project>/.debug` | debug, swarm-debug (invocation-unique bug-slug journals; gitignored) |
| `{{research_dir}}` | `<project>/.architecture` | swarm-design-architecture (invocation-unique feature-slug research; gitignored) |

All four resolve absolutely through `lib/project-context.js` (exposed by the PostToolUse resolver, session-start bindings, and the portable `project-context-cli.js`) and are exported through `install-skills.sh`'s content gate — a new variable must be wired into all of those plus `tests/path-safety.test.js`, and a new reserved directory must be added to the gitignore entries `setup-repo` maintains.

**Runtime export closure.** When a skill or agent references a runtime helper (`lib/*.js`, `pi-extension/lib/*.js`, shared bash helpers), that helper must be declared in the checked runtime manifest `lib/external-runner-manifest.js` (the installer loops over the manifest, which validates the full transitive import closure — including rejecting unmanifested relative imports and unclassified dynamic requires — before writing any file; the ZCode marketplace bundle is guarded the same way). The installed runtime must behave like the source tree — `tests/install-config.test.js` and `tests/zcode-marketplace.test.js` enforce this — so a new helper that is not exported is a defect, not an optimization.

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

Only the skills that carry it are rigid (today `test-driven-development` and `debug`, each of which states an Iron Law). Marking is optional; the router, `using-groundwork`, keeps a list that must match the skills that actually carry the marker.

### Flexible Skills
Adapt principles to context. Used for patterns and guidelines. Flexible skills carry no marker — a skill without the rigid marker is applied as written, and adapted only where it says adaptation is allowed.

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
6. **Fresh context for subagents** - Every `Agent()` dispatch says to start the subagent with a fresh context window. Some harnesses (Codex among them) fork the parent conversation by default, and a fork inherits the parent's context — which is what the subagent was meant to escape. `lib/transform-agents.js` carries the target-specific wording on export (`fork_turns="none"` for Codex) for every dispatch form except Pi's `groundwork_agent()` tool call, which carries none — so the source skill should carry the instruction too.

## Authoring Discipline

Skills create **predictability** — the agent runs the same process every time. Two failure modes erode that: **sprawl** (so long the agent skims) and **sediment** (stale lines nobody pruned). Edit ruthlessly.

- **The no-op test.** For each sentence ask: "Does this change behavior versus the model's default?" If the model already does it unprompted, delete the sentence — don't rewrite it. No-ops are the main cause of sprawl. The test is *model-relative*, not reader-relative: two people disagreeing about a no-op disagree about the default, and settle it by running the skill, not by debate.
- **Single source of truth.** One authoritative place per fact. If a rule lives in another skill or a reference, link to it (`[[skill-name]]`, `references/...`) instead of restating it. Duplication rots out of sync.
- **The environment is a source of truth too.** `package.json` scripts, config files, `--help` output. A skill that restates the environment is a cache, and earns its load only when the lookup is expensive. Cache what the agent cannot find by looking (the unwritten convention, the reason behind a choice); leave one-command lookups to the environment, where they cannot go stale.
- **Leading words.** Anchor behavior with a compact concept the model already knows ("deep module", "Chesterton's Fence", "tight") rather than three sentences of explanation. A made-up word recruits no priors: you pay in definition tokens what a pretrained word gives free — reach for an existing word first.
- **Phrase positively.** Prohibition drags the forbidden behavior into context and makes it *more* available ("don't think of an elephant"). State the target behavior so the banned one is never spoken; a prohibition earns its place only as a hard guardrail, paired with the positive target.
- **Completion criteria need clarity and demand.** *Clarity*: can the agent tell done from not-done? A vague bound ("understanding reached") invites premature completion — attention slips to *being done*, pulled by the visible steps still ahead. Sharpen the bound before anything else. *Demand*: "every modified model accounted for" forces legwork where "produce a change list" does not. The strongest criteria are both checkable and exhaustive.
- **Front-load the description.** For model-invocable skills the description loads every turn — every word costs. Lead with the trigger word; one trigger per genuine branch; cut identity already obvious from the body.

## The Two Loads

Every skill spends one of two budgets. **Context load** is always-loaded material — descriptions, hook-injected lines — paid on every turn whether or not it fires. **Cognitive load** is the human cost of remembering which skill exists: for user-only leaves the human *is* the index. Tiers are the trade: user-only leaves pay zero context load and full cognitive load; library skills pay a description to be reachable by the model and by other skills. When choosing a tier, you are choosing which load to pay — and a router skill exists to consolidate cognitive load into one place.

**Thin orchestrators.** A user-invoked orchestrator should be thin: dispatch to library skills that hold the reusable discipline, rather than restating it. `ship` is the model — its whole body is two ordered dispatches and a human gate. A fat user-tier skill that duplicates what a library skill could hold pays both loads at once.

## Progressive Disclosure

Keep `SKILL.md` to what the agent needs on every run. Move branch-specific or reference material into sibling files opened on demand:

```
skills/my-skill/
  SKILL.md     # the workflow + an index of when to open each sibling
  FORMAT.md    # a template consulted only when producing the artifact
```

Name each sibling and the condition for opening it ("When producing the report, follow `FORMAT.md`"). Inline only what *every* run needs.

Decide by what the content is *for*:

| The content is… | Where it goes |
|-----------------|---------------|
| A restatement of a rule stated elsewhere (another section, a shared checklist, a preloaded skill) | Delete it, or replace it with a one-line pointer to the owner |
| Reference used on some branch of the work (a report format, a language checklist, an escalation template, implementation code) | A sibling or a `references/` file behind a pointer that names when to open it |
| A guardrail at a weak moment — the point where the model is tempted to shortcut (an Iron Law, a mandatory "watch it fail", a STOP list, a mock gate) | Inline, as short as the rule allows |

A skill that is **preloaded into an agent** (`skills:` in the agent's frontmatter) is loaded whole, but its sibling files are not pulled in. Put what such a skill defers in `references/` and point with `${CLAUDE_PLUGIN_ROOT}/references/<file>.md`: the exporter ships that file beside the skill and beside the agent.

Never write `${CLAUDE_PLUGIN_ROOT}` or a `{{template}}` variable inside a file under `references/`. The installer copies those files byte-for-byte, so the raw text would reach every other harness (`tests/install-config.test.js` fails on it). Split into a *separate skill* (not just a sibling) only when the cut earns its context cost: a distinct leading word worth independent invocation.

## Shared Blocks

Some blocks must read the same wherever they appear: the Pre-flight model recommendation, Step 0's project-context checks, the manual-merge snippet shown to the user, the task format, the spec-detection rule, the auto-split thresholds, and the parts of the dispatch prompts that two skills share. Each is rendered into its skills from one source, because the copies had drifted whenever they were edited by hand:

| Source | Blocks |
|--------|--------|
| `lib/sync-shared-blocks.js` | the Pre-flight block, Step 0, the manual-merge snippet — and `USAGE`, the per-skill parameter table that says which skill carries which block with which differences |
| `lib/shared-blocks-specs.js` | the task format (read from `references/tasks/tasks-template.md`, which stays its source), the spec-detection rule, the auto-split thresholds, the plan constraints, the executor's task block |

To change one, edit the source or its `USAGE` parameters, then run:

```bash
node lib/sync-shared-blocks.js          # re-render every listed skill
node lib/sync-shared-blocks.js --check  # exit 1 on drift, write nothing
```

Never hand-edit a rendered block. `tests/shared-blocks.test.js` compares every site byte-for-byte with the rendered text and fails until the source is updated; it also fails when a skill carries one of these blocks without being registered in `USAGE`.

The skills keep the rendered text rather than pointing at a shared file on purpose: the export installer's gates, model-name translation, and Codex policy all key on these blocks being in the skill body, and a pointer would cost a read on every run for a block every run needs.

## Docs Pages

Every skill gets a page at `docs/skills/<skill-name>.md`, written for the person deciding whether to run it. Create it when a skill is added, and re-sync it whenever the skill's behavior changes — a page that describes last year's skill is worse than none.

The header states the tier in one of three fixed spellings — `user-run`, `user-run or model-invoked`, `library` — read from the frontmatter (`disable-model-invocation: true`, neither flag, `user-invocable: false`). A library page drops the **Run it** field and says who uses the skill instead.

A page has four sections, in this order (start from `docs/skills/TEMPLATE.md`):

1. **What it does** — the outcome and the shape of the work, in a few sentences. Not a step list; that lives in the skill.
2. **When to reach for it** — the situations where it fits, and the near-miss situations where another skill fits instead.
3. **Common questions** — the questions people actually ask. Hunt for them in sessions and reviews, not in imagination.
4. **It's working if** — observable signals that the skill did its job: what you can see in the transcript, the files, or the result. Intentions are not signals ("the agent was thorough"); artifacts and behaviors are ("every test was seen failing first").

Check each page's claims against the skill text before writing it down — a page that misdescribes a skill teaches the wrong expectation. `tests/docs-parity.test.js` fails when a page names a skill that does not exist, drops a section, is missing from the `docs/skills/README.md` index, or states a tier its skill's frontmatter contradicts.

## Router Discoverability

A user-only leaf (`disable-model-invocation: true`) is invisible to the model — it can be surfaced only through the lifecycle router in `using-groundwork`. When you add a leaf, add its router entry too, or it's a dead end. A router entry that names a skill that no longer exists, or a skill the router never mentions, is a router that lies: `tests/router-parity.test.js` fails the build on both, so run it whenever you add, rename, or remove a skill.

## Credits

When a skill borrows a named pattern from an external source — a book, another skills library, a talk — say so in the skill body, as a one-line HTML comment directly under the frontmatter:

```markdown
<!-- Interview protocol adapted from the "grilling" skill in github.com/mattpocock/skills (MIT). -->
```

A body comment travels with every export and costs one line. Keep credits out of frontmatter: the ZCode marketplace contract allows exactly `name` and `description` (`tests/zcode-marketplace.test.js` fails on any other key), `lib/validate-plugin.js` reports unknown fields, and `lib/frontmatter.js` does not parse nested blocks. Credit the *pattern's* origin, not every idea that rhymes with something you once read — and when the borrowed text is close to verbatim, the source's license notice belongs in the repository's third-party notices as well.

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
