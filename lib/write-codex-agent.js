#!/usr/bin/env node
'use strict';

// Safely writes one native Codex agent beneath its configured destination.
// Content is read from stdin and installed through an atomic rename.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--force') {
      args.force = true;
      continue;
    }
    const value = argv[i + 1];
    if ((argv[i] !== '--base' && argv[i] !== '--dest') || value === undefined) {
      throw new Error('Usage: write-codex-agent.js --base DIR --dest FILE [--force]');
    }
    args[argv[i].slice(2)] = value;
    i++;
  }
  if (!args.base || !args.dest) {
    throw new Error('Codex agent writes require --base and --dest');
  }
  return args;
}

function lstatIfPresent(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function requireDirectory(target) {
  const stat = lstatIfPresent(target);
  if (stat) {
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink in Codex agent path: ${target}`);
    if (!stat.isDirectory()) throw new Error(`Codex agent path component is not a directory: ${target}`);
    return;
  }
  fs.mkdirSync(target);
}

function assertContained(base, target) {
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Codex agent destination escapes its base: ${target}`);
  }
}

function writeAgent(args, content) {
  const base = path.resolve(args.base);
  const dest = path.resolve(args.dest);
  assertContained(base, dest);

  requireDirectory(base);
  const parent = path.dirname(dest);
  const relativeParent = path.relative(base, parent);
  let current = base;
  if (relativeParent) {
    for (const component of relativeParent.split(path.sep)) {
      current = path.join(current, component);
      requireDirectory(current);
    }
  }

  const baseReal = fs.realpathSync(base);
  const parentReal = fs.realpathSync(parent);
  assertContained(baseReal, parentReal);

  const existing = lstatIfPresent(dest);
  if (existing && existing.isSymbolicLink()) {
    throw new Error(`Refusing symlink at Codex agent destination: ${dest}`);
  }
  if (existing && !existing.isFile()) {
    throw new Error(`Codex agent destination is not a file: ${dest}`);
  }
  if (existing && !args.force) return 'skipped';

  let temporary;
  let descriptor;
  try {
    for (let attempt = 0; attempt < 10; attempt++) {
      temporary = path.join(parent, `.groundwork-agent-${crypto.randomBytes(8).toString('hex')}.tmp`);
      try {
        descriptor = fs.openSync(temporary, 'wx', 0o600);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    if (descriptor === undefined) throw new Error('Could not create a temporary Codex agent file');

    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;

    assertContained(baseReal, fs.realpathSync(parent));
    const finalStat = lstatIfPresent(dest);
    if (finalStat && finalStat.isSymbolicLink()) {
      throw new Error(`Refusing symlink at Codex agent destination: ${dest}`);
    }
    fs.renameSync(temporary, dest);
    temporary = undefined;
    return 'written';
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (temporary) {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (input += chunk));
  process.stdin.on('end', () => {
    try {
      process.stdout.write(`${writeAgent(parseArgs(process.argv.slice(2)), input)}\n`);
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  });
}

module.exports = { assertContained, parseArgs, writeAgent };
