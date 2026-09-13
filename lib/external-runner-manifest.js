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

// --- Lexical scanner -----------------------------------------------------
// A regex over raw source cannot distinguish code from comments, strings, or
// wrapped calls — `(require)("./x")` and `require /* c */ ("./x")` both slip
// past per-line and call-span regexes. The scanner below tokenizes with full
// comment/string/template/regex awareness and then walks the token stream.

function tokenizeJavaScript(source, baseOffset = 0) {
  const tokens = [];
  const push = (type, value, start, end, extra) => tokens.push({ type, value, start: start + baseOffset, end: end + baseOffset, ...extra });
  const idStart = /[A-Za-z_$]/;
  const idPart = /[A-Za-z0-9_$]/;
  let i = 0;
  let previousMeaningful = null; // for regex-vs-division disambiguation

  while (i < source.length) {
    const ch = source[i];
    // Whitespace
    if (/\s/.test(ch)) { i++; continue; }
    // Comments become tokens: the classification marker is only valid in a
    // real comment, never in a string that merely spells it out.
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      push('comment', source.slice(i, stop), i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      push('comment', source.slice(i, stop), i, stop);
      i = stop;
      continue;
    }
    // Strings
    if (ch === '"' || ch === "'") {
      const start = i;
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++; // closing quote
      push('string', source.slice(start + 1, i - 1), start, i);
      previousMeaningful = tokens[tokens.length - 1];
      continue;
    }
    // Template literals: literal chunks are string-like tokens; each
    // ${...} substitution is RECURSIVELY tokenized (a require hiding inside
    // one is still seen), with offsets mapped back to the outer source.
    if (ch === '`') {
      i++;
      let chunkStart = i;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (i >= source.length) break;
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '`') break;
        if (c === '$' && source[i + 1] === '{') {
          if (i > chunkStart) {
            push('template', source.slice(chunkStart, i), chunkStart, i, { hasSubstitution: false });
            previousMeaningful = tokens[tokens.length - 1];
          }
          const expressionStart = i + 2;
          let depth = 1;
          i = expressionStart;
          while (i < source.length && depth > 0) {
            const e = source[i];
            if (e === '\\') { i += 2; continue; }
            if (e === '{') depth++;
            else if (e === '}') { depth--; if (depth === 0) break; }
            i++;
          }
          // Splice the substitution's own tokens (strings, nested templates,
          // calls, comments) into this stream.
          tokens.push(...tokenizeJavaScript(source.slice(expressionStart, i), baseOffset + expressionStart));
          i++; // consume '}'
          chunkStart = i;
          continue;
        }
        i++;
      }
      if (i > chunkStart) {
        push('template', source.slice(chunkStart, i), chunkStart, i, { hasSubstitution: false });
        previousMeaningful = tokens[tokens.length - 1];
      }
      i++; // closing backtick
      continue;
    }
    // Regex literal vs division
    if (ch === '/') {
      const regexContext = previousMeaningful === null
        || (previousMeaningful.type === 'punct' && ![')', ']', '}'].includes(previousMeaningful.value))
        || (previousMeaningful.type === 'keyword');
      if (regexContext) {
        const start = i;
        i++;
        let inClass = false;
        while (i < source.length) {
          const c = source[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '\n') break; // unterminated: not a regex after all
          if (inClass) {
            if (c === ']') inClass = false;
          } else if (c === '[') {
            inClass = true;
          } else if (c === '/') {
            i++;
            break;
          }
          i++;
        }
        while (/[a-z]/i.test(source[i] || '')) i++; // flags
        push('regex', source.slice(start, i), start, i);
        previousMeaningful = tokens[tokens.length - 1];
        continue;
      }
      push('punct', '/', i, i + 1);
      i++;
      previousMeaningful = tokens[tokens.length - 1];
      continue;
    }
    // Identifiers / keywords / numbers
    if (idStart.test(ch)) {
      const start = i;
      while (i < source.length && idPart.test(source[i])) i++;
      const word = source.slice(start, i);
      push(/^(require|import|return|typeof|new|case|in|of|do|else|yield|await|delete|void|throw|instanceof)$/.test(word) ? 'keyword' : 'id', word, start, i);
      previousMeaningful = tokens[tokens.length - 1];
      continue;
    }
    // A lone '.' is punctuation (optional chaining, member access); a
    // number must start with a digit or '.<digit>'.
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      const start = i;
      while (i < source.length && /[0-9a-fA-FxXoObBeE_.]/.test(source[i])) i++;
      push('number', source.slice(start, i), start, i);
      previousMeaningful = tokens[tokens.length - 1];
      continue;
    }
    // Punctuation (single char is enough for call detection)
    push('punct', ch, i, i + 1);
    previousMeaningful = tokens[tokens.length - 1];
    i++;
  }
  return tokens;
}

