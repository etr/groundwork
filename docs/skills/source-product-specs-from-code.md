# `source-product-specs-from-code`

> **Run it:** `/groundwork:source-product-specs-from-code` · **Tier:** user-run · **Reads:** the current session, `specs/product_specs.md` (or the `product_specs/` directory) · **Writes:** the same PRD, only after you approve each update — and a `split-specs` run once it passes 500 lines or 15 features

## What it does

Brings the PRD back in line with what was decided while the work happened. It reads the session for new requirements, changed requirements, scope changes, and edge cases, proposes a specific edit for each — new requirements in EARS form — and applies only what you approve. It ends with a `PRD Sync Summary`.

## When to reach for it

- The end of a session in which a feature was added, a requirement changed ("that should be 5 attempts, not 3"), or an edge case surfaced.
- Scope or priorities moved: something deferred to v2, something declared a must-have for launch.
- If the architecture changed too, run this one first — product drives architecture — then `source-architecture-from-code`.
- **Not when:** you want an audit of the whole codebase against the specs. That is `check-specs-alignment`; this skill carries one session's decisions into the PRD.

## Common questions

**It opened by asking me to switch model or effort.**

That is the pre-flight check. It is skipped only when effort is `high`, `xhigh`, or `max` and the model is Sonnet or Opus. "Continue anyway" goes ahead; "Cancel — I'll switch first" prints the switching commands and stops. The question is asked once per conversation — a skill invoked by another skill skips it once it has been shown — and a non-interactive run (a batch or the runner) skips it too.

**What does it read — the session or the code?**

The current session history. It looks for new requirements, changed requirements, scope changes, and edge cases in what was said and decided.

**Does it edit the PRD straight away?**

No. Each change arrives as a proposal — the trigger from the session, the section it lands in, the requirement text — under "Approve these updates? (yes/no/modify)". Only approval writes.

**Where does it write, and why did the PRD turn into a directory?**

Into `specs/product_specs.md`, or across `specs/product_specs/` when the PRD is already a directory; a single file is checked first and takes precedence. After editing a single file it counts lines and features: at 500 lines or more, or 15 features or more, it runs `split-specs` automatically, with no input from you, and says so in the summary.

## It's working if

- Every proposal names its trigger from the session and the section it changes.
- Nothing was written before you approved it.
- New requirements are in EARS form and carry the next available ID in their feature's sequence; a deleted ID is never reused.
- The PRD's "Last updated" timestamp moved.
- A borderline case came back as a question — product requirement or implementation detail? — not as a silent edit.
- The run ends with a `PRD Sync Summary`: the changes detected, including the ones with no PRD impact, the requirement IDs added or modified, and the open items.

**It is not working if:** the PRD changed before you approved it, or a new requirement went in without its EARS form.
