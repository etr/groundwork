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
  { source: 'lib/redact.js', installed: 'redact.js' },
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

// Find the '}' closing a template ${...} expression with full lexical
// awareness: strings, comments, regex literals, and nested templates must
// not terminate the expression. Returns -1 when the expression is
// unbalanced (the caller fails closed).
function findTemplateExpressionEnd(source, from) {
  let i = from;
  let depth = 1;
  let lastSignificant = '';
  const regexAllowed = () => lastSignificant === ''
    || '(,=:[!&|?{};,+*-%<>~^'.includes(lastSignificant);
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i++;
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\\') i++;
        i++;
      }
      if (i >= source.length) return -1;
      i++;
      lastSignificant = ch;
      continue;
    }
    if (ch === '`') {
      // Nested template: skip it with the same rules, recursively.
      i++;
      let nested = 1;
      while (i < source.length && nested > 0) {
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '$' && source[i + 1] === '{') {
          const inner = findTemplateExpressionEnd(source, i + 2);
          if (inner === -1) return -1;
          i = inner + 1;
          continue;
        }
        if (c === '`') nested--;
        i++;
      }
      if (nested > 0) return -1;
      lastSignificant = '`';
      continue;
    }
    if (ch === '/' && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < source.length) {
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '\n') return -1; // unterminated regex: unprovable
        if (inClass) {
          if (c === ']') inClass = false;
        } else if (c === '[') inClass = true;
        else if (c === '/') { i++; break; }
        i++;
      }
      while (/[a-z]/i.test(source[i] || '')) i++;
      lastSignificant = '/';
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
    lastSignificant = ch;
    i++;
  }
  return -1;
}