// Every `require`/`import()` call in the token stream, with its argument
// classification and source span (allowing wrapped forms like `(require)(x)`).
function scanRequireCalls(source) {
  const tokens = tokenizeJavaScript(source);
  const calls = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const isRequire = token.type === 'keyword' && token.value === 'require';
    const isImport = token.type === 'keyword' && token.value === 'import';
    if (!isRequire && !isImport) continue;

    // Skip wrapping close-parens (`(require)(...)`) and the optional-call
    // sequence `?.` (`require?.(...)`) — but NOT a bare `.`, which is a
    // property access like require.resolve, never an import.
    let cursor = index + 1;
    let optional = false;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const next = tokens[cursor];
      if (next && next.type === 'comment') { cursor++; continue; }
      if (next && next.type === 'punct' && next.value === ')') { cursor++; continue; }
      if (next && next.type === 'punct' && next.value === '?'
          && tokens[cursor + 1] && tokens[cursor + 1].type === 'punct' && tokens[cursor + 1].value === '.') {
        optional = true;
        cursor += 2;
        continue;
      }
      break;
    }
    if (cursor >= tokens.length || tokens[cursor].type !== 'punct' || tokens[cursor].value !== '(') continue;
    if (isImport && (cursor !== index + 1 || optional)) continue; // `(import)(x)` / `import?.(x)` are not dynamic imports

    const openParen = cursor;
    // Find the matching close paren.
    let depth = 0;
    let closeParen = -1;
    for (let scan = openParen; scan < tokens.length; scan++) {
      const tok = tokens[scan];
      if (tok.type === 'punct' && tok.value === '(') depth++;
      if (tok.type === 'punct' && tok.value === ')') {
        depth--;
        if (depth === 0) { closeParen = scan; break; }
      }
    }
    const argumentToken = tokens[openParen + 1];
    let kind = 'dynamic';
    let request = null;
    if (argumentToken && closeParen === openParen + 2) {
      if (argumentToken.type === 'string') {
        kind = 'literal';
        request = argumentToken.value;
      } else if (argumentToken.type === 'template' && !argumentToken.hasSubstitution) {
        kind = 'literal';
        request = argumentToken.value;
      }
    }
    calls.push({
      kind,
      request,
      start: token.start,
      end: closeParen === -1 ? source.length : tokens[closeParen].end,
    });
    index = Math.max(index, openParen);
  }
  return calls;
}

function scanModuleClosure(entry, declaredSources, problems) {
  const sourcePath = path.resolve(PLUGIN_ROOT, entry.source);
  let text = '';
  try {
    text = fs.readFileSync(sourcePath, 'utf8');
  } catch {
    return; // missing sources are already reported by the stat pass
  }
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

  for (const call of scanRequireCalls(text)) {
    if (call.kind === 'literal') {
      if (call.request.startsWith('.')) {
        const resolved = resolveRelativeRequire(fromDir, call.request);
        if (!declaredSources.has(resolved)) {
          problems.push(
            `${entry.source} transitively requires "${call.request}" (resolves to `
              + `${path.relative(PLUGIN_ROOT, resolved)}) which the manifest does not declare — `
              + 'the exported runner would fail at runtime; add it to the manifest or remove the import'
          );
        }
      }
      continue;
    }
    // Dynamic require/import: only acceptable with the explicit
    // classification marker in an actual COMMENT on the physical line span
    // of the call — a string that merely spells the marker does not classify
    // anything.
    const requireLine = lineStarts[lineNumberAt(call.start) - 1];
    const endLineBreak = text.indexOf('\n', call.end);
    const spanStart = requireLine;
    const spanEnd = endLineBreak === -1 ? text.length : endLineBreak;
    const classifiedByComment = tokenizeJavaScript(text.slice(spanStart, spanEnd), spanStart)
      .some((tok) => tok.type === 'comment' && tok.value.includes(CLASSIFIED_DYNAMIC_MARKER));
    if (!classifiedByComment) {
      const line = text.slice(spanStart, spanEnd).split('\n')[0];
      problems.push(
        `${entry.source}:${lineNumberAt(call.start)} has a dynamic require (${line.trim()}) — `
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

module.exports = {
  RUNTIME_FILES,
  RUNNER_ENTRY,
  validateManifest,
  checkedEntries,
  tokenizeJavaScript,
  scanRequireCalls,
};
