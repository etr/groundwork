# Contributing

Groundwork is a skills library: every capability is a skill, and there is no separate commands layer. Contributions take the shape of a skill, a reference file, a hook, or a library helper — see `AGENTS.md` for the layout and [`docs/developing-skills.md`](docs/developing-skills.md) for how to author a skill.

## Where each request goes

| You have | Go to |
|----------|-------|
| A security vulnerability | [`SECURITY.md`](SECURITY.md) — report it privately. Never as a public issue. |
| A skill that did the wrong thing | A [bug issue](https://github.com/etr/groundwork/issues/new) |
| A change to an existing skill | An issue describing the problem |
| An idea for a new skill | An issue describing the problem it would solve |
| A question, or "how do I…?" | An issue |

Describe the problem; the design of the fix is worked out in the discussion, not prescribed in the report.

## The bar

An idea or feedback issue stays open only if it clears both parts:

1. **Observed failure.** It describes something that went wrong in a real session: what you ran, what the skill did, and what you expected. A hypothetical improvement ("it would be better if…") does not clear this part.
2. **Fits the project.** It is not a harness-specific branch, a config option for one workflow, or a tweak that suits a single person's process. Those belong in a personal skill: a skill in `~/.claude/skills/` with the same name overrides the plugin's.

Size is irrelevant: a one-word fix and a rewrite face the same bar. Reactions and "+1" comments do not count towards it.

## Issues written with AI

Agents are welcome to help write an issue, but the person posting it owns it:

- **One problem per issue.** Several findings from one session are several issues, or none.
- **Short.** If it does not fit on one screen, cut it.
- **Reproduction first.** The steps that show the problem come before any analysis.
- **No pasted plans.** No full proposals, specs, tickets, or rewritten `SKILL.md` files. Describe the problem and stop.
- **Not your project's issues.** Tasks, specs, and tickets for the project you are building belong in that project's `specs/` directory, which is where the planning skills write them. An agent filing them here has the wrong repository.
- **No secrets.** Redact credentials, tokens, and private code from anything you paste.
- **Vulnerabilities go to [`SECURITY.md`](SECURITY.md)**, never to the public tracker.

If you are an agent about to file an issue here on someone's behalf, re-read this section first.

## Making a change

1. **Run the checks.** `node lib/validate-plugin.js` and `bash tests/run-tests.sh`. The export suite is slow; it checks that every skill still behaves the same on the other harnesses.
2. **New skills ship everywhere.** The installer exports every skill in `skills/` to the other harnesses unless `install-config.txt` lists it as an exception, so a new skill needs no registration — but it does need the other steps below.
3. **Route it.** Add the skill to the lifecycle map in `skills/using-groundwork/SKILL.md`; `tests/router-parity.test.js` fails until it is there.
4. **Document it.** Add a row to the README and a page in `docs/skills/` (see *Docs pages* in `docs/developing-skills.md`).
5. **Describe the change.** Run `npx changeset` and summarize what changed for users; the release folds these into `CHANGELOG.md`.
6. **Shared blocks come from one source.** If the change touches a block many skills carry (the Pre-flight recommendation, Step 0, the merge snippet, the task format, spec detection, auto-split thresholds), edit its source in `lib/sync-shared-blocks.js` or `lib/shared-blocks-specs.js` and run `node lib/sync-shared-blocks.js`. `tests/shared-blocks.test.js` fails on a hand-edited copy.
7. **Credit what you borrowed.** A pattern adapted from another project gets a one-line credit comment in the skill body and an entry under *Attribution* in the README.

### Cutting a release

`npm run release:version` bumps the version, writes the release into `CHANGELOG.md`, and syncs `.claude-plugin/plugin.json`, the manifest every harness reads. Commit the result, push, and tag as usual. `tests/sync-plugin-version.test.js` fails the suite if the two version numbers ever disagree.
