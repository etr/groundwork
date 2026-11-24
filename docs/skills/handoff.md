# `handoff`

> **Run it:** `/groundwork:handoff [focus]` · **Tier:** user-run or model-invoked · **Reads:** the conversation, the git state, paths to existing work products (PRDs, plans, ADRs, specs, issue/PR URLs) · **Writes:** one markdown file in the temp directory, outside the repo

## What it does

Produces one compact document that carries a session to the next: what was decided, the current state, the single next objective, and where the work products live. It is a baton, not a backpack — artifacts are referenced by path or URL, never copied in. The file is written outside the repo, and its absolute path is printed for you to pass on.

## When to reach for it

- You are ending a session with work still in progress.
- You are handing a task to another agent or person.
- Compaction is approaching and you want a durable resume point.
- **Not when:** the session is over and what you want changed is the environment the next one runs in — a check, a steering-file line. That is `retro`, which can take a handoff document as its evidence.

## Common questions

**Where does the document go?**

`${TMPDIR:-/tmp}/groundwork-handoff-<slug>-<timestamp>-<pid>.md` — outside the repo and every worktree. The slug comes from the focus argument (or `session`), and the timestamp plus PID suffix keeps two concurrent handoffs from overwriting each other. The path is printed; the file is not moved into the workspace.

**It gave a path where I expected the plan or the diff itself.**

By design. The Artifacts section is references only: paths, branch names, commit SHAs, diffs, issue/PR URLs. A PRD, plan, ADR, or diff pasted in full is a red flag — the next agent can open the path, and a copy bloats the handoff and rots when the source changes.

**What about a secret the next session will need?**

Secrets, API keys, tokens, credentials, and PII are replaced with `[REDACTED]` before anything is written. Reference where it lives — an env var name, a secret manager path — never the value.

**What does `[focus]` change?**

It shapes the summary toward the next objective, for example `/groundwork:handoff finish the auth refactor`. Without it, the summary follows the most recent active thread.

## It's working if

- The file exists at a `${TMPDIR:-/tmp}/...` path, not inside the repo or any worktree.
- The summary is tailored to the next objective, and to `[focus]` when one was given.
- The document has exactly five sections: Summary, State, Next objective, Artifacts, Suggested skills.
- Artifacts are links, paths, and URLs — no copied source, plan, or diff bodies.
- No API key, token, password, or PII is in the text.
- Suggested skills names concrete skills and points at `[[using-groundwork]]`.
- The absolute path is reported to you.

**It is not working if:** the file landed inside the repo or a worktree, a plan or diff was pasted in full, or a secret is in the text.
