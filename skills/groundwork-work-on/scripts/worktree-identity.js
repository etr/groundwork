#!/usr/bin/env node
'use strict';

/**
 * Task workspace identity: the single source of truth for the worktree path
 * and branch name a task uses.
 *
 * Task IDs are only unique per project (each project has its own
 * specs/tasks.md), so monorepo tasks must use a project-qualified branch and
 * a project-prefixed worktree path — otherwise two projects' TASK-NNN work
 * silently collide in the one shared branch namespace. Single-project repos
 * keep the shorter unqualified (legacy) shape.
 *
 * The terminal runner consumes this module programmatically (with its own
 * hardened execGit); interactive skills consume it as a CLI:
 *
 *   node worktree-identity.js TASK-004 [--project name]
 *
 * Output (single JSON line):
 *   {
 *     "task_id": "...", "repo_root": "...", "project_root": "...",
 *     "project_name": "...", "scope": "project"|"repo",
 *     "path": "<worktree path>", "branch": "<branch>",
 *     "legacy": {"path": "...", "branch": "...", "exists": bool}|null,
 *     "runner_owner": "<project-relative path>"|null
 *   }
 *
 * `legacy` is non-null only in monorepo scope and names the pre-scoping
 * unqualified identity, so callers can surface in-flight legacy worktrees
 * instead of silently adopting or clobbering them. `runner_owner` reports
 * which project (if exactly one) owns the legacy identity through a runner
 * checkpoint.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_MAX_CHECKPOINT_BYTES = 64 * 1024;

function defaultExecGit(cwd, args) {
  const output = execFileSync('git', args, { cwd, encoding: 'utf8' });
  return output.trim();
}

/**
 * Create the identity functions bound to a git runner and checkpoint bound.
 *
 * @param {object} [dependencies]
 * @param {Function} [dependencies.execGit] - (cwd, args) => stdout; the
 *   runner injects its hardened variant (hooks disabled, isolated config).
 * @param {number} [dependencies.maxCheckpointBytes] - Safety bound for
 *   runner checkpoint files consulted during legacy-owner resolution.
 * @returns {{refExists, legacyWorkspaceOwner, taskWorkspaceIdentity}}
 */
function createWorktreeIdentity(dependencies = {}) {
  const execGit = dependencies.execGit || defaultExecGit;
  const maxCheckpointBytes = dependencies.maxCheckpointBytes || DEFAULT_MAX_CHECKPOINT_BYTES;

  function refExists(repoRoot, refName) {
    try {
      execGit(repoRoot, ['show-ref', '--verify', '--quiet', refName]);
      return true;
    } catch {
      return false;
    }
  }

  function legacyWorkspaceOwner(commonDir, taskId, legacyBranch, legacyWorktree) {
    const root = path.join(commonDir, 'groundwork', 'runner');
    if (!fs.existsSync(root)) return null;
    const owners = new Set();
    for (const namespace of fs.readdirSync(root)) {
      const file = path.join(root, namespace, `${taskId}.json`);
      if (!fs.existsSync(file)) continue;
      const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.size > maxCheckpointBytes) {
        throw new Error(`Unsafe runner checkpoint while resolving legacy ${taskId}: ${file}`);
      }
      let checkpoint;
      try {
        checkpoint = JSON.parse(fs.readFileSync(file, 'utf8'));
      } catch {
        throw new Error(`Invalid runner checkpoint while resolving legacy ${taskId}: ${file}`);
      }
      if (checkpoint.taskId !== taskId || typeof checkpoint.project !== 'string') continue;
      if (!checkpoint.workspace
          || (checkpoint.workspace.branch === legacyBranch
            && checkpoint.workspace.worktreePath === legacyWorktree)) {
        owners.add(checkpoint.project);
      }
    }
    return owners.size === 1 ? [...owners][0] : null;
  }

  /**
   * Resolve the workspace identity for a task.
   *
   * @param {string} repoRoot - Repository root (worktrees live beside it)
   * @param {string} commonDir - Git common dir (shared across worktrees)
   * @param {string} projectRoot - Active project root
   * @param {string|null} projectName - Active project name (monorepos)
   * @param {string} taskId - Task identifier
   * @param {object} checkpoint - Runner checkpoint ({} when not resuming)
   * @returns {{branch: string, worktreePath: string}}
   */
  function taskWorkspaceIdentity(repoRoot, commonDir, projectRoot, projectName, taskId, checkpoint) {
    const legacy = {
      branch: `task/${taskId}`,
      worktreePath: path.join(repoRoot, '.worktrees', taskId),
    };
    if (projectRoot === repoRoot) return legacy;
    if (!projectName || !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(projectName)) {
      throw new Error('Monorepo task workspaces require a safe project name');
    }
    const scoped = {
      branch: `task/${projectName}/${taskId}`,
      worktreePath: path.join(repoRoot, '.worktrees', `${projectName}-${taskId}`),
    };
    if (checkpoint.workspace) {
      for (const candidate of [legacy, scoped]) {
        if (checkpoint.workspace.branch === candidate.branch
            && checkpoint.workspace.worktreePath === candidate.worktreePath) return candidate;
      }
      throw new Error(`Runner checkpoint has an invalid workspace identity for ${taskId}`);
    }
    if (checkpoint.implementation
        && checkpoint.implementation.branch === legacy.branch
        && checkpoint.implementation.worktreePath === legacy.worktreePath) return legacy;
    const projectRelative = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
    if (refExists(repoRoot, `refs/heads/${legacy.branch}`)
        && fs.existsSync(legacy.worktreePath)
        && legacyWorkspaceOwner(commonDir, taskId, legacy.branch, legacy.worktreePath) === projectRelative) {
      return legacy;
    }
    return scoped;
  }

  return { refExists, legacyWorkspaceOwner, taskWorkspaceIdentity };
}

