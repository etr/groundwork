#!/usr/bin/env node
'use strict';

// Filters a Claude Code hooks.json down to the hook events ZCode supports.
//
// ZCode implements exactly seven hook events: SessionStart, UserPromptSubmit,
// PreToolUse, PermissionRequest, PostToolUse, PostToolUseFailure, Stop.
// Events such as SubagentStop and PreCompact do not exist there, so shipping
// them in a marketplace plugin's hooks/hooks.json would be dead weight (at
// best) — they are dropped instead. Everything else (matchers, commands,
// descriptions) is passed through unchanged.
//
// Usage: filter-zcode-hooks.js <hooks.json>
//   stdout: filtered hooks.json (outer { hooks: { ... } } wrapper preserved)
//   stderr: the events that were dropped, if any

const fs = require('fs');

const ZCODE_EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
]);

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: filter-zcode-hooks.js <hooks.json>\n');
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(file, 'utf8'));
const hooks = source.hooks || {};
const kept = {};
const dropped = [];

for (const [event, entries] of Object.entries(hooks)) {
  if (ZCODE_EVENTS.has(event)) {
    kept[event] = entries;
  } else {
    dropped.push(event);
  }
}

if (dropped.length > 0) {
  process.stderr.write(`dropped unsupported ZCode hook events: ${dropped.join(', ')}\n`);
}

const out = { ...source, hooks: kept };
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
