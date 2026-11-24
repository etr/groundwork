# `source-architecture-from-code`

> **Run it:** `/groundwork:source-architecture-from-code [files...]` · **Tier:** user-run · **Reads:** the current session, the codebase changes, `specs/architecture.md` (or the `architecture/` directory) · **Writes:** the same architecture document, only after you approve each update — and a `split-architecture` run once it passes 500 lines or 10 decision records

## What it does

Brings the architecture document back in line with what was actually built. It gathers the session's explicit decisions, the implicit ones — new dependencies, new services, schema changes — and the places where the implementation drifted from the document, then proposes a specific edit for each and applies only what you approve. It ends with an `Architecture Sync Summary`.

## When to reach for it

- The end of a session in which a technical choice was made, a pattern changed, or a new component or integration appeared.
- The implementation drifted from the documented architecture, or a workaround changed the design.
- New utility functions, refactoring inside a component, bug fixes, tests, and docs are weak signals: it asks about them only if they seem significant.
- **Not when:** you are still making the architecture decisions. That is `design-architecture`; this skill records decisions already made.

## Common questions

**It opened by asking me to switch model or effort.**

That is the pre-flight check. It is skipped only when effort is `high`, `xhigh`, or `max` and the model is Sonnet or Opus. "Continue" goes ahead; "Cancel — I'll switch first" prints the switching commands and stops.

**What does it read — the session or the code?**

Both. The session, for explicit decisions such as "let's use X instead of Y", and the codebase changes for the implicit ones: new dependencies, new services or components, new integrations, schema changes.

**It left a paragraph that is now out of date.**

It preserves existing content. It adds to sections and does not replace them unless it is explicitly correcting an error.

**Where does it write, and why did the document turn into a directory?**

Into `specs/architecture.md`, or across `specs/architecture/` when the document is already a directory; a single file is checked first and takes precedence. After editing a single file it counts lines and decision records: at 500 lines or more, or 10 decision records or more, it runs `split-architecture` automatically and says so in the summary.

## It's working if

- Every proposal names its trigger from the session and the section it changes.
- Nothing was written before you approved it.
- A new decision is a record with Context, Options Considered, Decision, and Rationale — and the discarded option is still in it.
- Existing content was added to, not replaced.
- The "Last updated" timestamp moved, and a change-log entry was added when the document has a change log.
- The run ends with an `Architecture Sync Summary`: the changes detected, including the ones with no architecture impact, and the open items.

**It is not working if:** the document changed before you approved it, or a section was replaced rather than added to.
