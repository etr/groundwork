# `domain-modeling`

> **Run it:** `/groundwork:domain-modeling` · **Tier:** user-run or model-invoked · **Reads:** the conversation, the code · **Writes:** `specs/glossary.md`

## What it does

Builds and sharpens the project's shared vocabulary as you work: it challenges words that conflict with the glossary, proposes one canonical term where several compete, stress-tests concepts against edge cases, and writes each term down the moment it is resolved. The result is that later sessions say in one word what would otherwise take twenty.

## When to reach for it

- The project lacks agreed terminology, or people use three words for one concept.
- A design conversation keeps tripping over a vague term.
- **Not when:** you want to record a trade-off. That belongs in a decision record (`design-architecture`).

## Common questions

**There is no `glossary.md` in my specs.**

It is created lazily, on the first term that actually resolves. An empty glossary is not a missing spec.

**What is the `Avoid` line on an entry?**

The rival words the entry retires. When several words compete for one concept, the entry names the winner and lists the others, so a writer meets the canonical term at the moment they would reach for another.

**Why did it not write my decision into the glossary?**

The glossary is terminology only. Trade-offs and rationale go in a decision record.

## It's working if

- An entry appeared the moment a term was settled, not in a batch at the end.
- Each entry has a one-or-two-sentence definition, an `Avoid` line where rivals exist, relationships, and edge cases — and no implementation detail.
- A vague word you used ("account", "booking") got a precise canonical term.
- Code you wrote later, and tests you named later, use the glossary's words.

**It is not working if:** definitions carry table names or function signatures, or two synonyms each got their own entry.
