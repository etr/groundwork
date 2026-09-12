#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AGENT_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const GLOBAL_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-iter[1-9]\d*-[1-9]\d*$/;
const SEVERITIES = ['critical', 'major', 'minor'];
const REVIEW_MODES = ['initial-audit', 'closure-review'];
const CLOSURE_ORIGINS = [
  'introduced-by-fix',
  'exposed-by-fix',
  'invalidated-prior-assumption',
  'initial-audit-miss',
  'scope-expansion',
];
const BLOCKING_CLOSURE_ORIGINS = CLOSURE_ORIGINS.slice(0, 4);
const NON_BOUNDED_CLASSIFICATIONS = [
  'conflicts-with-baseline',
  'requires-clarification',
  'not-reproduced',
];

function parseArgs(argv) {
  const args = { checkFindings: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--check-findings') {
      if (args.checkFindings) throw new Error('duplicate --check-findings argument');
      args.checkFindings = true;
      continue;
    }
    if (!['--findings-dir', '--manifest'].includes(arg) || !argv[index + 1]) {
      throw new Error(
        'Usage: validate-fixer-result.js --findings-dir DIR --manifest MANIFEST.json [--check-findings]'
      );
    }
    const key = arg === '--findings-dir' ? 'findingsDir' : 'manifest';
    if (args[key]) throw new Error(`duplicate ${arg} argument`);
    args[key] = argv[++index];
  }
  if (!args.findingsDir || !args.manifest) {
    throw new Error(
      'Usage: validate-fixer-result.js --findings-dir DIR --manifest MANIFEST.json [--check-findings]'
    );
  }
  return args;
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a JSON object`);
  }
  return value;
}

function requireExactKeys(value, keys, name) {
  const actual = Object.keys(requireObject(value, name)).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${name} must contain exactly: ${expected.join(', ')}`);
  }
}

function requirePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function requireNonNegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function requireNonEmptyString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string`);
  }
  return value;
}

function requireDirectChildName(value, name) {
  requireNonEmptyString(value, name);
  if (value === '.' || value === '..' || path.basename(value) !== value) {
    throw new Error(`${name} must be a direct-child basename`);
  }
  return value;
}

function lstatRequired(target, name) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch (error) {
    throw new Error(`could not read ${name}: ${error.message}`);
  }
  if (stat.isSymbolicLink()) throw new Error(`${name} must not be a symlink`);
  return stat;
}

function validateFindingsDirectory(input) {
  const findingsDir = path.resolve(input);
  const stat = lstatRequired(findingsDir, 'findings directory');
  if (!stat.isDirectory()) throw new Error('findings directory must be a directory');
  if (!/^groundwork-validation-[A-Za-z0-9._-]+$/.test(path.basename(findingsDir))) {
    throw new Error('findings directory must be an owned groundwork-validation mktemp directory');
  }
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new Error('findings directory must be owned by the current user');
  }
  return findingsDir;
}

function readRegularFile(findingsDir, basename, name) {
  requireDirectChildName(basename, name);
  const target = path.join(findingsDir, basename);
  if (path.dirname(target) !== findingsDir) {
    throw new Error(`${name} must be contained directly in the findings directory`);
  }
  const stat = lstatRequired(target, name);
  if (!stat.isFile()) throw new Error(`${name} must be a regular file`);

  let descriptor;
  try {
    const noFollow = fs.constants.O_NOFOLLOW || 0;
    descriptor = fs.openSync(target, fs.constants.O_RDONLY | noFollow);
    const openedStat = fs.fstatSync(descriptor);
    if (!openedStat.isFile()) throw new Error(`${name} must be a regular file`);
    return fs.readFileSync(descriptor, 'utf8');
  } catch (error) {
    if (error.message === `${name} must be a regular file`) throw error;
    throw new Error(`could not read ${name}: ${error.message}`);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function readJsonFile(findingsDir, basename, name) {
  const raw = readRegularFile(findingsDir, basename, name);
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`could not read ${name}: ${error.message}`);
  }
}

function validateCounts(counts, name) {
  requireExactKeys(counts, SEVERITIES, name);
  const validated = {};
  for (const severity of SEVERITIES) {
    validated[severity] = requireNonNegativeInteger(counts[severity], `${name}.${severity}`);
  }
  return validated;
}

function validateFinding(finding, seenIds, reviewMode) {
  const keys = ['id', 'severity', 'category', 'file', 'line', 'finding', 'recommendation'];
  if (reviewMode === 'closure-review') keys.push('origin', 'causal_ref');
  requireExactKeys(finding, keys, 'finding');
  const id = requirePositiveInteger(finding.id, 'finding id');
  if (seenIds.has(id)) throw new Error(`duplicate local finding ID: ${id}`);
  seenIds.add(id);
  if (!SEVERITIES.includes(finding.severity)) {
    throw new Error('finding severity must be critical, major, or minor');
  }
  requireNonEmptyString(finding.category, 'finding category');
  if (finding.file !== null) requireNonEmptyString(finding.file, 'finding file');
  if (finding.line !== null) requirePositiveInteger(finding.line, 'finding line');
  requireNonEmptyString(finding.finding, 'finding text');
  requireNonEmptyString(finding.recommendation, 'finding recommendation');
  if (reviewMode === 'closure-review') {
    if (!CLOSURE_ORIGINS.includes(finding.origin)) {
      throw new Error('invalid closure finding origin');
    }
    if (BLOCKING_CLOSURE_ORIGINS.slice(0, 3).includes(finding.origin)) {
      if (typeof finding.causal_ref !== 'string' || !finding.causal_ref.trim()) {
        throw new Error('blocking closure finding requires causal_ref');
      }
    } else if (finding.causal_ref !== null) {
      throw new Error('non-causal closure finding must use null causal_ref');
    }
  }
  return finding;
}

function findingFingerprint(agent, finding) {
  const normalized = [agent, finding.category, finding.file || '', finding.finding]
    .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    .join('\0');
  return `finding:${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
}

