# `retro`

> **Run it:** `/groundwork:retro [session description]` · **Tier:** user-run · **Reads:** the session, debug journals, plans, the task catalog, git history · **Writes:** only the environment changes you approve

## What it does

After a work session, it suggests improvements to the **environment the agent operates in** — not to the code it wrote. It reads the evidence of what happened, sorts candidates most severe first, and applies only what you approve. `ship` and `debug` recommend it when a session ends.

## When to reach for it

- A session went sideways: long detours, repeated mistakes, a bug that was hard to pin down.
- A batch run or a ship just finished and you want the next one to start from a better place.
- **Not when:** the code is the problem. That is `debug`, `validate`, or `improve-codebase-architecture`.

## Common questions

**Does it change my files on its own?**

No. It presents candidates and applies only the ones you approve, one at a time, showing each edit.

**It proposed a prose rule for something a linter could check.**

That is a failure. A mechanical mistake (a banned API, an import shape, a file location) should become a deterministic check; the retro says to build the check over writing the rule.

**I use the plugin but do not maintain it. What can I do about a skill that fought my session?**

Shadow it: a skill in `~/.claude/skills/` with the same name overrides the plugin's. Fixing the plugin's own skills is for work in this repository.

**Which session does it look at?**

The current one by default. Pass a description to look at another session or a handoff document.

## It's working if

- Every candidate cites something that happened: a command, an output, a file, a repeated review comment.
- Candidates arrive most severe first, with an explicit list of what was deliberately left alone.
- A check it added was run once, and you saw it fail (or fire) before it was trusted.
- A repeated review nit became a line where the reviewer reads, not another instruction for the implementer.
- Steering files did not grow unless the addition replaced something or was justified.

**It is not working if:** the suggestions could apply to any session, or the session ended with steering-file edits nobody asked for.
