# `groundwork-help`

> **Run it:** `/groundwork:groundwork-help` · **Tier:** user-run · **Reads:** the plugin manifest, every skill's frontmatter, the `agents/` directory · **Writes:** nothing

## What it does

Gives an overview of the plugin: the skills you can invoke as `/groundwork:<name>`, grouped by purpose, each with the first sentence of its description, followed by usage examples and where to read more. The list is built by scanning the plugin's manifest, skills, and agents — never from memory. Skills you cannot type are summarized in one sentence instead of listed.

## When to reach for it

- You want an overview of what the plugin offers.
- You are looking for the slash command that fits a job.
- **Not when:** you want every skill one by one, including the hidden library skills. That is `/groundwork:skills`. Or the plugin seems broken — that is `/groundwork:groundwork-check`.

## Common questions

**A skill I know exists is missing from the list, such as `test-driven-development`.**

It is a hidden library skill — `user-invocable: false` — so it is not on the slash menu and is invoked only by other skills or by the model. Those are summarized in one sentence, not listed one by one. `/groundwork:skills` has the full list.

**Why does it read all those files instead of just reciting the list?**

Because the list must come from what the scan found, never from memory. A memorized list goes stale the moment a skill is added, and a partial one hides skills you cannot discover any other way. Before presenting, it counts the entries against the scan.

**How does it decide which kind a skill is?**

From the frontmatter. `disable-model-invocation: true` is a user-only slash workflow; `user-invocable: false` is a hidden library skill; neither means dual — user slash plus model auto.

**Where does it send me to read more?**

To `README.md` in the plugin root for full documentation, and to GitHub issues for support.

## It's working if

- The manifest was read and `skills/` and `agents/` were scanned before any list appeared.
- The list is grouped by purpose, each line in the form `/groundwork:<name> [args] - <first sentence of its description>`.
- The list has exactly as many entries as the scan found user-invocable skills.
- No hidden library skill has a line of its own; they are covered by one sentence that points to `/groundwork:skills`.
- Usage examples follow, such as `/groundwork:create-tasks` and `/groundwork:groundwork-check`.
- You are pointed to `README.md` in the plugin root and to GitHub issues.

**It is not working if:** the list came out without a scan behind it, or it names fewer skills than the scan found.