function validateReviewMetadata(review, manifestIteration) {
  const baseKeys = ['file', 'agent', 'iteration', 'summary', 'score', 'verdict', 'counts'];
  const hasReviewMode = Object.hasOwn(requireObject(review, 'review manifest entry'), 'review_mode');
  requireExactKeys(review, hasReviewMode ? [...baseKeys, 'review_mode'] : baseKeys, 'review manifest entry');
  if (typeof review.agent !== 'string' || !AGENT_PATTERN.test(review.agent)) {
    throw new Error('invalid review agent');
  }
  requirePositiveInteger(review.iteration, 'review iteration');
  if (review.iteration !== manifestIteration) {
    throw new Error('review iteration must match manifest iteration');
  }
  const expectedFile = `findings-${review.agent}-iter${review.iteration}.json`;
  requireDirectChildName(review.file, 'review file');
  if (review.file !== expectedFile) {
    throw new Error(`review file must match expected basename: ${expectedFile}`);
  }
  requireNonEmptyString(review.summary, 'review summary');
  if (!Number.isSafeInteger(review.score) || review.score < 0 || review.score > 100) {
    throw new Error('review score must be an integer from 0 to 100');
  }
  if (!['approve', 'request-changes'].includes(review.verdict)) {
    throw new Error('review verdict must be approve or request-changes');
  }
  if (hasReviewMode && !REVIEW_MODES.includes(review.review_mode)) {
    throw new Error('review_mode must be initial-audit or closure-review');
  }
  return { ...review, counts: validateCounts(review.counts, 'review counts') };
}

function validateReviewFile(findingsDir, expected) {
  const review = readJsonFile(findingsDir, expected.file, 'findings file');
  const fields = ['agent', 'iteration', 'summary', 'score', 'verdict'];
  const reviewKeys = [...fields, 'findings'];
  if (expected.review_mode) reviewKeys.push('review_mode');
  requireExactKeys(review, reviewKeys, 'review');
  if (expected.review_mode) fields.push('review_mode');
  for (const field of fields) {
    if (review[field] !== expected[field]) {
      throw new Error(`findings ${field} does not match review manifest`);
    }
  }
  if (!Array.isArray(review.findings)) throw new Error('review findings must be an array');

  const seenIds = new Set();
  const counts = { critical: 0, major: 0, minor: 0 };
  const findingIds = [];
  const findingRefs = [];
  for (const finding of review.findings) {
    validateFinding(finding, seenIds, expected.review_mode);
    counts[finding.severity]++;
    const id = `${expected.agent}-iter${expected.iteration}-${finding.id}`;
    const closureBlocking = expected.review_mode !== 'closure-review' ||
      BLOCKING_CLOSURE_ORIGINS.includes(finding.origin);
    const requested = expected.verdict === 'request-changes' && closureBlocking &&
      ['critical', 'major'].includes(finding.severity);
    findingRefs.push({
      id,
      fingerprint: findingFingerprint(expected.agent, finding),
      severity: finding.severity,
      verdict: expected.verdict,
      requested,
      ...(expected.review_mode === 'closure-review'
        ? { origin: finding.origin, causal_ref: finding.causal_ref }
        : {}),
    });
    if (requested) {
      findingIds.push(id);
    }
  }
  if (SEVERITIES.some((severity) => counts[severity] !== expected.counts[severity])) {
    throw new Error('review counts do not match findings');
  }
  if (expected.verdict === 'approve' && counts.critical !== 0) {
    throw new Error('approve review cannot contain critical findings');
  }
  if (expected.verdict === 'request-changes' && findingIds.length === 0) {
    throw new Error('request-changes review requires a critical or major finding');
  }
  return { findingIds, findingRefs };
}

