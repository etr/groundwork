# Changesets

One file per user-visible change, named after the change: `.changeset/<name>.md`. Each has a frontmatter block naming the package and the bump (`patch`, `minor`, or `major`), and a body that says what changed for users:

```md
---
"groundwork": minor
---

Add the `retro` skill: after a session, suggest improvements to the agent's environment.
```

- **Add one** with `npx changeset` whenever a change is user-visible. Several changes shipping in one release can share a file.
- **See what's pending** with `npm run changeset:status`, which lists the changesets and the bump they add up to.
- **Cut the version** with `npm run release:version`. It bumps `package.json`, writes the release into `CHANGELOG.md`, and syncs the version into `.claude-plugin/plugin.json`, the manifest every harness reads.
- **Pick the bump by what users see.** `minor` adds a skill or a behavior; `patch` fixes something; `major` removes or renames a skill, or changes a contract that other skills depend on.