function tokenizeJavaScript(source, baseOffset = 0, state = { errors: [] }) {
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
      if (end === -1) {
        // Unterminated block comment: everything after it is unprovable.
        state.errors.push(`unterminated block comment at offset ${i + baseOffset}`);
        break;
      }
      const stop = end + 2;
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
      if (i >= source.length) {
        // Unterminated string: the lexer cannot prove what follows, so the
        // closure is unprovable — the caller fails closed.
        state.errors.push(`unterminated string literal at offset ${start + baseOffset}`);
        break;
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
        if (i >= source.length) {
          state.errors.push(`unterminated template literal at offset ${baseOffset + chunkStart - 1}`);
          break;
        }
        const c = source[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '`') break;
        if (c === '$' && source[i + 1] === '{') {
          if (i > chunkStart) {
            push('template', source.slice(chunkStart, i), chunkStart, i, { hasSubstitution: false });
            previousMeaningful = tokens[tokens.length - 1];
          }
          const expressionStart = i + 2;
          // Boundary via the lexing-aware finder, never brace counting: a
          // '}' inside a string or regex must not end the expression.
          const expressionEnd = findTemplateExpressionEnd(source, expressionStart);
          if (expressionEnd === -1) {
            state.errors.push(`unterminated template expression at offset ${baseOffset + expressionStart}`);
            break;
          }
          // Splice the substitution's own tokens (strings, nested templates,
          // calls, comments) into this stream, sharing the error state.
          const subState = { errors: state.errors };
          tokens.push(...tokenizeJavaScript(source.slice(expressionStart, expressionEnd), baseOffset + expressionStart, subState));
          i = expressionEnd + 1; // consume '}'
          chunkStart = i;
          continue;
        }
        i++;
      }
      if (i > chunkStart && i <= source.length) {
        push('template', source.slice(chunkStart, i), chunkStart, i, { hasSubstitution: false });
        previousMeaningful = tokens[tokens.length - 1];
      }
      i++; // closing backtick (or EOF for an unterminated template)
      continue;
    }
    // Regex literal vs division
    if (ch === '/') {
      // Regex context per standard heuristics: after an operator/punct or a
      // keyword — never after ')', ']', '}', '.', a literal, or an
      // identifier (those make '/' a division).
      const regexContext = previousMeaningful === null
        || (previousMeaningful.type === 'punct' && ![')', ']', '}', '.'].includes(previousMeaningful.value))
        || (previousMeaningful.type === 'keyword');
      if (regexContext) {
        const start = i;
        i++;
        let inClass = false;
        let terminated = false;
        while (i < source.length) {
          const c = source[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '\n') break; // a regex literal never spans lines
          if (inClass) {
            if (c === ']') inClass = false;
          } else if (c === '[') {
            inClass = true;
          } else if (c === '/') {
            i++;
            terminated = true;
            break;
          }
          i++;
        }
        if (!terminated) {
          // Started like a regex but never closed: the lexer cannot prove
          // what the rest of the line is.
          state.errors.push(`unterminated regular expression at offset ${start + baseOffset}`);
          break;
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
function scanRequireCalls(source, state) {
  const lexState = state || { errors: [] };
  const tokens = tokenizeJavaScript(source, 0, lexState);
  const calls = [];

  // Narrow fail-closed grammar: every executable `require` reference must
  // be (1) a recognized direct call, (2) an approved member access
  // (`require.main`), or (3) explicitly classified with the marker comment.
  // Any other bare/indirect use — aliasing (`const r = require`, commented
  // or parenthesized), `require.call`, `Reflect.apply(require, ...)` — is
  // reported as unprovable. No alias pattern enumeration: unrecognized
  // shapes simply do not pass.
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const isRequire = token.type === 'keyword' && token.value === 'require';
    const isImport = token.type === 'keyword' && token.value === 'import';
    if (!isRequire && !isImport) continue;

    // Skip comments and wrapping close-parens (`(require)(...)`), plus the
    // optional-call sequence `?.` — but NOT a bare `.`, which is member
    // access, handled below.
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

    // Approved member access: `require.main` (and nothing else).
    if (isRequire && tokens[cursor] && tokens[cursor].type === 'punct' && tokens[cursor].value === '.') {
      const member = tokens[cursor + 1];
      if (member && member.type === 'id' && member.value === 'main') {
        index = cursor + 1;
        continue;
      }
    }

    // Not a direct call head: a bare/indirect reference. It is only
    // acceptable with the explicit classification marker on its line span.
    if (cursor >= tokens.length || tokens[cursor].type !== 'punct' || tokens[cursor].value !== '(') {
      if (isRequire) calls.push({ kind: 'indirect', request: null, start: token.start, end: token.end });
      continue;
    }
    if (isImport && (cursor !== index + 1 || optional)) continue; // `(import)(x)` / `import?.(x)` are not dynamic imports

    const openParen = cursor;
    // Find the matching close paren (comments are not parens).
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
    // The argument is the first non-comment token inside the parens:
    // `require(/* why */ "./x")` is a literal require, not a dynamic one.
    let argumentIndex = openParen + 1;
    while (argumentIndex < tokens.length && tokens[argumentIndex].type === 'comment') argumentIndex++;
    let afterArgument = argumentIndex + 1;
    while (afterArgument < tokens.length && tokens[afterArgument].type === 'comment') afterArgument++;
    const argumentToken = tokens[argumentIndex];
    const singleArgument = closeParen !== -1 && afterArgument === closeParen;
    let kind = 'dynamic';
    let request = null;
    if (argumentToken && singleArgument) {
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
  // Fail closed on unprovable lexing: an unterminated string/template (or
  // template expression) makes the import closure unprovable.
  const lexState = { errors: [] };
  const detectedCalls = scanRequireCalls(text, lexState);
  if (lexState.errors.length > 0) {
    problems.push(
      `${entry.source} cannot be lexed reliably (${lexState.errors[0]}): `
        + 'the import closure is unprovable — fix the syntax or simplify it so the scanner can prove it'
    );
    return;
  }
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

  const classifiedByComment = (call) => {
    const requireLine = lineStarts[lineNumberAt(call.start) - 1];
    const endLineBreak = text.indexOf('\n', call.end === call.start ? call.start : call.end);
    const spanStart = requireLine;
    const spanEnd = endLineBreak === -1 ? text.length : endLineBreak;
    return tokenizeJavaScript(text.slice(spanStart, spanEnd), spanStart)
      .some((tok) => tok.type === 'comment' && tok.value.includes(CLASSIFIED_DYNAMIC_MARKER));
  };

  for (const call of detectedCalls) {
    if (call.kind === 'indirect') {
      // Bare/indirect require reference: acceptable only with an explicit
      // classification comment on its line (aliases, require.call,
      // Reflect.apply, … are all indirect unless classified).
      if (!classifiedByComment(call)) {
        const line = text.slice(lineStarts[lineNumberAt(call.start) - 1],
          text.indexOf('\n', call.start) === -1 ? text.length : text.indexOf('\n', call.start));
        problems.push(
          `${entry.source}:${lineNumberAt(call.start)} has a bare/indirect require reference (${line.trim()}) that is not a recognized direct call or require.main access — `
            + `classify it by appending "// ${CLASSIFIED_DYNAMIC_MARKER}" and justify it, `
            + 'or rewrite it as a literal require of a manifested module'
        );
      }
      continue;
    }
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
    if (!classifiedByComment(call)) {
      const line = text.slice(lineStarts[lineNumberAt(call.start) - 1],
        text.indexOf('\n', call.start) === -1 ? text.length : text.indexOf('\n', call.start));
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
