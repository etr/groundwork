#!/usr/bin/env node
'use strict';

// Removes one exact legacy Groundwork agent skill without following symlinks.

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if ((flag !== '--base' && flag !== '--skill') || value === undefined) {
      throw new Error('Usage: remove-legacy-codex-agent-skill.js --base DIR --skill FILE');
    }
    args[flag.slice(2)] = value;
  }
  if (!args.base || !args.skill) throw new Error('Legacy cleanup requires --base and --skill');
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

function assertContained(base, target) {
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Legacy Codex skill escapes its base: ${target}`);
  }
}

function sameDirectory(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function enterVerifiedDirectory(target, displayPath) {
  const before = lstatIfPresent(target);
  if (!before) return false;
  if (before.isSymbolicLink()) {
    throw new Error(`Refusing symlink in legacy Codex skill path: ${displayPath}`);
  }
  if (!before.isDirectory()) {
    throw new Error(`Legacy Codex skill path is not a directory: ${displayPath}`);
  }

  process.chdir(target);
  const after = fs.statSync('.');
  if (!sameDirectory(before, after)) {
    throw new Error(`Legacy Codex skill path changed during cleanup: ${displayPath}`);
  }
  return true;
}

function removeLegacySkill(args) {
  const base = path.resolve(args.base);
  const skill = path.resolve(args.skill);
  assertContained(base, skill);

  const relative = path.relative(base, skill);
  const components = relative.split(path.sep);
  if (
    components.length !== 3 ||
    components[0] !== 'skills' ||
    !/^review-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(components[1]) ||
    components[2] !== 'SKILL.md'
  ) {
    throw new Error(`Legacy cleanup only accepts an exact review agent SKILL.md: ${skill}`);
  }

  const reviewDirectory = components[1];
  const originalCwd = process.cwd();
  try {
    if (!enterVerifiedDirectory(base, base)) return 'missing';
    if (!enterVerifiedDirectory('skills', path.join(base, 'skills'))) return 'missing';
    if (!enterVerifiedDirectory(reviewDirectory, path.dirname(skill))) return 'missing';

    const skillStat = lstatIfPresent('SKILL.md');
    if (!skillStat) return 'missing';
    if (skillStat.isSymbolicLink()) throw new Error(`Refusing symlink at legacy Codex skill: ${skill}`);
    if (!skillStat.isFile()) throw new Error(`Legacy Codex skill is not a file: ${skill}`);

    // The working directory is the verified directory inode, so this relative
    // unlink cannot be redirected by replacing any previously checked path.
    fs.unlinkSync('SKILL.md');
    process.chdir('..');
    try {
      fs.rmdirSync(reviewDirectory);
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST' && error.code !== 'ENOENT') {
        throw error;
      }
    }
    return 'removed';
  } finally {
    process.chdir(originalCwd);
  }
}

if (require.main === module) {
  try {
    process.stdout.write(`${removeLegacySkill(parseArgs(process.argv.slice(2)))}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertContained, enterVerifiedDirectory, parseArgs, removeLegacySkill };