function validateManifest(findingsDir, manifestName) {
  requireDirectChildName(manifestName, 'manifest');
  const nameMatch = manifestName.match(/^fixer-manifest-iter([1-9]\d*)\.json$/);
  if (!nameMatch) throw new Error('manifest must use fixer-manifest-iter<N>.json basename');

  const manifest = readJsonFile(findingsDir, manifestName, 'manifest file');
  requireExactKeys(manifest, ['iteration', 'result_file', 'reviews'], 'manifest');
  const iteration = requirePositiveInteger(manifest.iteration, 'manifest iteration');
  if (iteration !== Number(nameMatch[1])) {
    throw new Error('manifest iteration must match its basename');
  }
  requireDirectChildName(manifest.result_file, 'result_file');
  if (manifest.result_file !== `fixer-result-iter${iteration}.json`) {
    throw new Error(`result_file must match expected basename: fixer-result-iter${iteration}.json`);
  }
  if (!Array.isArray(manifest.reviews) || manifest.reviews.length === 0) {
    throw new Error('manifest reviews must be a non-empty array');
  }

  const seenAgents = new Set();
  const findingIds = [];
  const findingRefs = [];
  const findingsFiles = [];
  for (const review of manifest.reviews) {
    const expected = validateReviewMetadata(review, iteration);
    if (seenAgents.has(expected.agent)) throw new Error(`duplicate review agent: ${expected.agent}`);
    seenAgents.add(expected.agent);
    const validated = validateReviewFile(findingsDir, expected);
    findingIds.push(...validated.findingIds);
    findingRefs.push(...validated.findingRefs);
    findingsFiles.push(path.join(findingsDir, expected.file));
  }
  return {
    findingIds,
    findingRefs,
    findingsFiles,
    resultFile: manifest.result_file,
  };
}

function requireStringArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return value;
}

function validateFindingIds(ids, expectedIds) {
  const seen = new Set();
  for (const id of ids) {
    if (!GLOBAL_ID_PATTERN.test(id) || !expectedIds.has(id)) {
      throw new Error(`unknown finding ID: ${id}`);
    }
    if (seen.has(id)) throw new Error(`duplicate finding ID: ${id}`);
    seen.add(id);
  }
  return seen;
}

function ensureAllFindingsAccountedFor(accounted, expectedIds) {
  if (accounted.size !== expectedIds.size || [...expectedIds].some((id) => !accounted.has(id))) {
    throw new Error('result must account for every requested finding');
  }
}

function validateRepairClaims(value, fixedIds) {
  if (!Array.isArray(value)) throw new Error('repair_claims must be an array');
  const seen = new Set();
  const claims = value.map((claim) => {
    requireExactKeys(claim, ['id', 'root_cause', 'change', 'evidence'], 'repair claim');
    if (!GLOBAL_ID_PATTERN.test(claim.id) || !fixedIds.has(claim.id)) {
      throw new Error(`repair claim has unknown fixed finding ID: ${claim.id}`);
    }
    if (seen.has(claim.id)) throw new Error(`duplicate repair claim ID: ${claim.id}`);
    seen.add(claim.id);
    const evidence = requireStringArray(claim.evidence, 'repair claim evidence');
    if (evidence.length === 0) throw new Error('repair claim evidence must not be empty');
    return {
      id: claim.id,
      root_cause: requireNonEmptyString(claim.root_cause, 'repair claim root_cause').trim(),
      change: requireNonEmptyString(claim.change, 'repair claim change').trim(),
      evidence,
    };
  });
  if (seen.size !== fixedIds.size || [...fixedIds].some((id) => !seen.has(id))) {
    throw new Error('repair_claims must account for every fixed finding');
  }
  return claims;
}

