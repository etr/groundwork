#!/usr/bin/env node
'use strict';

// Render a Codex custom-agent TOML file from transformed agent instructions.
// Reads developer instructions from stdin.

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag || !flag.startsWith('--') || value === undefined) {
      throw new Error('Usage: render-codex-agent.js --name NAME --description TEXT [--model MODEL] [--effort EFFORT]');
    }
    args[flag.slice(2)] = value;
  }
  if (!args.name || !args.description) {
    throw new Error('Codex agents require --name and --description');
  }
  return args;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function renderAgent(args, instructions) {
  const lines = [
    `name = ${tomlString(args.name)}`,
    `description = ${tomlString(args.description)}`,
    `developer_instructions = ${tomlString(instructions)}`,
  ];
  if (args.model) lines.push(`model = ${tomlString(args.model)}`);
  if (args.effort) lines.push(`model_reasoning_effort = ${tomlString(args.effort)}`);
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    try {
      process.stdout.write(renderAgent(parseArgs(process.argv.slice(2)), input));
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

module.exports = { parseArgs, renderAgent, tomlString };
