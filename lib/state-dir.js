#!/usr/bin/env node
/**
 * Print the resolved Groundwork state directory for the ambient harness.
 *
 * Mirrors lib/project-context.js getStateDir(): honors GROUNDWORK_HARNESS and
 * the per-harness config env vars (CLAUDE_CONFIG_DIR, ZCODE_HOME, CODEX_HOME,
 * …). Bash hooks and the statusline consume this so their state-directory
 * resolution cannot drift from the Node writers'.
 *
 * Usage: node state-dir.js
 * Output: the absolute state directory path (no trailing newline)
 */

const { getStateDir } = require('./project-context');

process.stdout.write(getStateDir());
