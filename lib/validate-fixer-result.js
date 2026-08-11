#!/usr/bin/env node
'use strict';

const fs = require('fs');

function parseArgs(argv) {
  const fileIndex = argv.indexOf('--file');
  const findingIdsIndex = argv.indexOf('--finding-ids');
  if (fileIndex === -1 || !argv[fileIndex + 1] || findingIdsIndex === -1 || argv[findingIdsIndex + 1] === undefined) {
    throw new Error('Usage: validate-fixer-result.js --file RESULT.json --finding-ids id[,id...]');
  }
  return {
    file: argv[fileIndex + 1],
    findingIds: argv[findingIdsIndex + 1].split(',').filter(Boolean),
  };
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${name} must be an array of non-empty strings`);
  }
  return value;
}

function validateFindingIds(ids, expectedIds, name) {
  const seen = new Set();
  for (const id of ids) {
    if (!expectedIds.has(id)) throw new Error(`unknown finding ID: ${id}`);
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
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('result must be a JSON object');
  }
  if (!Array.isArray(requestedIds) || requestedIds.some((id) => typeof id !== 'string' || !id)) {
    throw new Error('requested finding IDs must be non-empty strings');
  }
  const expectedIds = new Set(requestedIds);
  if (expectedIds.size !== requestedIds.length) throw new Error('requested finding IDs must be unique');

  if (result.status === 'failure') {
    if (typeof result.reason !== 'string' || !result.reason.trim()) {
      throw new Error('failure result requires a non-empty reason');
    }
    return { status: 'failure', reason: result.reason.trim() };
  }

  if (!['fixed', 'partial'].includes(result.status)) {
    throw new Error('status must be fixed, partial, or failure');
  }

  const filesTouched = requireArray(result.files_touched, 'files_touched');
  const findingsFixed = requireArray(result.findings_fixed, 'findings_fixed');
  const fixedIds = validateFindingIds(findingsFixed, expectedIds, 'findings_fixed');
  if (!Array.isArray(result.findings_skipped)) {
    throw new Error('findings_skipped must be an array');
  }

  const skippedIds = new Set();
  const findingsSkipped = result.findings_skipped.map((finding) => {
    if (!finding || typeof finding !== 'object' || typeof finding.id !== 'string' || !finding.id || typeof finding.reason !== 'string' || !finding.reason.trim()) {
      throw new Error('each skipped finding requires an ID and non-empty reason');
    }
    if (!expectedIds.has(finding.id)) throw new Error(`unknown finding ID: ${finding.id}`);
    if (fixedIds.has(finding.id) || skippedIds.has(finding.id)) throw new Error(`duplicate finding ID: ${finding.id}`);
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
  const { file, findingIds } = parseArgs(process.argv.slice(2));
  let result;
  try {
    result = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`could not read result file: ${error.message}`);
  }
  process.stdout.write(`${JSON.stringify(validateResult(result, findingIds))}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`validate-fixer-result error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { validateResult };