// ---------------------------------------------------------------------------
// CLI mode: resolve the ambient project context, print the identity as JSON.
// ---------------------------------------------------------------------------

function cliMain(argv) {
  const args = argv.slice(2);
  let taskId = null;
  let projectName = null;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--project' && args[index + 1] !== undefined) {
      projectName = args[++index];
      continue;
    }
    if (!args[index].startsWith('--') && taskId === null) {
      taskId = args[index];
    }
  }
  if (!taskId || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(taskId)) {
    throw new Error('usage: worktree-identity.js <task-id> [--project name]');
  }
  if (projectName) process.env.GROUNDWORK_PROJECT = projectName;

  const context = require('./project-context');
  const repoRoot = context.getRepoRoot();
  if (!repoRoot) throw new Error('worktree-identity.js must run inside a git repository');
  const projectRoot = path.resolve(context.getProjectRoot());
  const monorepo = projectRoot !== repoRoot;
  let resolvedProjectName = context.getProjectName() || projectName || '';
  if (!resolvedProjectName && monorepo) {
    // Derive the name from .groundwork.yml when only the root is ambient
    // (e.g. GROUNDWORK_PROJECT_ROOT set without GROUNDWORK_PROJECT).
    const match = context.listProjects()
      .find((project) => path.resolve(repoRoot, project.path) === projectRoot);
    if (match) resolvedProjectName = match.name;
  }
  const commonDir = path.resolve(repoRoot, defaultExecGit(repoRoot, ['rev-parse', '--git-common-dir']));

  const { taskWorkspaceIdentity, legacyWorkspaceOwner } = createWorktreeIdentity();
  const identity = taskWorkspaceIdentity(
    repoRoot,
    commonDir,
    projectRoot,
    resolvedProjectName,
    taskId,
    {}
  );

  const legacyBranch = `task/${taskId}`;
  const legacyPath = path.join(repoRoot, '.worktrees', taskId);
  const result = {
    task_id: taskId,
    repo_root: repoRoot,
    project_root: projectRoot,
    project_name: monorepo ? resolvedProjectName : '',
    scope: monorepo ? 'project' : 'repo',
    path: identity.worktreePath,
    branch: identity.branch,
    legacy: monorepo
      ? {
        path: legacyPath,
        branch: legacyBranch,
        exists: fs.existsSync(legacyPath),
        runner_owner: legacyWorkspaceOwner(commonDir, taskId, legacyBranch, legacyPath),
      }
      : null,
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  try {
    cliMain(process.argv);
  } catch (error) {
    process.stderr.write(`worktree-identity error: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createWorktreeIdentity, DEFAULT_MAX_CHECKPOINT_BYTES };
