# Groundwork Domain Glossary

The shared vocabulary of the Groundwork plugin: the words its skills, docs, and conversations use for its own concepts. Each entry's **Avoid** list retires the rival words, so a writer meets the canonical term at the moment they would reach for another.

### Agent

**Definition:** A delegated worker that runs in its own isolated context — either a reviewer or executor the plugin defines, or a helper a skill dispatches for a single job.

**Relationships:** Orchestrating [[Skill]]s dispatch agents; [[Batch mode]] runs them without questions; reviewer agents grade work against the shared checklists.

**Edge cases:** A *teammate* is the harness's name for an agent in an agent-team batch; use it only there.

### Batch mode

**Definition:** An execution mode in which skills proceed without asking the user anything, deciding themselves or failing outright instead of waiting.

**Avoid:** headless mode

**Relationships:** Used by [[Task]] execution and by batch skills; interactive-only steps degrade to a decision, a recorded assumption, or a failure result.

**Edge cases:** A skill's own non-interactive flag is its switch into this mode. Runner mode — the external runner driving the skills — implies it.

### Decision record

**Definition:** A captured architectural decision with its context, the options considered, and the rationale for the one chosen.

**Avoid:** ADR file, design note

**Relationships:** Lives in the architecture spec; created by architecture design; consumed by [[Task]] creation as a constraint.

**Edge cases:** The format is called ADR-lite and has no standalone files. Product, brand, and UX decisions carry their own prefixes (DP, BRD, UXD), not DR.

### EARS requirement

**Definition:** A requirement written in the Easy Approach to Requirements Syntax — "When [trigger] the system shall [response]" — the atomic unit of the product spec.

**Relationships:** The product spec is built from them; every [[Task]] traces to at least one.

**Edge cases:** A requirement without a trigger is a goal, not an EARS requirement. Non-functional requirements use the same form with quantified responses.

### Export

**Definition:** The installer-generated copy of the skills and agents adapted for a harness other than Claude Code.

**Relationships:** Produced from the source [[Skill]]s; the fail-closed rule exports every source skill unless it is explicitly dropped.

**Edge cases:** Renames and drops are exceptions listed in the installer's configuration, never the default; an export is never edited by hand.

### Milestone

**Definition:** A vertically sliced, independently testable stage of the implementation plan that groups related [[Task]]s.

**Avoid:** phase

**Relationships:** A task belongs to exactly one milestone; the task index records milestone order and status.

**Edge cases:** A milestone that cannot be demonstrated end-to-end on its own is a horizontal layer in disguise — re-slice it. *Phase* is reserved for lifecycle and debug phases.

### Seam

**Definition:** The public boundary across which a module's behavior is both used and tested — where behavior can be observed without reaching inside the implementation.

**Relationships:** Chosen per [[Task]] before implementation begins; tests are written there.

**Edge cases:** Not every boundary is a seam — component and process boundaries are architectural. When a task records none, the implementer picks the highest existing one that reaches the behavior and says so.

### Skill

**Definition:** A single named capability of the plugin: a written procedure an agent follows when its trigger applies.

**Avoid:** command, as the name of the unit

**Relationships:** Surfaced by the lifecycle router and composed by [[Tier]].

**Edge cases:** The typed form `/groundwork:<name>` is still called a slash command — that names the invocation, not the unit.

### Slice

**Definition:** A thin end-to-end cut through every layer of a feature that delivers exactly one observable behavior.

**Avoid:** layer, chunk

**Relationships:** The unit of both [[Task]] decomposition and test-first construction.

**Edge cases:** A "slice" that covers one layer for many behaviors (all the schema, all the endpoints) is a horizontal slice and is rejected at task review.

### Specs

**Definition:** The per-project set of documents that planning produces and execution consumes: the product spec, architecture, glossary, design system, and task catalog.

**Relationships:** Scoped per project; every downstream artifact — plans, worktrees, validation results — binds back to the specs it was built from.

**Edge cases:** The glossary is created lazily, on the first resolved term; its absence is not a missing spec. The design system is optional.

### Task

**Definition:** The atomic unit of implementation work, carrying a goal, action items, acceptance criteria, test seams, and a status.

**Avoid:** ticket

**Relationships:** Generated from the [[Specs]]; planned, implemented, validated, and finalized in isolation; its dependencies form a graph.

**Edge cases:** An *issue* is a reviewer's finding, not a unit of work. Deferred tasks never satisfy dependencies.

### Tier

**Definition:** A skill's invocation class: user workflow (typed only), chain (typed or model-invoked), or library (model and other skills only).

**Relationships:** Decides who can reach a [[Skill]]; the lifecycle router is the only way a user-workflow skill becomes visible to the model.

**Edge cases:** A skill in another skill's orchestration chain must never be user-workflow tier.

### Worktree

**Definition:** An isolated Git working tree, on its own task branch, in which one [[Task]]'s implementation happens.

**Relationships:** Created per task; the validation result binds to that exact tree; finalization merges it and removes exactly that one.

**Edge cases:** The *checkout* is the primary working tree the task branch merges into. In a monorepo, branch and directory names are project-qualified so two projects' TASK-004 cannot collide.
