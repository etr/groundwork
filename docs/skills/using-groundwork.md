# `using-groundwork`

> **Tier:** library — invoked by the model, never typed by you; its standing rule is to be used when starting any conversation · **Reads:** your message; `.groundwork.yml` in a monorepo · **Writes:** nothing on disk; it announces the skill in use, "Using [skill] to [purpose]", and creates a task per checklist item when that skill has one

## What it does

The rule the model follows on every message: invoke a relevant skill before any response or action, even at a 1% chance that one applies. It carries the lifecycle map, a table from the work at hand to the skill for it, from defining and planning through building, verifying, and shipping. The map also marks which skills the model may run itself and which are yours to run; for those it recommends the slash command and leaves running it to you.

## When to reach for it

- You never run it. It applies to every message, plain questions included: "Questions are tasks. Check for skills."
- You want to know which skill fits a piece of work: the lifecycle map is the table to read.
- **Not when:** you want a list of skills or a health check of the plugin. Those are yours to run: `/groundwork:skills`, `/groundwork:groundwork-help`, `/groundwork:groundwork-check`.

## Common questions

**The model told me to run `/groundwork:ship` instead of starting it.**

Skills marked `disable-model-invocation: true` are user-only. The model cannot invoke them — at call time they are invisible to it — so when one fits, it recommends the slash command and you run it. They are heavyweight or high-blast-radius on purpose: swarms, full PRD generation, autonomous loops, outward-facing deploy.

**I said "Add X" and it started a workflow.**

Instructions say what, not how: "Add X" or "Fix Y" does not mean skip workflows. The skill check comes first, even before clarifying questions.

**It invoked a skill and then did not use it.**

That is allowed. An invoked skill that turns out to be wrong for the situation does not have to be used.

**It would not create tasks for my idea yet.**

When the work is too big or too foggy for one session — you cannot name the tasks without guessing — it does not force `create-tasks`. It routes through `design-architecture`, whose **Open decisions / fog** section carries what is unsettled, and comes back to `create-tasks` once those settle into decisions.

## It's working if

- A skill was invoked before any response or action, including before clarifying questions.
- The reply announces the skill and its purpose: "Using [skill] to [purpose]".
- When that skill has a checklist, a task exists per checklist item, and the skill is followed exactly.
- When a user-only skill fits, the model recommends the slash command instead of starting the work.
- For "Let's build X", the process skill comes first: `design-product`, then the implementation skills.
- In a monorepo, the project context was checked before specs were read or written.

**It is not working if:** it started implementing a task without `work-on`, or asked you for context before checking for a skill.
