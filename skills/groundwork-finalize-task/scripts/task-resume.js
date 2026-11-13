#!/usr/bin/env node
'use strict';

/**
 * Task resume: the single source of truth for classifying existing task
 * work (worktree, branch, plan, validation session, runner checkpoint)
 * and deciding where execution should continue.
 *
 * Two layers:
 *
 * 1. createTaskResumeCore(dependencies) — the primitives the terminal
 *    runner (bin/groundwork-run.js) consumes programmatically with its own
 *    hardened execGit: runner checkpoint IO, task-catalog parsing,
 *    registered-worktree/cleanliness assertions, bookkeeping probes, and
 *    the de-closured classifyExistingWorktree state machine. The runner
 *    and the skill-facing layer below share this one classification
 *    implementation so they can never disagree about the same worktree.
 *
 * 2. createTaskResume(dependencies) — the skill-facing classifier.
 *    Interactive sessions (just-do-it, work-on, work-on-next-task) consume
 *    it as a CLI:
 *
 *      node task-resume.js check TASK-030 [--project name] [--base-branch main]
 *                                      [--repo-root path] [--fresh-window 30]
 *                                      [--take-over]
 *      node task-resume.js sweep [--project name] [--base-branch main]
 *      node task-resume.js record TASK-030 --phase plan --plan-file <abs>
 *      node task-resume.js record TASK-030 --phase implemented
 *                                      --worktree <abs> --branch <b> --base <bb>
 *      node task-resume.js clear TASK-030
 *
 *    Each command prints exactly one JSON line on stdout. `check` classifies
 *    where to resume (`resume_at`: fresh|implement|validate|finalize|done|
 *    conflict), reports any live owner of the work (standdown rule), and
 *    hands back ready-to-run argv tails in `actions` so callers run the
 *    recorded contract verbatim instead of improvising it.
 *
 * Interactive runs write only the plan and implementation checkpoint
 * blocks; validation and integration equivalence are DERIVED AT READ TIME
 * from the authoritative sources (the durable validation session records
 * and git merge ancestry) so no state is duplicated and no extra write
 * points exist. Runner-written checkpoints are honored unchanged.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_CHECKPOINT_BYTES = 64 * 1024;
const MAX_TASK_FILES = 1000;
const MAX_TASK_BYTES = 10 * 1024 * 1024;
const MAX_SESSION_STATE_BYTES = 64 * 1024;
const MAX_PLAN_BYTES = 2 * 1024 * 1024;
const SESSION_STALE_DEFAULT_MS = 2 * 60 * 60 * 1000;
const FRESH_WINDOW_DEFAULT_MIN = 30;
const TASK_ID_PATTERN = /^TASK-\d{3}$/;

function defaultExecGit(cwd, args) {
  const { execFileSync } = require('child_process');
  const output = execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return output.trim();
}

function isContained(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function assertNoSymlinkComponents(parent, child, label) {
  const parentStat = fs.lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error(`${label} parent is not a real directory: ${parent}`);
  }
  const relative = path.relative(parent, child);
  if (!isContained(parent, child)) throw new Error(`${label} is outside ${parent}`);
  let current = parent;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`${label} contains a symlink: ${current}`);
  }
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sessionStaleMs() {
  const raw = Number.parseInt(process.env.GROUNDWORK_VALIDATION_STALE_MS, 10);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : SESSION_STALE_DEFAULT_MS;
}

/**
 * Core primitives shared with the terminal runner.
 *
 * @param {object} [dependencies]
 * @param {Function} [dependencies.execGit] - (cwd, args, options) => stdout;
 *   the runner injects its hardened variant (hooks disabled, isolated
 *   config).
 * @param {number} [dependencies.maxCheckpointBytes]
 * @param {number} [dependencies.maxTaskFiles]
 * @param {number} [dependencies.maxTaskBytes]
 */