function validateSkippedFindings(value, expectedIds, fixedIds, requireClassification) {
  if (!Array.isArray(value)) throw new Error('findings_skipped must be an array');
  const skippedIds = new Set();
  const findings = value.map((finding) => {
    const keys = requireClassification ? ['id', 'classification', 'reason'] : ['id', 'reason'];
    requireExactKeys(finding, keys, 'skipped finding');
    if (!GLOBAL_ID_PATTERN.test(finding.id) || !expectedIds.has(finding.id)) {
      throw new Error(`unknown finding ID: ${finding.id}`);
    }
    if (fixedIds.has(finding.id) || skippedIds.has(finding.id)) {
      throw new Error(`duplicate finding ID: ${finding.id}`);
    }
    skippedIds.add(finding.id);
    const validated = {
      id: finding.id,
      reason: requireNonEmptyString(finding.reason, 'skipped finding reason').trim(),
    };
    if (requireClassification) {
      if (!NON_BOUNDED_CLASSIFICATIONS.includes(finding.classification)) {
        throw new Error('invalid skipped finding classification');
      }
      validated.classification = finding.classification;
    }
    return validated;
  });
  return { skippedIds, findings };
}

function validateResult(result, requestedIds) {
  requireObject(result, 'result');
  const expectedIds = new Set(requestedIds);
  if (expectedIds.size !== requestedIds.length) throw new Error('requested finding IDs must be unique');

  if (result.status === 'failure') {
    requireExactKeys(result, ['status', 'reason'], 'failure result');
    return { status: 'failure', reason: requireNonEmptyString(result.reason, 'failure result reason').trim() };
  }
  if (!['fixed', 'partial'].includes(result.status)) {
    throw new Error('status must be fixed, partial, or failure');
  }

  const semanticKeys = [
    'status',
    'files_touched',
    'findings_fixed',
    'findings_skipped',
    'repair_claims',
    'contracts_changed',
  ];
  const isSemantic = semanticKeys.every((key) => Object.hasOwn(result, key));

  if (isSemantic) {
    requireExactKeys(result, semanticKeys, 'fixer result');
  } else {
    requireExactKeys(
      result,
      ['status', 'files_touched', 'findings_fixed', 'findings_skipped'],
      'fixer result'
    );
  }

  const filesTouched = requireStringArray(result.files_touched, 'files_touched');
  const findingsFixed = requireStringArray(result.findings_fixed, 'findings_fixed');
  const fixedIds = validateFindingIds(findingsFixed, expectedIds);
  let skipped;
  try {
    skipped = validateSkippedFindings(
      result.findings_skipped,
      expectedIds,
      fixedIds,
      isSemantic
    );
  } catch (error) {
    if (!isSemantic && error.message.startsWith('skipped finding')) {
      throw new Error('each skipped finding requires an ID and non-empty reason');
    }
    throw error;
  }
  const { skippedIds, findings: findingsSkipped } = skipped;

  if (result.status === 'fixed' && findingsSkipped.length) {
    throw new Error('fixed result cannot include skipped findings');
  }
  if (result.status === 'partial' && !findingsSkipped.length) {
    throw new Error('partial result requires at least one skipped finding');
  }
  ensureAllFindingsAccountedFor(new Set([...fixedIds, ...skippedIds]), expectedIds);

  const validated = {
    status: result.status,
    files_touched: filesTouched,
    findings_fixed: findingsFixed,
    findings_skipped: findingsSkipped,
  };
  if (isSemantic) {
    const contractsChanged = requireStringArray(result.contracts_changed, 'contracts_changed');
    validated.repair_claims = validateRepairClaims(result.repair_claims, fixedIds);
    validated.contracts_changed = contractsChanged;
  }
  return validated;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const findingsDir = validateFindingsDirectory(args.findingsDir);
  const artifacts = validateManifest(findingsDir, args.manifest);
  if (args.checkFindings) {
    process.stdout.write(`${JSON.stringify({
      status: 'valid',
      findings_files: artifacts.findingsFiles,
      finding_ids: artifacts.findingIds,
      finding_refs: artifacts.findingRefs,
    })}\n`);
    return;
  }

  const result = readJsonFile(findingsDir, artifacts.resultFile, 'result file');
  process.stdout.write(`${JSON.stringify(validateResult(result, artifacts.findingIds))}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`validate-fixer-result error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, validateManifest, validateResult };
