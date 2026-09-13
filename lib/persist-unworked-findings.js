#!/usr/bin/env node
/**
 * CLI entry point for persisting unworked validation findings.
 *
 * Usage:
 *   node persist-unworked-findings.js \
 *     --findings-dir <path> \
 *     --specs-dir   <path> \
 *     --task-id     <string> \
 *     --fixed-ids   <csv> \
 *     [--run-id     <32-hex-session-id>]
 *
 * Reads every `findings-*.json` file in `--findings-dir`, drops the findings
 * whose global ID `{agent}-iter{iteration}-{id}` appears in `--fixed-ids`,
 * and writes the remainder to a self-contained markdown file under
 * `<specs-dir>/unworked_review_issues/`. With `--run-id` the filename is
 * run-keyed (`<slug>_validation_<run-id>.md`, rewritten on same-run retries);
 * without it, `<YYYY-MM-DD>_<HHMMSS>_<slug>-<random-id>.md` — a
 * per-invocation artifact published exclusively, so concurrent writers each
 * land one distinct report and never overwrite each other. The write always
 * happens and `status` is always truthful.
 *
 * Output: a single line of JSON to stdout describing the result.
 *   { "status": "written",          "written": "<path>", "counts": {...} }
 *   { "status": "empty",            "written": null,     "counts": {...} }
 *   { "status": "no-findings-files" }
 *
 * Errors go to stderr; exit code 1 on unexpected error, 0 otherwise.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { writeFileSyncAtomic, publishFileSyncExclusive } = require('./atomic-write');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      out[key] = '';
    } else {
      out[key] = value;
      i++;
    }
  }
  return out;
}

function slugify(input) {
  const lowered = String(input || '').toLowerCase();
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-');
  const collapsed = replaced.replace(/-+/g, '-');
  const trimmed = collapsed.replace(/^-+|-+$/g, '');
  return trimmed.slice(0, 60);
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatTimestamp(date) {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return {
    datePart: `${yyyy}-${mm}-${dd}`,
    timePart: `${hh}${mi}${ss}`,
    human: `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
  };
}

function parseFixedIds(csv) {
  if (!csv) return new Set();
  return new Set(
    csv
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

// A finding is persisted only while it still demands work. Reviewers mark
// closure outcomes on the finding itself; anything resolved, approved, fixed,
// or merely observed during closure must never re-enter the unworked ledger.
const CLOSED_DISPOSITIONS = new Set(['resolved', 'approved', 'fixed', 'closure-observation']);

function shouldPersist(record, fixedIds) {
  if (fixedIds.has(record.globalId)) return false;
  const disposition = record.disposition;
  if (disposition !== undefined && disposition !== null && disposition !== '') {
    if (CLOSED_DISPOSITIONS.has(String(disposition).toLowerCase())) return false;
    return String(disposition).toLowerCase() === 'actionable';
  }
  // Legacy records carry no disposition; the reviewer contract that produced
  // them only emitted items demanding work, so they stay actionable.
  return true;
}

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };

function severityRank(sev) {
  const key = String(sev || '').toLowerCase();
  return SEVERITY_ORDER[key] !== undefined ? SEVERITY_ORDER[key] : 99;
}

function loadFindings(findingsDir) {
  let entries;
  try {
    entries = fs.readdirSync(findingsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((name) => /^findings-.*\.json$/.test(name))
    .map((name) => path.join(findingsDir, name));
}

function collectFindings(findingsFiles, fixedIds) {
  const kept = [];
  for (const filePath of findingsFiles) {
    let parsed;
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error(`warning: skipping ${filePath}: ${err.message}`);
      continue;
    }
    if (!parsed || !Array.isArray(parsed.findings)) {
      console.error(`warning: skipping ${filePath}: missing 'findings' array`);
      continue;
    }
    const agent = parsed.agent || 'unknown-agent';
    const iteration = parsed.iteration !== undefined ? parsed.iteration : '?';
    for (const finding of parsed.findings) {
      if (!finding || finding.id === undefined) continue;
      const globalId = `${agent}-iter${iteration}-${finding.id}`;
      const record = {
        agent,
        iteration,
        globalId,
        disposition: finding.disposition,
        severity: String(finding.severity || 'minor').toLowerCase(),
        category: finding.category || '',
        file: finding.file || '',
        line: finding.line !== undefined ? finding.line : '',
        finding: finding.finding || '',
        recommendation: finding.recommendation || ''
      };
      if (!shouldPersist(record, fixedIds)) continue;
      kept.push(record);
    }
  }
  return kept;
}

function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    const sevDiff = severityRank(a.severity) - severityRank(b.severity);
    if (sevDiff !== 0) return sevDiff;
    if (a.agent !== b.agent) return a.agent < b.agent ? -1 : 1;
    const aLoc = `${a.file}:${a.line}`;
    const bLoc = `${b.file}:${b.line}`;
    if (aLoc !== bLoc) return aLoc < bLoc ? -1 : 1;
    return 0;
  });
}

function countBySeverity(findings) {
  const counts = { critical: 0, major: 0, minor: 0 };
  for (const f of findings) {
    if (counts[f.severity] !== undefined) counts[f.severity]++;
  }
  return counts;
}

const SEVERITY_HEADINGS = [
  ['critical', 'Critical'],
  ['major', 'Major'],
  ['minor', 'Minor']
];

function renderMarkdown({ findings, taskId, humanTimestamp, counts }) {
  const total = findings.length;
  const lines = [];
  lines.push('# Unworked Review Issues');
  lines.push('');
  lines.push(`**Run:** ${humanTimestamp}`);
  lines.push(`**Task:** ${taskId}`);
  lines.push(
    `**Total:** ${total} (${counts.critical} critical, ${counts.major} major, ${counts.minor} minor)`
  );
  lines.push('');

  let counter = 1;
  for (const [severityKey, heading] of SEVERITY_HEADINGS) {
    const bucket = findings.filter((f) => f.severity === severityKey);
    if (bucket.length === 0) continue;
    lines.push(`## ${heading}`);
    lines.push('');
    for (const f of bucket) {
      const location = f.line !== '' ? `${f.file}:${f.line}` : f.file;
      const category = f.category ? ` | ${f.category}` : '';
      lines.push(
        `${counter}. [ ] **${f.agent}** | \`${location}\`${category}`
      );
      if (f.finding) lines.push(`   ${f.finding}`);
      if (f.recommendation) lines.push(`   *Recommendation:* ${f.recommendation}`);
      lines.push('');
      counter++;
    }
  }

  return lines.join('\n').replace(/\n+$/, '\n');
}

function atomicWrite(file, content) {
  writeFileSyncAtomic(file, content, { mkdir: true });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findingsDir = args['findings-dir'];
  const specsDir = args['specs-dir'];
  const taskId = args['task-id'] || 'manual-validation';
  const fixedIdsCsv = args['fixed-ids'] || '';
  const runId = args['run-id'] || '';

  if (!findingsDir || !specsDir) {
    console.error(
      'Usage: persist-unworked-findings.js --findings-dir <path> --specs-dir <path> --task-id <string> [--fixed-ids <csv>]'
    );
    process.exit(1);
  }
  if (runId && !/^[a-f0-9]{32}$/.test(runId)) {
    throw new Error('--run-id must be a 32-character lowercase hexadecimal validation session ID');
  }

  const findingsFiles = loadFindings(findingsDir);
  if (findingsFiles.length === 0) {
    console.log(JSON.stringify({ status: 'no-findings-files' }));
    return;
  }

  const fixedIds = parseFixedIds(fixedIdsCsv);
  const kept = collectFindings(findingsFiles, fixedIds);
  const counts = countBySeverity(kept);

  if (kept.length === 0) {
    console.log(
      JSON.stringify({ status: 'empty', written: null, counts })
    );
    return;
  }

  const sorted = sortFindings(kept);
  const ts = formatTimestamp(new Date());
  const slug = slugify(taskId) || 'task';
  const outDir = path.join(specsDir, 'unworked_review_issues');
  fs.mkdirSync(outDir, { recursive: true });

  const markdown = renderMarkdown({
    findings: sorted,
    taskId,
    humanTimestamp: ts.human,
    counts
  });

  let outPath;
  if (runId) {
    // Run-keyed name: a same-run re-invocation (e.g. crash retry of step 5.5)
    // rewrites the same file with the latest state — one report per run,
    // last write wins, and "written" is always truthful.
    outPath = path.join(outDir, `${slug}_validation_${runId}.md`);
    atomicWrite(outPath, markdown);
  } else {
    // Manual invocations are per-invocation artifacts: concurrent writers
    // with the same task, directory, and timestamp must each land a distinct
    // report. The name carries collision-resistant invocation identity and
    // is published exclusively — no existsSync probe, no silent overwrite.
    outPath = publishManualReport(outDir, ts, slug, markdown);
  }

  console.log(
    JSON.stringify({ status: 'written', written: outPath, counts })
  );
}

// Exclusive publication of a per-invocation manual report. The random
// identity makes a collision between concurrent invocations vanishingly
// unlikely; the exclusive publish makes even that collision a retried new
// name rather than an overwrite.
function publishManualReport(outDir, ts, slug, markdown) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const identity = crypto.randomBytes(4).toString('hex');
    const candidate = path.join(outDir, `${ts.datePart}_${ts.timePart}_${slug}-${identity}.md`);
    try {
      return publishFileSyncExclusive(candidate, markdown);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('could not allocate a unique manual report name');
}

try {
  main();
} catch (error) {
  console.error(`persist-unworked-findings error: ${error.message}`);
  process.exit(1);
}
