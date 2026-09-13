#!/usr/bin/env node
'use strict';

// Dependency contract for the standalone external runner bundle (Codex).
//
// The exported runner is not a single file: bin/groundwork-run.js loads a set
// of local runtime helpers, and those helpers load each other. This manifest
// is the single checked source of truth for that closure. The installer loops
// over it (no hand-maintained helper list), the runner loads every helper
// through a fail-closed loader, and tests hold all three in lockstep.
//
// Every entry is required. There is no optional startup helper: an export
// that omits one is corrupted and must be reinstalled, not degraded.

const fs = require('fs');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

// source: repository-relative path of the runtime file.
// installed: filename it is colocated under in the standalone bundle root.
const RUNTIME_FILES = [
  { source: 'bin/groundwork-run.js', installed: 'groundwork-run.js' },
  { source: 'lib/run-reporting.js', installed: 'run-reporting.js' },
  { source: 'lib/validation-session.js', installed: 'validation-session.js' },
  { source: 'lib/atomic-write.js', installed: 'atomic-write.js' },
  { source: 'lib/owned-lock.js', installed: 'owned-lock.js' },
  { source: 'lib/lease-mutation.js', installed: 'lease-mutation.js' },
  { source: 'lib/process-identity.js', installed: 'process-identity.js' },
  { source: 'lib/worktree-identity.js', installed: 'worktree-identity.js' },
  { source: 'lib/project-context.js', installed: 'project-context.js' },
  { source: 'lib/plan-check.js', installed: 'plan-check.js' },
];

// The runner script entry must be declared exactly once.
const RUNNER_ENTRY = 'groundwork-run.js';

// Repository roots a manifest source may live in. Anything else (skills,
// docs, fixtures) is outside the standalone runner bundle by construction.
const RUNNER_ROOTS = ['bin/', 'lib/'];

// require(<expression>) inside a manifested module can load an unmanifested
// local file at runtime. Such a call is only acceptable when the line is
// explicitly classified with this marker (e.g. the runner's fail-closed
// loader, which resolves paths the manifest tests already pin).
const CLASSIFIED_DYNAMIC_MARKER = 'runtime-closure: classified';

// Resolves a literal relative require the way Node would (exact, +'.js',
// then '/index.js') so the closure check cannot be evaded by extension
// omission.
function resolveRelativeRequire(fromDir, request) {
  const base = path.resolve(fromDir, request);
  const candidates = [base, `${base}.js`, path.join(base, 'index.js')];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // try the next spelling
    }
  }
  return base; // unresolved: report against the literal spelling
}

function scanModuleClosure(entry, declaredSources, problems) {
  const sourcePath = path.resolve(PLUGIN_ROOT, entry.source);
  let text = '';
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
  } catch {
    return; // missing sources are already reported by the stat pass
  }

  // Scan every require call by its full span (the argument may wrap across
  // lines) — a per-line regex would let a multiline dynamic require slip
  // past the classification rule.
  const fromDir = path.dirname(sourcePath);
  const lineStarts = [];
  for (let i = 0; i <= text.length; i++) {
    lineStarts.push(i);
    const next = text.indexOf('\n', i);
    if (next === -1) break;
    i = next;
  }
  const lineNumberAt = (offset) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  for (const match of text.matchAll(/require\s*\(/g)) {
    const openParen = match.index + match[0].length - 1;
    const closeParen = text.indexOf(')', openParen + 1);
    const callEnd = closeParen === -1 ? text.length : closeParen + 1;
    const callText = text.slice(match.index, callEnd);
    const argument = text.slice(openParen + 1, closeParen === -1 ? text.length : closeParen);
    const quoted = argument.match(/^\s*['"]([^'"]*)['"]\s*$/);

    if (quoted) {
      // Literal import: relative requests must resolve to a declared source.
      if (quoted[1].startsWith('.')) {
        const resolved = resolveRelativeRequire(fromDir, quoted[1]);
        if (!declaredSources.has(resolved)) {
          problems.push(
            `${entry.source} transitively requires "${quoted[1]}" (resolves to `
              + `${path.relative(PLUGIN_ROOT, resolved)}) which the manifest does not declare — `
              + 'the exported runner would fail at runtime; add it to the manifest or remove the import'
          );
        }
      }
      continue;
    }

    // Dynamic require: only acceptable with the explicit classification
    // marker somewhere on the physical line span of the call (the marker
    // may trail the closing paren as a line comment).
    const requireLine = lineStarts[lineNumberAt(match.index) - 1];
    const endLineBreak = text.indexOf('\n', callEnd - 1);
    const spanText = text.slice(requireLine, endLineBreak === -1 ? text.length : endLineBreak);
    if (!spanText.includes(CLASSIFIED_DYNAMIC_MARKER)) {
      const line = spanText.split('\n')[0];
      problems.push(
        `${entry.source}:${lineNumberAt(match.index)} has a dynamic require (${line.trim()}) — `
          + `classify it by appending "// ${CLASSIFIED_DYNAMIC_MARKER}" and justify it, `
          + 'or replace it with a literal require of a manifested module'
      );
    }
  }
}

function validateManifest(entries) {
  const problems = [];
  const seenInstalled = new Set();
  const seenSource = new Set();
  for (const entry of entries) {
    if (seenInstalled.has(entry.installed)) {
      problems.push(`installed name declared twice: ${entry.installed}`);
    }
    if (seenSource.has(entry.source)) {
      problems.push(`source declared twice: ${entry.source}`);
    }
    seenInstalled.add(entry.installed);
    seenSource.add(entry.source);
    if (!/^[A-Za-z0-9._-]+$/.test(entry.installed)) {
      problems.push(`unsafe installed filename: ${entry.installed}`);
    }
    const sourcePath = path.resolve(PLUGIN_ROOT, entry.source);
    let stat = null;
    try {
      stat = fs.lstatSync(sourcePath);
    } catch {
      problems.push(`source file is missing: ${entry.source}`);
    }
    if (stat && !stat.isFile()) {
      problems.push(`source is not a regular local file: ${entry.source}`);
    }
    if (!RUNNER_ROOTS.some((root) => entry.source.startsWith(root))) {
      problems.push(
        `source ${entry.source} is outside the declared runner roots (${RUNNER_ROOTS.join(' or ')})`
      );
    }
  }
  if (!seenInstalled.has(RUNNER_ENTRY)) {
    problems.push(`the runner entry ${RUNNER_ENTRY} must be declared`);
  }
  if (problems.length === 0) {
    const declaredSources = new Set(
      entries.map((entry) => path.resolve(PLUGIN_ROOT, entry.source))
    );
    for (const entry of entries) scanModuleClosure(entry, declaredSources, problems);
  }
  return problems;
}

function checkedEntries() {
  const problems = validateManifest(RUNTIME_FILES);
  if (problems.length > 0) {
    throw new Error(`Invalid external runner manifest:\n  ${problems.join('\n  ')}`);
  }
  return RUNTIME_FILES;
}

function emitJson() {
  process.stdout.write(`${JSON.stringify(checkedEntries())}\n`);
}

function emitTsv() {
  const lines = checkedEntries().map((entry) => `${entry.source}\t${entry.installed}`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

function usage() {
  return 'Usage: external-runner-manifest.js --json | --tsv';
}

if (require.main === module) {
  try {
    const format = process.argv[2];
    if (format === '--json') emitJson();
    else if (format === '--tsv') emitTsv();
    else throw new Error(usage());
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { RUNTIME_FILES, RUNNER_ENTRY, validateManifest, checkedEntries };
