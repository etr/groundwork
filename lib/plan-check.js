'use strict';

/**
 * Plan ownership verification for the legacy unscoped plan location.
 *
 * Before the project-scoped plans directory existed, plan-task wrote
 * `<repo-root>/.groundwork-plans/TASK-NNN-plan.md`. Task IDs are only unique
 * per project, so a legacy plan found at the repository root may belong to a
 * DIFFERENT project than the one now implementing. Both the terminal runner
 * (assertRunnerPlanFile) and the implement-task skill verify plan headers
 * through this module before adopting a legacy plan.
 *
 * Plan headers record the project they were planned against:
 *
 *     ## Context
 *     - Identifier: TASK-004
 *     - Specs dir: apps/web/specs        (repo-root-relative)
 *     - Tasks path: apps/web/specs/tasks.md
 */

const fs = require('fs');
const path = require('path');

const HEADER_SCAN_BYTES = 16 * 1024;
const HEADER_SCAN_LINES = 200;

/**
 * Extract the `## Context` field map from a plan file.
 *
 * @param {string} planFile - Absolute path to the plan markdown
 * @returns {object} Map of lowercase field name → trimmed value
 */
function readPlanContext(planFile) {
  const fd = fs.openSync(planFile, 'r');
  let head = '';
  try {
    const buffer = Buffer.alloc(HEADER_SCAN_BYTES);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    head = buffer.toString('utf8', 0, bytes);
  } finally {
    fs.closeSync(fd);
  }
  const fields = {};
  for (const line of head.split('\n').slice(0, HEADER_SCAN_LINES)) {
    const match = line.match(/^\s*-\s*([A-Za-z][A-Za-z0-9 _-]*):\s*(.+?)\s*$/);
    if (match) fields[match[1].toLowerCase()] = match[2];
  }
  return fields;
}

function isContained(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Verify that a plan's recorded project context belongs to the given project.
 *
 * Lenient about the resolution base (a header may record the path relative
 * to the repository root or to the project root), strict about the outcome:
 * the plan is rejected only when every plausible resolution lands outside
 * the project — i.e. it unambiguously belongs to a different project.
 *
 * @param {string} planFile - Absolute path to the plan markdown
 * @param {string} projectRoot - Absolute project root the plan must belong to
 * @param {string} repoRoot - Absolute repository root
 * @returns {{ok: boolean, reason: string}}
 */
function planBelongsToProject(planFile, projectRoot, repoRoot) {
  let fields;
  try {
    fields = readPlanContext(planFile);
  } catch (error) {
    return { ok: false, reason: `plan header is unreadable: ${error.message}` };
  }
  const recorded = fields['specs dir'] || fields['tasks path'] || '';
  if (!recorded || /^n\/?a$/i.test(recorded)) {
    // Feature-mode plans record "N/A" for the tasks path; without a recorded
    // project path there is nothing to verify — accept rather than block.
    return { ok: true, reason: 'no recorded project path' };
  }
  const cleaned = recorded.replace(/^\.\//, '');
  // Recordings are repo-root-relative ("apps/web/specs"); older plans may
  // record just "specs/tasks.md" meaning the project's own specs tree.
  const candidates = path.isAbsolute(cleaned)
    ? [cleaned]
    : [path.resolve(repoRoot, cleaned)];
  if (!path.isAbsolute(cleaned) && /^specs(\/|$)/.test(cleaned)) {
    candidates.push(path.resolve(projectRoot, cleaned));
  }
  if (candidates.some((candidate) => isContained(projectRoot, candidate))) {
    return { ok: true, reason: '' };
  }
  return {
    ok: false,
    reason: `plan records project context "${recorded}" which is outside ${projectRoot}`,
  };
}

module.exports = { readPlanContext, planBelongsToProject };
