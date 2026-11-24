# `groundwork-check`

> **Run it:** `/groundwork:groundwork-check` · **Tier:** user-run · **Reads:** the plugin's own files, through `lib/validate-plugin.js` · **Writes:** nothing unless you accept its offer — then only script permissions or YAML key names

## What it does

Runs the plugin's validation script, `node "${CLAUDE_PLUGIN_ROOT}/lib/validate-plugin.js"`, and reports what it found: healthy, errors with file paths, or warnings as recommendations. For each issue it suggests a specific fix, then offers to apply the simple ones. It asks you before changing anything.

## When to reach for it

- The plugin installation seems wrong and you want to know what.
- You want a plain healthy-or-not answer, with a file path for every error.
- **Not when:** you are looking for the skill that fits a job. That is `groundwork-help`; this one only validates the installation.

## Common questions

**It listed problems. Are they fixed?**

Not yet. It reports first, suggests a fix per issue, and only then offers to fix the simple ones: permissions with `chmod`, and YAML key names. It asks before making any changes.

**What is the difference between an error and a warning?**

Errors are listed one by one, each with file path and description. Warnings are listed as recommendations. Only when all checks pass does it confirm the plugin is healthy.

**Which fixes does it know?**

Missing frontmatter takes `---` delimited YAML at file start, a literal `\n` in a description takes a YAML block scalar (`|`), and `@` syntax takes explicit file paths. `allowed_tools` becomes `allowed-tools`; a non-standard field is removed or its exception documented. A script without execute permission gets `chmod 755`.

## It's working if

- `node "${CLAUDE_PLUGIN_ROOT}/lib/validate-plugin.js"` was run; the report is its result.
- When all checks pass, it says the plugin is healthy.
- Each error is listed with its file path and description.
- Warnings are listed as recommendations.
- Every issue comes with a suggested fix.
- No permission or file changed before you answered its question.

**It is not working if:** it declared the plugin healthy without running the script, or a `chmod` or frontmatter edit landed unasked.
