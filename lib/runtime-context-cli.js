#!/usr/bin/env node
/**
 * Resolve harness runtime values needed by exported Groundwork skills.
 *
 * Usage:
 *   node runtime-context-cli.js --harness codex
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  if (argv.length !== 2 || argv[0] !== '--harness' || argv[1] !== 'codex') {
    throw new Error('Usage: runtime-context-cli.js --harness codex');
  }
  return argv[1];
}

function parseTomlString(raw) {
  const value = raw.trim();
  if (value.startsWith('"')) {
    const match = value.match(/^"(?:[^"\\]|\\.)*"/);
    return match ? JSON.parse(match[0]) : null;
  }
  if (value.startsWith("'")) {
    const end = value.indexOf("'", 1);
    return end === -1 ? null : value.slice(1, end);
  }
  return null;
}

function readTopLevelConfig(configFile) {
  if (!fs.existsSync(configFile)) return {};

  const values = {};
  for (const line of fs.readFileSync(configFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) break;

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) continue;
    const value = parseTomlString(match[2]);
    if (value !== null) values[match[1]] = value;
  }
  return values;
}

function main() {
  const harness = parseArgs(process.argv.slice(2));
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const configFile = path.join(codexHome, 'config.toml');
  const config = readTopLevelConfig(configFile);

  console.log(JSON.stringify({
    harness,
    model: config.model || 'unknown',
    effort_level: config.model_reasoning_effort || 'default',
    config_file: configFile,
  }));
}

try {
  main();
} catch (error) {
  console.error(`runtime-context error: ${error.message}`);
  process.exit(1);
}
