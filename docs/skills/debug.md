# `debug`

> **Run it:** `/groundwork:debug [bug description]` · **Tier:** user-run or model-invoked · **Reads:** the code, logs, recent changes · **Writes:** a debug journal under `.debug/` in the project root (gitignored)

## What it does

A five-phase discipline for root cause: understand, reproduce, isolate, fix, verify — with an iron law against changing code before the root cause can be explained. Everything is recorded in a journal, so an interrupted investigation resumes instead of restarting.

## When to reach for it

- A test failure, a regression, an error you cannot explain, an intermittent bug.
- **Not when:** the cause is obvious and the fix is one character or one config value.

## Common questions

**It refuses to fix anything until it reproduces the bug.**

By design. Reading code is not reproduction. A fix you cannot verify is a guess.

**Why does it list several hypotheses before testing any?**

Testing the first plausible idea anchors the whole investigation on it. Three to five ranked, falsifiable hypotheses are written down first; if you are present it shows you the ranking, and your knowledge can re-rank it.

**Where is the journal?**

`.debug/<slug>-<random>/journal.md` in the project root. The path is returned at the end and in any handoff.

**What about secrets in logs and output?**

They are redacted before anything is shown or stored. If redacted output is not enough to diagnose, it says so instead of widening the redaction.

**No regression test was written.**

When no seam can exercise the real bug pattern, that absence is the finding: it is recorded and reported rather than papered over with a hollow test.

## It's working if

- A reproduction command was run, and its output shown, before any theory.
- The journal holds three to five ranked hypotheses, each with a prediction, before the first test.
- The root cause is stated with a verification level.
- The fix is minimal, and a regression test fails before it and passes after.
- Temporary logs share one `[DEBUG-xxxx]` tag, and a grep for it finds nothing at the end.
- The commit message states the root cause and the evidence for it.

**It is not working if:** timeouts or retries increased as the "fix", or three changes landed at once.