function createTaskResumeCore(dependencies = {}) {
  const execGit = dependencies.execGit || defaultExecGit;
  const maxCheckpointBytes = dependencies.maxCheckpointBytes || MAX_CHECKPOINT_BYTES;
  const maxTaskFiles = dependencies.maxTaskFiles || MAX_TASK_FILES;
  const maxTaskBytes = dependencies.maxTaskBytes || MAX_TASK_BYTES;

  function checkpointPath(commonDir, repoRoot, projectRoot, taskId) {
    const projectRelative = path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.';
    const projectKey = crypto.createHash('sha256').update(projectRelative).digest('hex').slice(0, 16);
    return {
      file: path.join(commonDir, 'groundwork', 'runner', projectKey, `${taskId}.json`),
      projectRelative,
    };
  }

  function loadCheckpoint(commonDir, repoRoot, projectRoot, taskId) {
    const location = checkpointPath(commonDir, repoRoot, projectRoot, taskId);
    if (!fs.existsSync(location.file)) return null;
    assertNoSymlinkComponents(commonDir, location.file, 'Runner checkpoint');
    const stat = fs.lstatSync(location.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxCheckpointBytes) {
      throw new Error(`Runner checkpoint is invalid: ${location.file}`);
    }
    let checkpoint;
    try {
      checkpoint = JSON.parse(fs.readFileSync(location.file, 'utf8'));
    } catch {
      throw new Error(`Runner checkpoint is not valid JSON: ${location.file}`);
    }
    if (!checkpoint || checkpoint.version !== 1 || checkpoint.taskId !== taskId
        || checkpoint.project !== location.projectRelative) {
      throw new Error(`Runner checkpoint identity does not match ${taskId}`);
    }
    return checkpoint;
  }

  function saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint) {
    const location = checkpointPath(commonDir, repoRoot, projectRoot, checkpoint.taskId);
    const directory = path.dirname(location.file);
    const { createContainedDirectory } = require('./lease-mutation');
    createContainedDirectory(commonDir, directory, 'Runner checkpoint directory');
    if (fs.existsSync(location.file) && fs.lstatSync(location.file).isSymbolicLink()) {
      throw new Error(`Runner checkpoint must not be a symlink: ${location.file}`);
    }
    // Standardized collision-resistant atomic write (lib/atomic-write.js):
    // the crypto-random temporary name cannot collide with a crashed
    // writer's leftover, even after pid recycling within the same millisecond.
    require('./atomic-write').writeJsonSyncAtomic(location.file, checkpoint);
  }

  function clearCheckpoint(commonDir, repoRoot, projectRoot, taskId) {
    const location = checkpointPath(commonDir, repoRoot, projectRoot, taskId);
    if (!fs.existsSync(location.file)) return;
    if (fs.lstatSync(location.file).isSymbolicLink()) {
      throw new Error(`Runner checkpoint must not be a symlink: ${location.file}`);
    }
    fs.unlinkSync(location.file);
  }

  function fileSha256(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  }

  function readTasks(projectRoot) {
    const file = path.join(projectRoot, 'specs', 'tasks.md');
    if (fs.existsSync(file)) {
      assertNoSymlinkComponents(projectRoot, file, 'Tasks file');
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Tasks path must be a regular file: ${file}`);
      if (stat.size > maxTaskBytes) throw new Error('Tasks spec exceeds the 10 MiB limit');
      return fs.readFileSync(file, 'utf8');
    }
    const directory = path.join(projectRoot, 'specs', 'tasks');
    if (!fs.existsSync(directory)) {
      throw new Error(`Tasks spec not found under ${path.join(projectRoot, 'specs')}`);
    }
    assertNoSymlinkComponents(projectRoot, directory, 'Tasks directory');
    const rootStat = fs.lstatSync(directory);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error(`Tasks path must be a regular directory: ${directory}`);
    }

    const files = [];
    let totalBytes = 0;
    function collect(current) {
      for (const entry of fs.readdirSync(current).sort()) {
        if (entry.startsWith('.')) continue;
        const full = path.join(current, entry);
        const stat = fs.lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error(`Tasks tree contains a symlink: ${full}`);
        if (stat.isDirectory()) collect(full);
        else if (stat.isFile() && entry.endsWith('.md')) {
          files.push(full);
          totalBytes += stat.size;
          if (files.length > maxTaskFiles || totalBytes > maxTaskBytes) {
            throw new Error('Tasks spec exceeds the file-count or 10 MiB limit');
          }
        }
      }
    }
    collect(directory);
    return files.map((taskFile) => fs.readFileSync(taskFile, 'utf8')).join('\n\n');
  }

  function parseTaskCatalog(markdown) {
    const statusNames = {
      'not started': 'Not Started',
      'in progress': 'In Progress',
      complete: 'Complete',
      completed: 'Complete',
      done: 'Complete',
      blocked: 'Blocked',
      deferred: 'Deferred',
    };
    const statusPattern = /^(?:[-*+][\t ]+)?\*\*Status:\*\*[\t ]*(Not Started|In Progress|Completed?|Done|Blocked|Deferred)(?:[\t ]+[^\r\n]*)?\r?$/gmi;
    const catalog = new Map();
    const heading = /^###\s+(TASK-\d{3}):\s*(.+?)\s*$/gm;
    const matches = [...markdown.matchAll(heading)];

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index];
      const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
      const body = markdown.slice(match.index, end);
      let status = 'Not Started';
      // Completion and reopening updates may be appended below stale metadata.
      for (const statusMatch of body.matchAll(statusPattern)) {
        status = statusNames[statusMatch[1].toLowerCase()];
      }
      const blockedMatch = body.match(/^(?:[-*+]\s+)?(?:\*\*)?Blocked by:(?:\*\*)?\s*(.+?)\s*$/mi);
      const blockedBy = !blockedMatch || /^none$/i.test(blockedMatch[1].trim())
        ? []
        : [...blockedMatch[1].matchAll(/TASK-\d{3}/gi)].map((entry) => entry[0].toUpperCase());

      catalog.set(match[1], {
        id: match[1],
        title: match[2].trim(),
        status,
        blockedBy,
      });
    }

    if (catalog.size === 0) throw new Error('No TASK-NNN definitions found in tasks spec');
    return catalog;
  }

  function readTasksAtCommit(repoRoot, projectRoot, commit) {
    const relativeProject = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
    const specsPrefix = [relativeProject, 'specs'].filter(Boolean).join('/');
    const tasksFile = `${specsPrefix}/tasks.md`;
    try {
      return execGit(repoRoot, ['show', `${commit}:${tasksFile}`]);
    } catch {
      const tasksPrefix = `${specsPrefix}/tasks/`;
      const files = execGit(repoRoot, ['ls-tree', '-r', '--name-only', commit, '--', tasksPrefix])
        .split('\n').filter((file) => file.endsWith('.md')).sort();
      return files.map((file) => execGit(repoRoot, ['show', `${commit}:${file}`])).join('\n\n');
    }
  }

  function maskSelectedTaskStatus(content, taskId) {
    let currentTask = null;
    return content.split('\n').map((line) => {
      const heading = line.match(/^###\s+(TASK-\d{3}):/);
      if (heading) currentTask = heading[1];
      if (currentTask === taskId && /^(?:[-*+]\s+)?\*\*Status:\*\*/.test(line)) {
        return line.replace(/(Not Started|In Progress|Complete|Blocked)/, '<TASK_STATUS>');
      }
      if (new RegExp(`^\\|\\s*${taskId}\\s*\\|`).test(line)) {
        return line.replace(/(Not Started|In Progress|Complete|Blocked)/, '<TASK_STATUS>');
      }
      return line;
    }).join('\n');
  }

  function taskBookkeepingPaths(repoRoot, projectRoot, taskId, validatedHead, taskHead) {
    const changed = execGit(repoRoot, ['diff', '--name-only', validatedHead, taskHead])
      .split('\n').filter(Boolean);
    const projectRelative = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
    const tasksFile = [projectRelative, 'specs/tasks.md'].filter(Boolean).join('/');
    const tasksDirectory = [projectRelative, 'specs/tasks/'].filter(Boolean).join('/');
    const unexpected = changed.filter((file) => file !== tasksFile && !file.startsWith(tasksDirectory));
    if (unexpected.length) {
      throw new Error(`finalize-task changed non-bookkeeping paths after validation: ${unexpected.join(', ')}`);
    }
    for (const file of changed) {
      const before = execGit(repoRoot, ['show', `${validatedHead}:${file}`]);
      const after = execGit(repoRoot, ['show', `${taskHead}:${file}`]);
      if (maskSelectedTaskStatus(before, taskId) !== maskSelectedTaskStatus(after, taskId)) {
        throw new Error(`finalize-task changed task content beyond ${taskId} status: ${file}`);
      }
    }
    const beforeTask = parseTaskCatalog(readTasksAtCommit(repoRoot, projectRoot, validatedHead)).get(taskId);
    const afterTask = parseTaskCatalog(readTasksAtCommit(repoRoot, projectRoot, taskHead)).get(taskId);
    if (!beforeTask || !afterTask || afterTask.status !== 'Complete') {
      throw new Error(`finalize-task did not make only the required ${taskId} completion transition`);
    }
  }

  function assertRegisteredWorktree(repoRoot, worktreePath, branch) {
    const expectedPath = path.resolve(worktreePath);
    const expectedStat = fs.lstatSync(expectedPath);
    if (expectedStat.isSymbolicLink() || !expectedStat.isDirectory()) {
      throw new Error(`Expected worktree root is not a real directory: ${expectedPath}`);
    }
    const canonicalPath = fs.realpathSync(expectedPath);
    const records = execGit(repoRoot, ['worktree', 'list', '--porcelain']).split('\n\n');
    const matched = records.some((record) => {
      const lines = record.split('\n');
      const pathLine = lines.find((line) => line.startsWith('worktree '));
      const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));
      if (!pathLine || !branchLine) return false;
      return fs.realpathSync(pathLine.slice('worktree '.length)) === canonicalPath
        && branchLine.slice('branch refs/heads/'.length) === branch;
    });
    if (!matched) throw new Error(`Model-reported worktree is not registered for branch ${branch}: ${worktreePath}`);
    return canonicalPath;
  }

  function initializedSubmodules(cwd) {
    return execGit(cwd, ['ls-files', '--stage', '-z'], { raw: true })
      .split('\0')
      .filter((entry) => entry.startsWith('160000 '))
      .map((entry) => entry.slice(entry.indexOf('\t') + 1))
      .filter((relative) => {
        const absolute = path.join(cwd, relative);
        return fs.existsSync(absolute) && fs.lstatSync(absolute).isDirectory();
      });
  }

  function hiddenIndexFlags(cwd, pathspec = null) {
    const args = ['ls-files', '-v', '-z'];
    if (pathspec) args.push('--', pathspec);
    return execGit(cwd, args, { raw: true })
      .split('\0')
      .filter((entry) => entry && (/^[a-z] /.test(entry) || entry.startsWith('S ')));
  }

  function assertClean(cwd, label, seen = new Set(), dependencies = {}) {
    const canonical = fs.realpathSync(cwd);
    if (seen.has(canonical)) throw new Error(`${label} contains a recursive submodule path`);
    seen.add(canonical);
    const run = (args, options) => (dependencies.execGit
      ? dependencies.execGit(execGit, cwd, args, options)
      : execGit(cwd, args, options));
    const initialFlags = hiddenIndexFlags(cwd);
    if (initialFlags.length) {
      throw new Error(`${label} has assume-unchanged or skip-worktree entries:\n${initialFlags.join('\n')}`);
    }
    let refreshFailed = false;
    // A sibling runner's opportunistic `git status` refresh can hold the
    // shared index lock for the span of one command; on slower filesystems
    // that turns a healthy refresh into a spurious cleanliness failure.
    // Retry the transient contention, bounded, before treating it as real.
    for (let attempt = 0; ; attempt++) {
      try {
        run(['update-index', '--really-refresh']);
        refreshFailed = false;
        break;
      } catch (error) {
        refreshFailed = true;
        const detail = `${(error && error.message) || ''}\n${(error && error.stderr) || ''}`;
        if (attempt >= 4 || !/index\.lock|File exists/i.test(detail)) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
    }
    const flagged = hiddenIndexFlags(cwd);
    if (flagged.length) {
      throw new Error(`${label} has assume-unchanged or skip-worktree entries:\n${flagged.join('\n')}`);
    }
    const status = run([
      'status',
      '--porcelain',
      '--untracked-files=all',
      '--ignore-submodules=none',
    ]);
    if (status) throw new Error(`${label} is not clean:\n${status}`);
    if (refreshFailed) {
      throw new Error(`${label} has tracked content that differs from its index`);
    }
    for (const relative of initializedSubmodules(cwd)) {
      const absolute = path.join(cwd, relative);
      assertNoSymlinkComponents(cwd, absolute, `${label} submodule`);
      assertClean(absolute, `${label} submodule ${relative}`, seen, dependencies);
    }
    seen.delete(canonical);
  }

  function refExists(repoRoot, refName) {
    try {
      execGit(repoRoot, ['show-ref', '--verify', '--quiet', refName]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Classify what an existing task branch/worktree already carries:
   * accepted base integration, reusable validation, a resumable active
   * validation session, or dirt that forces a resume-through-implement.
   * De-closured from the runner's task-attempt loop; the runner passes its
   * loop state explicitly and the skill-facing layer assembles the same
   * inputs from disk.
   *
   * @param {object} ctx
   * @param {boolean} ctx.branchExists
   * @param {object} ctx.checkpoint - Runner checkpoint (or synthesized view).
   * @param {{path:string, sha256:string}|null} ctx.planRecord
   * @param {boolean} ctx.planInvalidatedDownstream
   * @param {string} ctx.baseSha
   * @param {string} ctx.expectedBranch
   * @param {string} ctx.expectedWorktree
   * @param {object|null} ctx.implementation
   * @param {string} ctx.repoRoot
   * @param {string} ctx.projectRoot
   * @param {string} ctx.taskId
   * @param {string} ctx.baseBranch
   * @param {boolean} [ctx.revalidateIfMergeConflicts]
   * @param {Function} [ctx.inspectValidation] - inspectActiveValidationSession.
   * @param {Function} [ctx.taskLog]
   */
  function classifyExistingWorktree({
    branchExists,
    checkpoint,
    planRecord,
    planInvalidatedDownstream,
    baseSha,
    expectedBranch,
    expectedWorktree,
    implementation,
    repoRoot,
    projectRoot,
    taskId,
    baseBranch,
    revalidateIfMergeConflicts = false,
    inspectValidation = null,
    taskLog = () => {},
  }) {
    if (!branchExists) {
      return {
        implementation,
        resumeExistingWorktree: false,
        reusableValidation: false,
        resumeActiveValidation: false,
        activeValidationSession: null,
        acceptedIntegration: null,
        diagnostics: null,
      };
    }
    const existing = {
      worktreePath: assertRegisteredWorktree(repoRoot, expectedWorktree, expectedBranch),
      branch: expectedBranch,
      baseBranch,
    };
    // Assign at the exact point the inline runner code did, so a
    // mid-classify failure still reports the preserved worktree.
    implementation = existing;
    let worktreeClean = true;
    try {
      assertClean(existing.worktreePath, 'Existing task worktree');
    } catch (error) {
      if (/ is not clean:\n/.test(error.message)) worktreeClean = false;
      else throw error;
    }
    const currentHead = execGit(existing.worktreePath, ['rev-parse', 'HEAD']);
    const integrationMatches = worktreeClean
      && checkpoint.integration
      && checkpoint.integration.baseHead === baseSha
      && checkpoint.integration.branch === expectedBranch
      && checkpoint.integration.taskHead === currentHead;
    let acceptedIntegration = null;
    if (integrationMatches
        && !(revalidateIfMergeConflicts
          && checkpoint.integration.conflictsResolved)) {
      acceptedIntegration = checkpoint.integration;
    }
    const validationIdentityMatches = worktreeClean
      && checkpoint.validation
      && checkpoint.validation.baseHead === baseSha
      && checkpoint.validation.branch === expectedBranch;
    let reusableValidation = Boolean(validationIdentityMatches
      && checkpoint.validation.taskHead === currentHead);
    if (validationIdentityMatches && !reusableValidation) {
      try {
        taskBookkeepingPaths(
          repoRoot,
          projectRoot,
          taskId,
          checkpoint.validation.taskHead,
          currentHead
        );
        reusableValidation = true;
      } catch {}
    }
    const implementationMatches = worktreeClean
      && checkpoint.implementation
      && checkpoint.implementation.planSha256 === planRecord.sha256
      && checkpoint.implementation.branch === expectedBranch
      && checkpoint.implementation.worktreePath === existing.worktreePath
      && checkpoint.implementation.taskHead === currentHead;
    const projectRelativePath = path.relative(repoRoot, projectRoot);
    const existingTaskProject = path.join(existing.worktreePath, projectRelativePath);
    assertNoSymlinkComponents(existing.worktreePath, existingTaskProject, 'Task project');
    let activeValidationSession = null;
    let resumeActiveValidation = false;
    if (!acceptedIntegration && inspectValidation && checkpoint.implementation
        && checkpoint.implementation.planSha256 === planRecord.sha256
        && checkpoint.implementation.branch === expectedBranch
        && checkpoint.implementation.worktreePath === existing.worktreePath
        && checkpoint.implementation.taskHead === currentHead) {
      activeValidationSession = inspectValidation({
        repoRoot: existing.worktreePath,
        projectRoot: existingTaskProject,
        worktreePath: existing.worktreePath,
        taskId,
        branch: expectedBranch,
        baseHead: baseSha,
        protocolVersion: 1,
      });
      resumeActiveValidation = Boolean(activeValidationSession && !reusableValidation);
    }
    const existingTask = parseTaskCatalog(readTasks(existingTaskProject)).get(taskId);
    const legacyComplete = worktreeClean && !planInvalidatedDownstream && !checkpoint.implementation
      && existingTask && ['In Progress', 'Complete'].includes(existingTask.status)
      && currentHead !== execGit(repoRoot, ['merge-base', baseSha, currentHead]);
    let resumeExistingWorktree = false;
    if (resumeActiveValidation) {
      taskLog(`[${taskId}] implement skipped — resumable validation session`);
    } else if (acceptedIntegration || reusableValidation || implementationMatches || legacyComplete) {
      taskLog(`[${taskId}] implement skipped — existing clean worktree`);
    } else {
      resumeExistingWorktree = true;
    }
    return {
      implementation: existing,
      resumeExistingWorktree,
      reusableValidation,
      resumeActiveValidation,
      activeValidationSession,
      acceptedIntegration,
      diagnostics: {
        worktreeClean,
        currentHead,
        existingTaskStatus: existingTask ? existingTask.status : null,
        forkHead: execGit(repoRoot, ['merge-base', baseSha, currentHead]),
        integrationMatches,
        validationIdentityMatches,
        implementationMatches,
        legacyComplete,
      },
    };
  }

  return {
    checkpointPath,
    loadCheckpoint,
    saveCheckpoint,
    clearCheckpoint,
    fileSha256,
    readTasks,
    parseTaskCatalog,
    readTasksAtCommit,
    maskSelectedTaskStatus,
    taskBookkeepingPaths,
    assertRegisteredWorktree,
    assertClean,
    hiddenIndexFlags,
    initializedSubmodules,
    refExists,
    classifyExistingWorktree,
  };
}

// ---------------------------------------------------------------------------
// Skill-facing layer: resume classification, sweep, checkpoint recording.
// ---------------------------------------------------------------------------

/**
 * Gate liveness for a validation session record — stricter than the lock
 * module's own sessionLiveness, because a resume gate must answer "is a
 * process still working this task right now?", not "may the lock be
 * reaped?".
 *
 *   'live'          — a registered heartbeat whose worker identity probes as
 *                     a running process on this host AND whose owner anchor
 *                     (when recorded) also probes live. Hard standdown.
 *   'unverifiable'  — fresh heartbeat whose worker identity cannot be
 *                     probed (absent/malformed/foreign host). Soft standdown:
 *                     bounded by the gate's freshness window (a healthy
 *                     worker beats every ~30s), not the 2h lock-reap window;
 *                     overridable with --take-over.
 *   'stale'         — terminal owner, dead worker (probe false), beats older
 *                     than every applicable window, or a beating worker whose
 *                     owner anchor is provably dead (an orphaned loop left
 *                     behind by a dead session). No owner.
 *   'terminal'      — stage 'validated'; validation is done, not running.
 */
function gateLiveness(state, nowMs, freshWindowMs) {
  if (!state) return 'absent';
  if (state.stage === 'validated') return 'terminal';
  const owner = state.owner;
  if (!owner || owner.terminal) return 'stale';
  const heartbeat = owner.heartbeat || {};
  if (heartbeat.registered) {
    const lastBeat = Date.parse(heartbeat.lastBeat || '');
    if (!(Number.isFinite(lastBeat) && nowMs - lastBeat < sessionStaleMs())) return 'stale';
    const workerAlive = require('./validation-session').heartbeatWorkerAlive(heartbeat);
    if (workerAlive === true) {
      // A still-beating worker whose recorded owner anchor is provably dead
      // is an orphan, not a live owner: the session it represented is gone.
      const anchorAlive = require('./validation-session').heartbeatAnchorAlive(heartbeat);
      if (anchorAlive === false) return 'stale';
      return 'live';
    }
    if (workerAlive === false) return 'stale';
    return nowMs - lastBeat < freshWindowMs ? 'unverifiable' : 'stale';
  }
  const graceUntil = Date.parse(heartbeat.graceUntil || '');
  if (Number.isFinite(graceUntil) && nowMs < graceUntil) {
    const updated = Date.parse(state.updatedAt || '');
    return Number.isFinite(updated) && nowMs - updated < freshWindowMs ? 'unverifiable' : 'stale';
  }
  return 'stale';
}

function readBoundedJson(file, label, maxBytes) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
    throw new Error(`${label} must be a bounded regular file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Create the skill-facing resume layer.
 *
 * @param {object} [dependencies]
 * @param {Function} [dependencies.execGit]
 * @param {object} [dependencies.core] - Pre-built core (tests inject).
 * @param {Function} [dependencies.inspectActiveValidationSession]
 * @param {Function} [dependencies.now]
 */
function createTaskResume(dependencies = {}) {
  const execGit = dependencies.execGit || defaultExecGit;
  const core = dependencies.core || createTaskResumeCore({ execGit });
  const inspectActive = dependencies.inspectActiveValidationSession
    || require('./validation-session').inspectActiveValidationSession;
  const now = dependencies.now || (() => Date.now());
  const { createWorktreeIdentity } = require('./worktree-identity');
  const identityOf = createWorktreeIdentity({ execGit });

  function resolveCommonDir(repoRoot) {
    return fs.realpathSync(path.resolve(repoRoot, execGit(repoRoot, ['rev-parse', '--git-common-dir'])));
  }

  function validationSessionParent(commonDir, project, taskId, branch) {
    const projectKey = sha256Text(project).slice(0, 16);
    const taskKey = sha256Text(`${taskId}\0${branch}`).slice(0, 16);
    return path.join(commonDir, 'groundwork', 'validation', projectKey, taskKey);
  }

  // Bounded scan of a task's validation-session slot. The active pointer
  // may be gone (or point elsewhere) while a terminal session record for
  // this exact task+branch still answers "validation already passed".
  function scanValidationSessions(commonDir, project, taskId, branch) {
    const parent = validationSessionParent(commonDir, project, taskId, branch);
    if (!fs.existsSync(parent)) return [];
    assertNoSymlinkComponents(commonDir, parent, 'Validation session directory');
    const sessions = [];
    for (const entry of fs.readdirSync(parent).sort()) {
      if (!/^groundwork-validation-[a-f0-9]{32}$/.test(entry)) continue;
      const stateFile = path.join(parent, entry, '.validation-session.json');
      if (!fs.existsSync(stateFile)) continue;
      let state;
      try {
        state = readBoundedJson(stateFile, 'validation session', MAX_SESSION_STATE_BYTES);
      } catch {
        continue;
      }
      if (state.taskId !== taskId || state.branch !== branch || state.project !== project) continue;
      sessions.push({ runId: state.runId || entry.slice(22), runDir: path.join(parent, entry), state });
    }
    sessions.sort((left, right) => String(right.state.updatedAt || '').localeCompare(String(left.state.updatedAt || '')));
    return sessions;
  }

  function discoverValidationSession({ commonDir, worktreePath, projectRootInWorktree, taskId, branch, baseHead }) {
    let active = null;
    try {
      active = inspectActive({
        repoRoot: worktreePath,
        projectRoot: projectRootInWorktree,
        worktreePath,
        taskId,
        branch,
        baseHead,
        protocolVersion: 1,
      });
    } catch {
      active = null;
    }
    const project = path.relative(worktreePath, projectRootInWorktree).split(path.sep).join('/') || '.';
    const scanned = scanValidationSessions(commonDir, project, taskId, branch);
    if (active) {
      const state = active.state;
      const deduped = scanned.filter((found) => found.runId !== state.runId);
      return [{ runId: state.runId, runDir: active.runDir, state, source: 'active' }, ...deduped];
    }
    return scanned.map((found) => ({ ...found, source: 'scan' }));
  }

  // Read-time derivation of an integration the checkpoint never recorded:
  // a merge commit on the task branch whose second parent is an ancestor of
  // the current base head (finalize-task's base integration shape).
  function deriveIntegration(worktreePath, baseSha, currentHead) {
    const merges = execGit(worktreePath, [
      'log', '--merges', '--max-count=50', '--pretty=%H %P', currentHead,
    ]);
    for (const line of merges.split('\n').filter(Boolean)) {
      const [merge, parent1, parent2] = line.split(/\s+/);
      if (!merge || !parent1 || !parent2) continue;
      let integrated = false;
      try {
        execGit(worktreePath, ['merge-base', '--is-ancestor', parent2, baseSha]);
        integrated = true;
      } catch {
        integrated = false;
      }
      if (integrated) {
        return {
          baseHead: baseSha,
          taskHead: currentHead,
          derived: true,
          mergeHead: merge,
        };
      }
    }
    return null;
  }

  /**
   * Classify where execution of a task should continue.
   *
   * @param {object} input
   * @param {string} input.repoRoot
   * @param {string} input.projectRoot
   * @param {string} input.projectName - '' in single-project repos.
   * @param {string} input.taskId
   * @param {string} [input.baseBranch]
   * @param {string} [input.planFile]
   * @param {number} [input.freshWindowMs]
   */
  function classifyTaskResume(input) {
    const repoRoot = fs.realpathSync(input.repoRoot);
    const projectRoot = fs.realpathSync(input.projectRoot);
    assertNoSymlinkComponents(repoRoot, projectRoot, 'Project root');
    const taskId = input.taskId;
    if (!TASK_ID_PATTERN.test(taskId)) throw new Error('taskId must match TASK-NNN');
    const commonDir = resolveCommonDir(repoRoot);

    const baseBranch = input.baseBranch || execGit(repoRoot, ['branch', '--show-current']);
    if (!baseBranch) {
      throw new Error('Repository HEAD is detached; pass --base-branch explicitly');
    }
    const baseSha = execGit(repoRoot, ['rev-parse', `refs/heads/${baseBranch}`]);

    const evidence = [];
    let checkpointError = null;
    let checkpoint = null;
    try {
      checkpoint = core.loadCheckpoint(commonDir, repoRoot, projectRoot, taskId);
    } catch (error) {
      checkpointError = error.message;
      evidence.push(`checkpoint unreadable: ${checkpointError}`);
    }

    const taskCatalog = core.parseTaskCatalog(core.readTasks(projectRoot));
    const task = taskCatalog.get(taskId);
    if (!task) throw new Error(`${taskId} not found in the project task catalog`);
    const taskStatus = task.status;

    const identity = identityOf.taskWorkspaceIdentity(
      repoRoot, commonDir, projectRoot, input.projectName, taskId, checkpoint || {}
    );
    const expectedBranch = identity.branch;
    const expectedWorktree = identity.worktreePath;
    const branchExists = identityOf.refExists(repoRoot, `refs/heads/${expectedBranch}`);
    const worktreeExists = fs.existsSync(expectedWorktree);

    const planFile = input.planFile || path.join(projectRoot, '.groundwork-plans', `${taskId}-plan.md`);
    let planRecord = null;
    if (fs.existsSync(planFile)) {
      assertNoSymlinkComponents(projectRoot, planFile, 'Task plan');
      planRecord = {
        path: path.relative(projectRoot, planFile).split(path.sep).join('/'),
        sha256: core.fileSha256(planFile),
      };
    }
    const planChanged = Boolean(planRecord && (!checkpoint || !checkpoint.plan
      || checkpoint.plan.path !== planRecord.path
      || checkpoint.plan.sha256 !== planRecord.sha256));
    const planInvalidatedDownstream = planChanged
      && Boolean(checkpoint && (checkpoint.implementation || checkpoint.validation));

    // Session discovery + live-owner detection. The takeOver flag resolves
    // SOFT standdowns (unverifiable heartbeat, recent checkpoint) without
    // asking; a provably-live worker is a hard standdown even then.
    const takeOver = Boolean(input.takeOver);
    const freshWindowMs = input.freshWindowMs != null ? input.freshWindowMs : FRESH_WINDOW_DEFAULT_MIN * 60 * 1000;
    let sessions = [];
    let heartbeatAlive = false;
    let heartbeatWorkerAliveValue = null;
    let heartbeatAnchorAliveValue = null;
    let heartbeatWorkerPid = null;
    let heartbeatLiveness = 'absent';
    let worktree = {
      exists: worktreeExists,
      path: expectedWorktree,
      registered: false,
      clean: null,
      dirty_files: null,
      head: null,
    };
    let dirtyCount = null;
    let inWorktreeStatus = null;
    if (branchExists && worktreeExists) {
      const registeredPath = core.assertRegisteredWorktree(repoRoot, expectedWorktree, expectedBranch);
      worktree.registered = true;
      worktree.path = registeredPath;
      const porcelain = execGit(registeredPath, ['status', '--porcelain', '--untracked-files=all']);
      dirtyCount = porcelain ? porcelain.split('\n').length : 0;
      worktree.dirty_files = dirtyCount;
      worktree.clean = dirtyCount === 0;
      worktree.head = execGit(registeredPath, ['rev-parse', 'HEAD']);
      const projectRelativePath = path.relative(repoRoot, projectRoot);
      const existingTaskProject = path.join(registeredPath, projectRelativePath);
      assertNoSymlinkComponents(registeredPath, existingTaskProject, 'Task project');
      try {
        inWorktreeStatus = (core.parseTaskCatalog(core.readTasks(existingTaskProject)).get(taskId) || {}).status || null;
      } catch {
        inWorktreeStatus = null;
      }
      const baseHeadForSession = (checkpoint && checkpoint.implementation && checkpoint.implementation.baseHead)
        || execGit(repoRoot, ['merge-base', baseSha, worktree.head]);
      sessions = discoverValidationSession({
        commonDir,
        worktreePath: registeredPath,
        projectRootInWorktree: existingTaskProject,
        taskId,
        branch: expectedBranch,
        baseHead: baseHeadForSession,
      });
      const nowMs = now();
      const livenesses = sessions.map((found) => gateLiveness(found.state, nowMs, freshWindowMs));
      heartbeatLiveness = livenesses.includes('live') ? 'live'
        : livenesses.includes('unverifiable') ? 'unverifiable' : livenesses[0] || 'absent';
      heartbeatAlive = ['live', 'unverifiable'].includes(heartbeatLiveness);
      const probeSession = livenesses.findIndex((value, index) => {
        const beat = (sessions[index].state.owner || {}).heartbeat || {};
        return beat.registered;
      });
      if (probeSession !== -1) {
        const probeBeat = (sessions[probeSession].state.owner || {}).heartbeat || {};
        heartbeatWorkerAliveValue = require('./validation-session').heartbeatWorkerAlive(probeBeat);
        heartbeatAnchorAliveValue = require('./validation-session').heartbeatAnchorAlive(probeBeat);
        heartbeatWorkerPid = Number.isInteger(probeBeat.pid) ? probeBeat.pid : null;
      }
    } else if (branchExists !== worktreeExists) {
      evidence.push(`task resume state is incomplete: branch ${branchExists ? 'exists' : 'missing'}, worktree ${worktreeExists ? 'exists' : 'missing'}`);
    }

    // Synthesize the read-time derivations into a classification view.
    // Runner-written blocks are authoritative and never overwritten.
    const view = checkpoint ? { ...checkpoint } : {
      version: 1, taskId, project: path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.', baseBranch,
    };
    const derived = { validation: false, integration: false };
    const latest = sessions[0] || null;
    if (!view.validation && latest && latest.state.stage === 'validated') {
      view.validation = {
        baseHead: latest.state.baseHead,
        taskHead: latest.state.startHead,
        branch: latest.state.branch,
        iterations: latest.state.iteration != null ? latest.state.iteration : null,
        derived: true,
      };
      derived.validation = true;
      evidence.push(`validation derived from session ${latest.runId} (stage validated)`);
    }
    if (!view.integration && view.validation && worktree.registered && worktree.clean) {
      const integration = deriveIntegration(worktree.path, baseSha, worktree.head);
      if (integration) {
        view.integration = { ...integration, branch: expectedBranch, conflictsResolved: false };
        derived.integration = true;
        evidence.push(`integration derived from merge ${integration.mergeHead.slice(0, 10)}`);
      }
    }

    const classification = core.classifyExistingWorktree({
      branchExists: branchExists && worktreeExists,
      checkpoint: view,
      planRecord: planRecord || { path: null, sha256: null },
      planInvalidatedDownstream,
      baseSha,
      expectedBranch,
      expectedWorktree,
      implementation: null,
      repoRoot,
      projectRoot,
      taskId,
      baseBranch,
      revalidateIfMergeConflicts: false,
      inspectValidation: null,
      taskLog: () => {},
    });

    // Ambiguity guard: the classifier's implementationMatches requires a
    // checkpoint plan hash; a planless legacy checkpoint with a clean,
    // committed worktree still means "implemented" via legacyComplete.
    const mergedIntoBase = branchExists
      ? (() => { try { execGit(repoRoot, ['merge-base', '--is-ancestor', expectedBranch, baseBranch]); return true; } catch { return false; } })()
      : false;

    let liveOwner = 'none';
    let liveOwnerReason = 'none';
    let checkpointRecent = false;
    if (checkpoint) {
      try {
        const { file } = core.checkpointPath(commonDir, repoRoot, projectRoot, taskId);
        checkpointRecent = now() - fs.lstatSync(file).mtimeMs < freshWindowMs;
      } catch { checkpointRecent = false; }
    }
    if (heartbeatLiveness === 'live') {
      liveOwner = 'validation-heartbeat';
      liveOwnerReason = 'heartbeat-worker-alive';
    } else if (heartbeatWorkerAliveValue === true && heartbeatAnchorAliveValue === false) {
      // Not a standdown, and not an owner: the worker provably beats on, but
      // the session it represents is provably dead. Reclaiming is safe and
      // self-cleaning — the successor epoch revokes the orphan's capability
      // and it exits on its next beat.
      liveOwnerReason = 'heartbeat-orphaned';
      evidence.push(`heartbeat worker pid ${heartbeatWorkerPid == null ? '?' : heartbeatWorkerPid} is an orphan — the owning session is provably dead; reclaim the validation session and the worker exits on its next beat`);
    } else if (heartbeatLiveness === 'unverifiable') {
      liveOwner = 'validation-heartbeat';
      liveOwnerReason = 'heartbeat-unverifiable';
    } else if (checkpointRecent) {
      liveOwner = 'recent-writer';
      liveOwnerReason = 'recent-checkpoint';
    }
    if (takeOver && !['heartbeat-worker-alive', 'heartbeat-orphaned', 'none'].includes(liveOwnerReason)) {
      evidence.push(`standdown overridden (--take-over): ${liveOwnerReason} is not a provably-live worker`);
    }

    // resume_at decision (single mapping over the shared classification).
    const hardStanddown = liveOwnerReason === 'heartbeat-worker-alive';
    const softStanddown = ['heartbeat-unverifiable', 'recent-checkpoint'].includes(liveOwnerReason)
      && !(takeOver);
    let resumeAt;
    if (!branchExists && !worktreeExists) {
      resumeAt = taskStatus === 'Complete' ? 'done' : 'fresh';
      if (taskStatus === 'Complete') {
        evidence.push('task is marked Complete and no worktree or branch exists');
      }
      if (taskStatus === 'In Progress') {
        evidence.push('index says In Progress but no worktree or branch exists — stale marker');
      }
    } else if (hardStanddown) {
      resumeAt = 'conflict';
      evidence.push('a validation worker for this task is provably running on this host — stop it before taking over; --take-over cannot override a live process');
      if (latest && latest.runDir && latest.runId) {
        // Paste-ready unblock when the holder session is actually dead: the
        // persisted capability file stops the worker directly, flipping the
        // session stale without waiting out the staleness window.
        const slotParent = path.dirname(latest.runDir);
        const capabilityFile = [
          path.join(slotParent, `manual-capability-${latest.runId}.json`),
          path.join(slotParent, 'runner-capability.json'),
        ].find((file) => { try { return fs.statSync(file).isFile(); } catch { return false; } });
        evidence.push(capabilityFile
          ? `if the owning session is gone, stop its worker directly — validation-session.js heartbeat-stop --run-dir "${latest.runDir}" --capability-file "${capabilityFile}" — then open again to reclaim`
          : `if the owning session is gone and no capability file remains beside ${slotParent}, kill the worker (pid ${heartbeatWorkerPid == null ? '?' : heartbeatWorkerPid}), then open again to reclaim`);
      }
    } else if (softStanddown && liveOwnerReason === 'heartbeat-unverifiable') {
      resumeAt = 'conflict';
      evidence.push('a fresh validation heartbeat cannot be verified as dead — take over with --take-over, or wait out the freshness window');
    } else if (branchExists !== worktreeExists) {
      resumeAt = 'conflict';
    } else if (mergedIntoBase) {
      resumeAt = 'done';
      evidence.push('task branch is already merged into the base branch');
    } else if (classification.acceptedIntegration) {
      resumeAt = 'finalize';
      evidence.push('base integration already accepted for the current task head');
    } else if (classification.reusableValidation) {
      resumeAt = 'finalize';
      evidence.push('validation is reusable for the current task head');
    } else if (classification.resumeActiveValidation) {
      resumeAt = 'validate';
      evidence.push('an active validation session can be resumed');
    } else if (classification.resumeExistingWorktree) {
      resumeAt = 'implement';
      evidence.push(dirtyCount
        ? `worktree is dirty (${dirtyCount} uncommitted path${dirtyCount === 1 ? '' : 's'}) — resume implementation`
        : 'worktree state does not match any recorded phase — resume implementation');
    } else {
      // implementationMatches or legacyComplete: implement is done.
      resumeAt = 'validate';
      evidence.push(classification.diagnostics && classification.diagnostics.legacyComplete
        ? 'clean worktree carries commits beyond the fork point (legacy-complete)'
        : 'implementation checkpoint matches the current worktree head');
    }
    if (planInvalidatedDownstream && resumeAt !== 'conflict' && resumeAt !== 'fresh') {
      // The runner deletes downstream blocks when a plan changes under an
      // implementation; surface that as a conflict rather than silently
      // re-implementing against a different plan.
      resumeAt = 'conflict';
      evidence.push('the plan file changed under an existing implementation — re-plan deliberately');
    }

    const skipPhasesByResume = {
      fresh: [],
      implement: ['plan'],
      validate: ['plan', 'implement'],
      finalize: ['plan', 'implement', 'validate'],
      done: ['plan', 'implement', 'validate', 'finalize'],
      conflict: [],
    };

    const actions = [];
    const planTail = ['record', taskId, '--phase', 'plan', '--plan-file', planFile];
    const implementedTail = ['record', taskId, '--phase', 'implemented',
      '--worktree', worktree.registered ? worktree.path : `<${expectedWorktree}>`,
      '--branch', expectedBranch, '--base', baseBranch];
    if (resumeAt === 'fresh') {
      actions.push({ action: 'record-plan-after-persist', run: planTail, note: 'run after the plan file is persisted' });
    } else if (resumeAt === 'implement') {
      actions.push({ action: 'record-implemented-after-result', run: implementedTail,
        note: 'run after the executor returns RESULT: IMPLEMENTED' });
      if (planRecord) evidence.push(`existing plan: ${planFile}`);
    } else if (resumeAt === 'validate') {
      if (latest && latest.state.stage !== 'validated') {
        actions.push({ action: 'resume-validation-session', run: [],
          note: `pass RESUME VALIDATION SESSION=${latest.runId} to validate` });
      }
      actions.push({ action: 'record-implemented-after-result', run: implementedTail,
        note: 'record the implementation checkpoint if it is not recorded yet' });
    } else if (resumeAt === 'finalize') {
      actions.push({ action: 'finalize-from-worktree', run: ['clear', taskId],
        note: `invoke finalize-task from ${worktree.registered ? worktree.path : expectedWorktree}; run clear after it lands` });
    } else if (resumeAt === 'done') {
      actions.push({ action: 'clear-checkpoint', run: ['clear', taskId],
        note: 'task already merged; clear the checkpoint if present' });
    } else if (resumeAt === 'conflict') {
      actions.push({ action: 'surface-evidence', run: [],
        note: 'present the evidence to the user and stop; preserve the worktree' });
    }

    return {
      v: 1,
      task_id: taskId,
      project: path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.',
      project_name: input.projectName || '',
      base_branch: baseBranch,
      base_head: baseSha,
      expected_branch: expectedBranch,
      expected_worktree: expectedWorktree,
      branch_exists: branchExists,
      worktree,
      merged_into_base: mergedIntoBase,
      task_status: taskStatus,
      task_status_in_worktree: inWorktreeStatus,
      plan: planRecord ? { present: true, file: planFile, sha256: planRecord.sha256 } : { present: false, file: planFile },
      checkpoint: {
        present: Boolean(checkpoint),
        error: checkpointError,
        stage: view.integration ? 'integrated' : view.validation ? 'validated'
          : view.implementation ? 'implemented' : view.plan ? 'planned' : 'absent',
        plan_matches: Boolean(checkpoint && planRecord && checkpoint.plan
          && checkpoint.plan.sha256 === planRecord.sha256),
        implementation_matches: Boolean(classification.diagnostics && classification.diagnostics.implementationMatches),
        validation_matches: Boolean(classification.diagnostics && classification.diagnostics.validationIdentityMatches),
        integration_accepted: Boolean(classification.acceptedIntegration),
        derived,
      },
      validation_session: latest ? {
        present: true,
        source: latest.source,
        run_id: latest.runId,
        stage: latest.state.stage,
        terminal: gateLiveness(latest.state, now(), freshWindowMs) === 'terminal',
        completed: Boolean(latest.state.completed),
        heartbeat_alive: heartbeatAlive,
        heartbeat_liveness: heartbeatLiveness,
        heartbeat_worker_alive: heartbeatWorkerAliveValue,
        heartbeat_worker_pid: heartbeatWorkerPid,
        heartbeat_anchor_alive: heartbeatAnchorAliveValue,
        base_head: latest.state.baseHead,
        start_head: latest.state.startHead,
      } : { present: false },
      live_owner: liveOwner,
      live_owner_reason: liveOwnerReason,
      takeover: takeOver,
      resume_at: resumeAt,
      skip_phases: skipPhasesByResume[resumeAt],
      resume_existing_worktree: classification.resumeExistingWorktree,
      actions,
      evidence,
    };
  }

  /**
   * Classify every leftover task worktree: provably-safe-to-clean vs
   * needing review. Read-only; callers own removal.
   *
   * @param {object} input - repoRoot, projectRoot, projectName?, baseBranch?
   */
  function sweepTaskWorktrees(input) {
    const repoRoot = fs.realpathSync(input.repoRoot);
    const projectRoot = fs.realpathSync(input.projectRoot);
    const commonDir = resolveCommonDir(repoRoot);
    const baseBranch = input.baseBranch || execGit(repoRoot, ['branch', '--show-current']);
    if (!baseBranch) throw new Error('Repository HEAD is detached; pass --base-branch explicitly');
    const baseBranchRef = `refs/heads/${baseBranch}`;
    if (!identityOf.refExists(repoRoot, baseBranchRef)) {
      throw new Error(`Base branch not found: ${baseBranch}`);
    }
    const catalog = core.parseTaskCatalog(core.readTasks(projectRoot));
    const monorepo = projectRoot !== repoRoot;
    const project = path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.';
    const branchPattern = monorepo
      ? /^task\/([A-Za-z0-9][A-Za-z0-9_-]*)\/(TASK-\d{3})$/
      : /^task\/(TASK-\d{3})$/;

    const records = execGit(repoRoot, ['worktree', 'list', '--porcelain']).split('\n\n');
    const cleanable = [];
    const needsReview = [];
    const ignoredLive = [];
    for (const record of records) {
      const lines = record.split('\n');
      const pathLine = lines.find((line) => line.startsWith('worktree '));
      if (!pathLine) continue;
      const worktreePath = pathLine.slice('worktree '.length);
      if (fs.realpathSync(worktreePath) === fs.realpathSync(repoRoot)) continue;
      const branchLine = lines.find((line) => line.startsWith('branch refs/heads/'));
      const branch = branchLine ? branchLine.slice('branch refs/heads/'.length) : null;
      const entry = { worktree: worktreePath, branch: branch || '' };
      if (!branch) {
        needsReview.push({ ...entry, task_id: null, reason: 'detached HEAD or bare worktree' });
        continue;
      }
      const match = branch.match(branchPattern);
      if (!match) {
        needsReview.push({ ...entry, task_id: null, reason: `branch ${branch} is not a task identity` });
        continue;
      }
      const taskId = monorepo ? match[2] : match[1];
      const projectNameInBranch = monorepo ? match[1] : null;
      if (monorepo && projectNameInBranch !== (input.projectName || '')) continue; // another project's worktree
      entry.task_id = taskId;
      const task = catalog.get(taskId);
      entry.status = task ? task.status : 'unknown';
      let merged = false;
      try {
        execGit(repoRoot, ['merge-base', '--is-ancestor', branch, baseBranchRef]);
        merged = true;
      } catch { merged = false; }
      entry.merged = merged;
      const porcelain = execGit(worktreePath, ['status', '--porcelain', '--untracked-files=all']);
      entry.dirty_files = porcelain ? porcelain.split('\n').length : 0;
      const sessions = scanValidationSessions(commonDir, project, taskId, branch);
      const sweepWindowMs = input.freshWindowMs != null ? input.freshWindowMs : FRESH_WINDOW_DEFAULT_MIN * 60 * 1000;
      const livenesses = sessions.map((found) => gateLiveness(found.state, now(), sweepWindowMs));
      if (livenesses.includes('live')) {
        ignoredLive.push({ ...entry, reason: 'provably-live validation worker' });
        continue;
      }
      if (livenesses.includes('unverifiable')) {
        // Sweep is cleanup — always conservative, never overridable.
        ignoredLive.push({ ...entry, reason: 'unverifiable validation heartbeat (not provably dead) — rerun the sweep later' });
        continue;
      }
      // An orphaned worker (beating, but its owner anchor is provably dead)
      // no longer blocks classification — but say so, because the session
      // still holds an unfinished validation worth reclaiming, not deleting.
      const orphaned = sessions.some((found, index) => {
        if (livenesses[index] !== 'stale') return false;
        const beat = (found.state.owner || {}).heartbeat || {};
        if (!beat.registered) return false;
        const probe = require('./validation-session');
        return probe.heartbeatWorkerAlive(beat) === true && probe.heartbeatAnchorAlive(beat) === false;
      });
      if (merged && entry.status === 'Complete' && entry.dirty_files === 0) {
        cleanable.push(entry);
      } else {
        const reasons = [];
        if (orphaned) reasons.push('an orphaned validation worker remains (owning session dead) — reclaim its session before cleaning');
        if (!merged) reasons.push(entry.status === 'Complete'
          ? 'task marked Complete but branch is not merged into the base branch'
          : 'branch is not merged into the base branch');
        if (entry.status === 'unknown') reasons.push('task id not found in the project catalog');
        else if (entry.status !== 'Complete' && merged) reasons.push(`task status is ${entry.status}, not Complete`);
        if (entry.dirty_files > 0) reasons.push(`worktree is dirty (${entry.dirty_files} paths)`);
        needsReview.push({ ...entry, reason: reasons.join('; ') });
      }
    }
    return {
      v: 1,
      base_branch: baseBranch,
      cleanable,
      needs_review: needsReview,
      ignored_live: ignoredLive,
    };
  }

  /**
   * Record the plan phase checkpoint (interactive runs). Mirrors the
   * runner: a changed plan under downstream blocks invalidates them.
   */
  function recordPlan(input) {
    const { commonDir, repoRoot, projectRoot, taskId, baseBranch } = input;
    const planFile = path.resolve(input.planFile);
    const plansRoot = path.join(projectRoot, '.groundwork-plans');
    if (path.basename(planFile) !== `${taskId}-plan.md`
        || path.dirname(planFile) !== plansRoot
        || !fs.existsSync(planFile)) {
      throw new Error(`Plan file must be ${path.join(plansRoot, `${taskId}-plan.md`)}`);
    }
    assertNoSymlinkComponents(projectRoot, planFile, 'Task plan');
    const stat = fs.lstatSync(planFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_PLAN_BYTES) {
      throw new Error(`Plan file must be a bounded regular file: ${planFile}`);
    }
    const planRecord = {
      path: path.relative(projectRoot, planFile).split(path.sep).join('/'),
      sha256: core.fileSha256(planFile),
    };
    let checkpoint = core.loadCheckpoint(commonDir, repoRoot, projectRoot, taskId);
    const isNew = !checkpoint;
    if (isNew) {
      checkpoint = {
        version: 1,
        taskId,
        project: path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.',
        baseBranch,
      };
    }
    const planChanged = !checkpoint.plan
      || checkpoint.plan.path !== planRecord.path
      || checkpoint.plan.sha256 !== planRecord.sha256;
    if (planChanged) {
      checkpoint.plan = planRecord;
      delete checkpoint.implementation;
      delete checkpoint.validation;
      delete checkpoint.integration;
      core.saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
    }
    return { v: 1, task_id: taskId, recorded: 'plan', changed: planChanged, created: isNew,
      plan: planRecord, invalidated_downstream: planChanged && !isNew };
  }

  /**
   * Record the implementation phase checkpoint (interactive runs). All
   * identity values are verified against git and the workspace identity —
   * the caller only supplies what the executor reported.
   */
  function recordImplemented(input) {
    const { commonDir, repoRoot, projectRoot, taskId, baseBranch } = input;
    const branch = input.branch;
    const worktreeInput = path.resolve(input.worktree);
    const identity = identityOf.taskWorkspaceIdentity(
      repoRoot, commonDir, projectRoot, input.projectName, taskId,
      core.loadCheckpoint(commonDir, repoRoot, projectRoot, taskId) || {}
    );
    if (branch !== identity.branch) {
      throw new Error(`Branch ${branch} does not match the task workspace identity ${identity.branch}`);
    }
    if (fs.realpathSync(worktreeInput) !== fs.realpathSync(identity.worktreePath)) {
      throw new Error(`Worktree ${worktreeInput} does not match the task workspace identity ${identity.worktreePath}`);
    }
    const worktreePath = core.assertRegisteredWorktree(repoRoot, identity.worktreePath, branch);
    const taskHead = execGit(worktreePath, ['rev-parse', 'HEAD']);
    const baseHead = execGit(repoRoot, ['merge-base', branch, baseBranch]);
    const planFile = path.join(projectRoot, '.groundwork-plans', `${taskId}-plan.md`);
    if (!fs.existsSync(planFile)) {
      throw new Error(`No plan file found at ${planFile}; the implementation contract requires one`);
    }
    const planRecord = {
      path: path.relative(projectRoot, planFile).split(path.sep).join('/'),
      sha256: core.fileSha256(planFile),
    };
    let checkpoint = core.loadCheckpoint(commonDir, repoRoot, projectRoot, taskId);
    const isNew = !checkpoint;
    if (isNew) {
      checkpoint = {
        version: 1,
        taskId,
        project: path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.',
        baseBranch,
      };
    }
    checkpoint.plan = checkpoint.plan && checkpoint.plan.sha256 === planRecord.sha256
      ? checkpoint.plan : planRecord;
    checkpoint.workspace = checkpoint.workspace || { branch, worktreePath };
    checkpoint.implementation = {
      planSha256: planRecord.sha256,
      worktreePath,
      branch,
      baseBranch,
      baseHead,
      taskHead,
    };
    delete checkpoint.validation;
    delete checkpoint.integration;
    core.saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
    return { v: 1, task_id: taskId, recorded: 'implemented', created: isNew,
      worktree_path: worktreePath, branch, base_head: baseHead, task_head: taskHead };
  }

  return {
    classifyTaskResume,
    sweepTaskWorktrees,
    recordPlan,
    recordImplemented,
    clear: ({ commonDir, repoRoot, projectRoot, taskId }) => {
      const existed = fs.existsSync(core.checkpointPath(commonDir, repoRoot, projectRoot, taskId).file);
      core.clearCheckpoint(commonDir, repoRoot, projectRoot, taskId);
      return { v: 1, task_id: taskId, cleared: existed };
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  if (!argv.length) throw new Error('usage: task-resume.js <check|record|clear|sweep> TASK-NNN [options]');
  const command = argv[0];
  const known = new Set(['check', 'record', 'clear', 'sweep']);
  if (!known.has(command)) throw new Error(`unknown command: ${command}`);
  const args = { command, _: [] };
  const flags = {
    '--project': 'project', '--repo-root': 'repoRoot', '--base-branch': 'baseBranch',
    '--plan-file': 'planFile', '--worktree': 'worktree', '--branch': 'branch',
    '--base': 'base', '--phase': 'phase', '--fresh-window': 'freshWindow',
  };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === '--take-over') {
      if (args.takeOver !== undefined) throw new Error('--take-over given twice');
      args.takeOver = true;
      continue;
    }
    if (flags[token]) {
      const value = argv[++index];
      if (value === undefined) throw new Error(`${token} requires a value`);
      const key = flags[token];
      if (args[key] !== undefined) throw new Error(`${token} given twice`);
      args[key] = value;
      continue;
    }
    if (token.startsWith('--')) throw new Error(`unknown option: ${token}`);
    args._.push(token);
  }
  if (command === 'sweep') {
    if (args._.length) throw new Error('sweep takes no positional task id');
  } else {
    if (args._.length !== 1) throw new Error(`${command} requires exactly one TASK-NNN`);
    if (!TASK_ID_PATTERN.test(args._[0])) throw new Error(`invalid task id: ${args._[0]}`);
    args.taskId = args._[0];
  }
  if (command === 'record') {
    if (args.phase === 'plan') {
      if (!args.planFile) throw new Error('record --phase plan requires --plan-file');
    } else if (args.phase === 'implemented') {
      if (!args.worktree || !args.branch || !args.base) {
        throw new Error('record --phase implemented requires --worktree, --branch and --base');
      }
    } else {
      throw new Error('record --phase must be plan or implemented');
    }
  }
  return args;
}

function cliMain(argv) {
  const args = parseArgs(argv);
  const context = require('./project-context');
  if (args.project) process.env.GROUNDWORK_PROJECT = args.project;
  const repoRoot = fs.realpathSync(args.repoRoot
    ? path.resolve(args.repoRoot)
    : context.getRepoRoot());
  if (!repoRoot) throw new Error('task-resume.js must run inside a git repository');
  const projectRoot = fs.realpathSync(path.resolve(context.getProjectRoot()));
  let projectName = context.getProjectName() || args.project || '';
  if (!projectName && projectRoot !== repoRoot) {
    const match = context.listProjects()
      .find((project) => path.resolve(repoRoot, project.path) === projectRoot);
    if (match) projectName = match.name;
  }
  if (args.project && projectName !== args.project) {
    throw new Error(`--project ${args.project} does not match the resolved project ${projectName}`);
  }
  const commonDir = fs.realpathSync(path.resolve(repoRoot, defaultExecGit(repoRoot, ['rev-parse', '--git-common-dir'])));
  const resume = createTaskResume();
  let result;
  if (args.command === 'check') {
    result = resume.classifyTaskResume({
      repoRoot,
      projectRoot,
      projectName: projectRoot === repoRoot ? '' : projectName,
      taskId: args.taskId,
      baseBranch: args.baseBranch,
      planFile: args.planFile ? path.resolve(args.planFile) : undefined,
      freshWindowMs: args.freshWindow !== undefined
        ? Number(args.freshWindow) * 60 * 1000
        : undefined,
      takeOver: Boolean(args.takeOver),
    });
  } else if (args.command === 'sweep') {
    result = resume.sweepTaskWorktrees({
      repoRoot,
      projectRoot,
      projectName: projectRoot === repoRoot ? '' : projectName,
      baseBranch: args.baseBranch,
    });
  } else if (args.command === 'record') {
    const baseBranch = args.phase === 'implemented'
      ? args.base
      : (args.baseBranch || defaultExecGit(repoRoot, ['branch', '--show-current']));
    if (!baseBranch) throw new Error('record requires --base-branch on a detached HEAD');
    if (args.phase === 'plan') {
      result = resume.recordPlan({
        commonDir, repoRoot, projectRoot, taskId: args.taskId, baseBranch, planFile: args.planFile,
      });
    } else {
      result = resume.recordImplemented({
        commonDir, repoRoot, projectRoot, taskId: args.taskId, baseBranch,
        branch: args.branch, worktree: args.worktree, projectName: projectRoot === repoRoot ? '' : projectName,
      });
    }
  } else {
    result = resume.clear({ commonDir, repoRoot, projectRoot, taskId: args.taskId });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    cliMain(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`task-resume error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  createTaskResumeCore,
  createTaskResume,
  parseArgs,
  gateLiveness,
  MAX_CHECKPOINT_BYTES,
  TASK_ID_PATTERN,
};
