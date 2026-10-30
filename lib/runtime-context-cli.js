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

function readAgentConcurrency(configFile) {
  if (!fs.existsSync(configFile)) return null;

  let inAgents = false;
  for (const line of fs.readFileSync(configFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^\[.*\]$/.test(trimmed)) {
      inAgents = trimmed === '[agents]';
      continue;
    }
    if (!inAgents) continue;

    const match = trimmed.match(/^max_concurrent_threads_per_session\s*=\s*(\d+)\s*(?:#.*)?$/);
    if (!match) continue;
    const value = Number(match[1]);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return null;
}

function concurrencyRecommendation(agentConcurrency) {
  if (agentConcurrency !== null && agentConcurrency >= 12) {
    return 'Agent concurrency already meets the recommended twelve slots.';
  }
  return 'Configure [agents].max_concurrent_threads_per_session = 12 to opt into parallel validation capacity.';
}

function main() {
  const harness = parseArgs(process.argv.slice(2));
  const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const configFile = path.join(codexHome, 'config.toml');
  const config = readTopLevelConfig(configFile);
  const agentConcurrency = readAgentConcurrency(configFile);

  console.log(JSON.stringify({
    harness,
    model: config.model || 'unknown',
    effort_level: config.model_reasoning_effort || 'default',
    config_file: configFile,
    agent_concurrency: agentConcurrency,
    recommended_agent_concurrency: 12,
    concurrency_recommendation: concurrencyRecommendation(agentConcurrency),
  }));
}

module.exports = { readAgentConcurrency, readTopLevelConfig };

try {
  main();
} catch (error) {
  console.error(`runtime-context error: ${error.message}`);
  process.exit(1);
}
