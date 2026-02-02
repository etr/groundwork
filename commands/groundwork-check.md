---
name: groundwork:groundwork-check
description: Validate the Groundwork plugin for common issues. Usage /groundwork:groundwork-check
allowed-tools: ["Bash", "Read"]
disable-model-invocation: true
---

# Groundwork Plugin Health Check

Validates the Groundwork plugin installation and reports any issues.

## Workflow

### Step 1: Run Validation Script

Run the plugin validation script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/lib/validate-plugin.js"
```

### Step 2: Report Results

Present the validation results to the user:

- **If all checks pass:** Confirm plugin is healthy
- **If errors found:** List each error with file path and description
- **If warnings found:** List warnings as recommendations

### Step 3: Suggest Fixes

For any issues found, suggest specific fixes:

| Issue Type | Suggested Fix |
|------------|---------------|
| Missing frontmatter | Add `---` delimited YAML at file start |
| Literal `\n` in description | Use YAML block scalar (`\|`) |
| Non-standard field | Remove field or document exception |
| allowed_tools | Change to allowed-tools (hyphen) |
| @ syntax | Use explicit file paths |
| Missing execute permission | Run `chmod 755` on script |

### Step 4: Offer to Fix

If issues are found, offer to automatically fix simple issues:
- Permissions can be fixed with chmod
- YAML key names can be updated

Ask user before making any changes.
