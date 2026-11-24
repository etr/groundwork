#!/usr/bin/env node
'use strict';

// Keep the plugin manifest version equal to the package version.
//
// Changesets bump package.json (`changeset version`), but the manifest every
// harness reads is .claude-plugin/plugin.json. Run this right after a version
// bump so the two cannot drift apart (tests/sync-plugin-version.test.js fails
// the suite when they do):
//
//   node lib/sync-plugin-version.js
//
// The edit is a targeted text replacement, never a re-serialization: the
// manifest's hand formatting (inline arrays, key order) survives untouched.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PACKAGE_JSON = path.join(ROOT, 'package.json');
const DEFAULT_PLUGIN_JSON = path.join(ROOT, '.claude-plugin', 'plugin.json');

const VERSION_LINE = /("version":\s*")([^"]+)(")/;

function readVersion(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof parsed.version !== 'string' || !/^\d+\.\d+\.\d+/.test(parsed.version)) {
    throw new Error(`${file}: no semantic "version" field`);
  }
  return parsed.version;
}

function sync({ packageJson = DEFAULT_PACKAGE_JSON, pluginJson = DEFAULT_PLUGIN_JSON } = {}) {
  const version = readVersion(packageJson);
  const before = fs.readFileSync(pluginJson, 'utf8');
  if (readVersion(pluginJson) === version) return { changed: false, version };

  if (!VERSION_LINE.test(before)) {
    throw new Error(`${pluginJson}: no "version" line to update`);
  }
  fs.writeFileSync(pluginJson, before.replace(VERSION_LINE, `$1${version}$3`));
  return { changed: true, version };
}

if (require.main === module) {
  const result = sync();
  console.log(
    result.changed
      ? `plugin.json version set to ${result.version}`
      : `plugin.json already at ${result.version}`
  );
}

module.exports = { sync, VERSION_LINE };
