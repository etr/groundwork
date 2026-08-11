#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const AGENT_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const GLOBAL_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-iter[1-9]\d*-[1-9]\d*$/;
const SEVERITIES = ['critical', 'major', 'minor'];

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

function validateFinding(finding, seenIds) {
  requireExactKeys(
    finding,
    ['id', 'severity', 'category', 'file', 'line', 'finding', 'recommendation'],
    'finding'
  );
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
  return finding;
}

function validateReviewMetadata(review, manifestIteration) {
  requireExactKeys(
    review,
    ['file', 'agent', 'iteration', 'summary', 'score', 'verdict', 'counts'],
    'review manifest entry'
  );
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
  return { ...review, counts: validateCounts(review.counts, 'review counts') };
}

function validateReviewFile(findingsDir, expected) {
  const review = readJsonFile(findingsDir, expected.file, 'findings file');
  requireExactKeys(review, ['agent', 'iteration', 'summary', 'score', 'verdict', 'findings'], 'review');
  for (const field of ['agent', 'iteration', 'summary', 'score', 'verdict']) {
    if (review[field] !== expected[field]) {
      throw new Error(`findings ${field} does not match review manifest`);
    }
  }
  if (!Array.isArray(review.findings)) throw new Error('review findings must be an array');

  const seenIds = new Set();
  const counts = { critical: 0, major: 0, minor: 0 };
  const findingIds = [];
  for (const finding of review.findings) {
    validateFinding(finding, seenIds);
    counts[finding.severity]++;
    if (expected.verdict === 'request-changes' && ['critical', 'major'].includes(finding.severity)) {
      findingIds.push(`${expected.agent}-iter${expected.iteration}-${finding.id}`);
    }
  }
  if (SEVERITIES.some((severity) => counts[severity] !== expected.counts[severity])) {
    throw new Error('review counts do not match findings');
  }
  if (expected.verdict === 'approve' && counts.critical + counts.major !== 0) {
    throw new Error('approve review cannot contain critical or major findings');
  }
  if (expected.verdict === 'request-changes' && counts.critical + counts.major === 0) {
    throw new Error('request-changes review requires a critical or major finding');
  }
  return findingIds;
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
  const findingsFiles = [];
  for (const review of manifest.reviews) {
    const expected = validateReviewMetadata(review, iteration);
    if (seenAgents.has(expected.agent)) throw new Error(`duplicate review agent: ${expected.agent}`);
    seenAgents.add(expected.agent);
    findingIds.push(...validateReviewFile(findingsDir, expected));
    findingsFiles.push(path.join(findingsDir, expected.file));
  }
  return { findingIds, findingsFiles, resultFile: manifest.result_file };
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
  requireExactKeys(
    result,
    ['status', 'files_touched', 'findings_fixed', 'findings_skipped'],
    'fixer result'
  );

  const filesTouched = requireStringArray(result.files_touched, 'files_touched');
  const findingsFixed = requireStringArray(result.findings_fixed, 'findings_fixed');
  const fixedIds = validateFindingIds(findingsFixed, expectedIds);
  if (!Array.isArray(result.findings_skipped)) {
    throw new Error('findings_skipped must be an array');
  }

  const skippedIds = new Set();
  const findingsSkipped = result.findings_skipped.map((finding) => {
    if (!finding || typeof finding !== 'object' || Array.isArray(finding) ||
        Object.keys(finding).sort().join(',') !== 'id,reason' ||
        typeof finding.id !== 'string' || !finding.id ||
        typeof finding.reason !== 'string' || !finding.reason.trim()) {
      throw new Error('each skipped finding requires an ID and non-empty reason');
    }
    if (!GLOBAL_ID_PATTERN.test(finding.id) || !expectedIds.has(finding.id)) {
      throw new Error(`unknown finding ID: ${finding.id}`);
    }
    if (fixedIds.has(finding.id) || skippedIds.has(finding.id)) {
      throw new Error(`duplicate finding ID: ${finding.id}`);
    }
    skippedIds.add(finding.id);
    return { id: finding.id, reason: finding.reason.trim() };
  });

  if (result.status === 'fixed' && findingsSkipped.length) {
    throw new Error('fixed result cannot include skipped findings');
  }
  if (result.status === 'partial' && !findingsSkipped.length) {
    throw new Error('partial result requires at least one skipped finding');
  }
  ensureAllFindingsAccountedFor(new Set([...fixedIds, ...skippedIds]), expectedIds);

  return {
    status: result.status,
    files_touched: filesTouched,
    findings_fixed: findingsFixed,
    findings_skipped: findingsSkipped,
  };
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
