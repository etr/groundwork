#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const TASK_ID = /^TASK-(\d{3})$/;
const PHASE_SKILLS = {
  plan: 'plan-task',
  implement: 'implement-task',
  validate: 'validate',
  finalize: 'finalize-task',
};
const MAX_TASK_FILES = 1000;
const MAX_TASK_BYTES = 10 * 1024 * 1024;

function normalizeTaskId(value) {
  if (/^\d+$/.test(value)) return `TASK-${String(Number(value)).padStart(3, '0')}`;
  const normalized = String(value).toUpperCase();
  if (TASK_ID.test(normalized)) return normalized;
  throw new Error(`Invalid task identifier: ${value}`);
}

function parseArgs(argv) {
  const result = {
    command: null,
    harness: null,
    repo: process.cwd(),
    project: null,
    tasks: [],
    dryRun: false,
  };

  let index = 0;
  if (argv[index] === 'task' || argv[index] === 'all') {
    result.command = argv[index++];
  } else if (argv[index] === '--help' || argv[index] === '-h') {
    return { ...result, help: true };
  } else {
    throw new Error('First argument must be task or all');
  }

  for (; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--harness') result.harness = argv[++index] || null;
    else if (arg === '--repo') result.repo = path.resolve(argv[++index] || '');
    else if (arg === '--project') result.project = argv[++index] || null;
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else result.tasks.push(normalizeTaskId(arg));
  }

  if (!result.help && !['claude', 'codex'].includes(result.harness)) {
    throw new Error('--harness must be claude or codex');
  }
  if (result.command === 'task' && result.tasks.length === 0) {
    throw new Error('task requires at least one task identifier');
  }
  if (result.command === 'all' && result.tasks.length > 0) {
    throw new Error('all does not accept task identifiers');
  }
  return result;
}

function parseTaskCatalog(markdown) {
  const catalog = new Map();
  const heading = /^###\s+(TASK-\d{3}):\s*(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(heading)];

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length;
    const body = markdown.slice(match.index, end);
    const statusMatch = body.match(/^\*\*Status:\*\*\s*(Not Started|In Progress|Complete|Blocked)\s*$/mi);
    const blockedMatch = body.match(/^\*\*Blocked by:\*\*\s*(.+?)\s*$/mi);
    const blockedBy = !blockedMatch || /^none$/i.test(blockedMatch[1].trim())
      ? []
      : [...blockedMatch[1].matchAll(/TASK-\d{3}/gi)].map((entry) => entry[0].toUpperCase());

    catalog.set(match[1], {
      id: match[1],
      title: match[2].trim(),
      status: statusMatch ? statusMatch[1] : 'Not Started',
      blockedBy,
    });
  }

  if (catalog.size === 0) throw new Error('No TASK-NNN definitions found in tasks spec');
  return catalog;
}

function orderTasks(catalog, selected) {
  const requested = selected && selected.length
    ? [...new Set(selected)]
    : [...catalog.values()].filter((task) => task.status !== 'Complete').map((task) => task.id);
  const requestedSet = new Set(requested);
  const visiting = new Set();
  const visited = new Set();
  const ordered = [];

  function visit(taskId) {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) throw new Error(`Task dependency cycle includes ${taskId}`);
    const task = catalog.get(taskId);
    if (!task) throw new Error(`Task or dependency not found: ${taskId}`);
    visiting.add(taskId);
    for (const dependencyId of task.blockedBy) {
      const dependency = catalog.get(dependencyId);
      if (!dependency) throw new Error(`Task or dependency not found: ${dependencyId}`);
      if (dependency.status !== 'Complete') {
        if (!requestedSet.has(dependencyId)) {
          throw new Error(`${taskId} is blocked by incomplete ${dependencyId}`);
        }
        visit(dependencyId);
      }
    }
    visiting.delete(taskId);
    visited.add(taskId);
    if (task.status !== 'Complete') ordered.push(taskId);
  }

  requested.forEach(visit);
  return ordered;
}

function execGit(cwd, args, options = {}) {
  const safeArgs = [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'commit.gpgsign=false',
    ...args,
  ];
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  const output = execFileSync('git', safeArgs, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    env,
  });
  return options.raw ? output : output.trim();
}

function forEachGitRecord(cwd, args, visit) {
  const safeArgs = [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'core.fsmonitor=false',
    '-c', 'commit.gpgsign=false',
    ...args,
  ];
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-git-'));
  const outputPath = path.join(tempDir, 'records');
  let outputFd;
  try {
    outputFd = fs.openSync(outputPath, 'wx', 0o600);
    const result = spawnSync('git', safeArgs, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', outputFd, 'pipe'],
      env,
    });
    fs.closeSync(outputFd);
    outputFd = undefined;
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error((result.stderr || '').trim() || `git exited with status ${result.status}`);
    }

    const inputFd = fs.openSync(outputPath, 'r');
    const chunk = Buffer.allocUnsafe(64 * 1024);
    let pending = Buffer.alloc(0);
    try {
      let bytesRead;
      while ((bytesRead = fs.readSync(inputFd, chunk, 0, chunk.length, null)) > 0) {
        const data = pending.length
          ? Buffer.concat([pending, chunk.subarray(0, bytesRead)])
          : chunk.subarray(0, bytesRead);
        let start = 0;
        let separator;
        while ((separator = data.indexOf(0, start)) !== -1) {
          if (separator > start) visit(data.subarray(start, separator).toString('utf8'));
          start = separator + 1;
        }
        pending = Buffer.from(data.subarray(start));
      }
      if (pending.length) throw new Error('Git record output was not NUL-terminated');
    } finally {
      fs.closeSync(inputFd);
    }
  } finally {
    if (outputFd !== undefined) fs.closeSync(outputFd);
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    fs.rmdirSync(tempDir);
  }
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

function snapshotGitControls(commonDir) {
  const hash = crypto.createHash('sha256');
  const roots = [
    'config',
    'config.worktree',
    'hooks',
    path.join('info', 'attributes'),
    path.join('info', 'exclude'),
  ];
  const linked = path.join(commonDir, 'worktrees');
  if (fs.existsSync(linked)) {
    for (const entry of fs.readdirSync(linked).sort()) {
      const relative = path.join('worktrees', entry, 'config.worktree');
      if (fs.existsSync(path.join(commonDir, relative))) roots.push(relative);
    }
  }
  function add(relative) {
    const absolute = path.join(commonDir, relative);
    if (!fs.existsSync(absolute)) {
      hash.update(`missing:\0${relative}\0`);
      return;
    }
    const stat = fs.lstatSync(absolute);
    hash.update(`${relative}\0${stat.mode}\0`);
    if (stat.isSymbolicLink()) {
      throw new Error(`Git control path must not be a symlink: ${absolute}`);
    } else if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) add(path.join(relative, entry));
    } else if (stat.isFile()) {
      hash.update(fs.readFileSync(absolute));
    }
  }
  roots.forEach(add);
  const configListing = execFileSync(
    'git',
    ['config', '--show-origin', '--null', '--list'],
    {
      cwd: path.dirname(commonDir),
      encoding: 'utf8',
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  hash.update('resolved-config:\0');
  hash.update(configListing);
  return hash.digest('hex');
}

function assertGitControls(commonDir, expected) {
  if (snapshotGitControls(commonDir) !== expected) {
    throw new Error('Repository Git config, hooks, or info attributes changed during a model phase');
  }
}

function registeredWorktrees(repoRoot) {
  return execGit(repoRoot, ['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .filter(Boolean)
    .map((record) => {
      const lines = record.split('\n');
      const worktree = lines.find((line) => line.startsWith('worktree '));
      const branch = lines.find((line) => line.startsWith('branch '));
      return {
        path: fs.realpathSync(worktree.slice('worktree '.length)),
        branch: branch ? branch.slice('branch '.length) : null,
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function snapshotRepositoryRefs(repoRoot) {
  return execGit(
    repoRoot,
    ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs'],
    { raw: true }
  ).split('\n').filter(Boolean).sort().join('\n');
}

function snapshotWorktreeRegistry(repoRoot) {
  return registeredWorktrees(repoRoot)
    .map((entry) => `${entry.path}\0${entry.branch || 'DETACHED'}`)
    .join('\n');
}

function withoutRef(snapshot, refName) {
  return snapshot.split('\n').filter((entry) => !entry.startsWith(`${refName}\0`)).join('\n');
}

function withoutWorktree(snapshot, worktreePath) {
  return snapshot.split('\n').filter((entry) => !entry.startsWith(`${worktreePath}\0`)).join('\n');
}

function assertRepositoryTransition(repoRoot, before, input) {
  const afterRefs = snapshotRepositoryRefs(repoRoot);
  const afterWorktrees = snapshotWorktreeRegistry(repoRoot);
  const taskRef = `refs/heads/task/${input.taskId}`;
  const taskWorktree = path.join(repoRoot, '.worktrees', input.taskId);
  const mutableTaskRef = input.phase !== 'plan';
  if ((mutableTaskRef ? withoutRef(before.refs, taskRef) : before.refs)
      !== (mutableTaskRef ? withoutRef(afterRefs, taskRef) : afterRefs)) {
    throw new Error(`Repository refs outside ${taskRef} changed during ${input.phase}`);
  }
  if (input.phase === 'implement') {
    if (withoutWorktree(before.worktrees, taskWorktree) !== withoutWorktree(afterWorktrees, taskWorktree)) {
      throw new Error('An unrelated registered worktree changed during implementation');
    }
  } else if (before.worktrees !== afterWorktrees) {
    throw new Error(`Registered worktrees changed during ${input.phase}`);
  }
}

function assertNoCommandGitConfig(repoRoot) {
  const keys = execGit(repoRoot, ['config', '--includes', '--name-only', '--list'])
    .split('\n').filter(Boolean);
  const unsafePattern = /^(?:filter\..*\.(?:clean|smudge|process|required)|merge\..*\.driver|diff\.(?:external|.*\.(?:command|textconv))|core\.(?:attributesfile|worktree)|include(?:if\..*)?\.path)$/i;
  const unsafe = keys.filter((key) => unsafePattern.test(key));
  if (unsafe.length) {
    throw new Error(`Repository Git config contains command-bearing or external-path settings: ${unsafe.join(', ')}`);
  }
}

function snapshotIgnoredPaths(repoRoot, excludedRoots) {
  const hash = crypto.createHash('sha256');
  forEachGitRecord(
    repoRoot,
    ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    (relative) => {
      const absolute = path.resolve(repoRoot, relative);
      if (!isContained(repoRoot, absolute)) throw new Error(`Ignored path escapes repository: ${relative}`);
      if (excludedRoots.some((root) => isContained(root, absolute))) return;
      hash.update(`${relative}\0`);
    },
  );
  return hash.digest('hex');
}

function assertIgnoredPaths(repoRoot, excludedRoots, expected) {
  if (snapshotIgnoredPaths(repoRoot, excludedRoots) !== expected) {
    throw new Error('The ignored path set in the base worktree changed during a model phase');
  }
}

function assertPlanTree(projectRoot) {
  const planRoot = path.join(projectRoot, '.groundwork-plans');
  if (!fs.existsSync(planRoot)) fs.mkdirSync(planRoot, { recursive: true });
  assertNoSymlinkComponents(projectRoot, planRoot, 'Plan directory');
  const stack = [planRoot];
  while (stack.length) {
    const directory = stack.pop();
    for (const entry of fs.readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error(`Plan directory contains a symlink: ${absolute}`);
      if (stat.isDirectory()) stack.push(absolute);
    }
  }
}

function snapshotUnrelatedWorktrees(repoRoot, taskWorktree) {
  const records = registeredWorktrees(repoRoot);
  const registeredPaths = new Set(records.map((entry) => entry.path));
  const worktreeParent = path.join(repoRoot, '.worktrees');
  if (fs.existsSync(worktreeParent)) {
    const parentStat = fs.lstatSync(worktreeParent);
    if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
      throw new Error(`Worktree parent is not a real directory: ${worktreeParent}`);
    }
    for (const name of fs.readdirSync(worktreeParent)) {
      const child = path.join(worktreeParent, name);
      const childStat = fs.lstatSync(child);
      if (childStat.isSymbolicLink() || !childStat.isDirectory()) {
        throw new Error(`Unregistered or unsafe entry under .worktrees: ${child}`);
      }
      const canonical = fs.realpathSync(child);
      if (canonical !== taskWorktree && !registeredPaths.has(canonical)) {
        throw new Error(`Unregistered directory under .worktrees: ${child}`);
      }
    }
  }

  return records
    .filter((entry) => entry.path !== repoRoot && entry.path !== taskWorktree)
    .map((entry) => {
      assertClean(entry.path, `Unrelated worktree ${entry.path}`);
      return `${entry.path}\0${execGit(entry.path, ['rev-parse', 'HEAD'])}\0${snapshotIgnoredPaths(entry.path, [])}`;
    })
    .join('\n');
}

function refExists(repoRoot, refName) {
  try {
    execGit(repoRoot, ['show-ref', '--verify', '--quiet', refName]);
    return true;
  } catch {
    return false;
  }
}

function parseGroundworkConfig(content) {
  const projects = {};
  let current = null;
  for (const line of content.split('\n')) {
    const project = line.match(/^  ([A-Za-z0-9][A-Za-z0-9_-]*):\s*$/);
    if (project) {
      current = project[1];
      projects[current] = {};
      continue;
    }
    const property = current && line.match(/^    ([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
    if (property) projects[current][property[1]] = property[2].replace(/^['"]|['"]$/g, '');
  }
  return projects;
}

function resolveProject(repoRoot, requestedProject, cwd = process.cwd()) {
  const configPath = path.join(repoRoot, '.groundwork.yml');
  if (!fs.existsSync(configPath)) {
    return { projectName: null, projectRoot: repoRoot, specsDir: path.join(repoRoot, 'specs') };
  }

  const projects = parseGroundworkConfig(fs.readFileSync(configPath, 'utf8'));
  let projectName = requestedProject || process.env.GROUNDWORK_PROJECT || null;
  if (!projectName) {
    const absoluteCwd = path.resolve(cwd);
    projectName = Object.keys(projects).find((name) => {
      if (!projects[name].path) return false;
      return isContained(path.resolve(repoRoot, projects[name].path), absoluteCwd);
    }) || null;
  }
  if (!projectName) {
    throw new Error('Monorepo project is ambiguous; pass --project <name>');
  }
  if (!projects[projectName] || !projects[projectName].path) {
    throw new Error(`Unknown Groundwork project: ${projectName}`);
  }

  const lexicalProjectRoot = path.resolve(repoRoot, projects[projectName].path);
  assertNoSymlinkComponents(repoRoot, lexicalProjectRoot, `Project ${projectName}`);
  const projectRoot = fs.realpathSync(lexicalProjectRoot);
  if (!isContained(repoRoot, projectRoot)) {
    throw new Error(`Project ${projectName} resolves outside the repository`);
  }
  return { projectName, projectRoot, specsDir: path.join(projectRoot, 'specs') };
}

function readTasks(projectRoot) {
  const file = path.join(projectRoot, 'specs', 'tasks.md');
  if (fs.existsSync(file)) {
    assertNoSymlinkComponents(projectRoot, file, 'Tasks file');
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Tasks path must be a regular file: ${file}`);
    if (stat.size > MAX_TASK_BYTES) throw new Error('Tasks spec exceeds the 10 MiB limit');
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
        if (files.length > MAX_TASK_FILES || totalBytes > MAX_TASK_BYTES) {
          throw new Error('Tasks spec exceeds the file-count or 10 MiB limit');
        }
      }
    }
  }
  collect(directory);
  return files.map((taskFile) => fs.readFileSync(taskFile, 'utf8')).join('\n\n');
}

function resultFailure(output) {
  const match = String(output).match(/^RESULT:\s*(?:FAILURE|NEEDS_INPUT|CLEANUP_REQUIRED)\s*\|\s*(.+)$/mi);
  return match ? match[1].trim() : null;
}

function parsePlanResult(output) {
  const failure = resultFailure(output);
  if (failure) throw new Error(failure);
  const match = String(output).match(
    /^RESULT:\s*PLANNED\s*\|\s*plan_file_path=(.+?)\s*\|\s*identifier=(TASK-\d{3}|FEATURE-[^|\s]+)\s*\|\s*branch_prefix=([^|\s]+)\s*$/mi
  );
  if (!match) throw new Error('plan-task did not return a structured PLANNED result');
  return { planFilePath: match[1].trim(), identifier: match[2], branchPrefix: match[3] };
}

function parseImplementationResult(output) {
  const failure = resultFailure(output);
  if (failure) throw new Error(failure);
  const match = String(output).match(
    /^RESULT:\s*IMPLEMENTED\s*\|\s*worktree_path=(.+?)\s*\|\s*branch=(.+?)\s*\|\s*base_branch=(.+?)\s*$/mi
  );
  if (!match) throw new Error('implement-task did not return a structured IMPLEMENTED result');
  return { worktreePath: match[1].trim(), branch: match[2].trim(), baseBranch: match[3].trim() };
}

function parseValidationResult(output) {
  const failure = resultFailure(output);
  if (failure) throw new Error(failure);
  const lastLine = String(output).trim().split('\n').pop().trim();
  const match = lastLine.match(
    /^RESULT:\s*VALIDATED\s*\|\s*iterations=(\d+)\s*\|\s*fixed=(\d+)\s*\|\s*unworked=(\d+)\s*\|\s*validated_head=([0-9a-f]{40,64})\s*$/i
  );
  if (!match) throw new Error('validate did not return a structured validation result');
  return {
    iterations: Number(match[1]),
    fixed: Number(match[2]),
    unworked: Number(match[3]),
    validatedHead: match[4],
  };
}

function parseFinalizeResult(output) {
  const failure = resultFailure(output);
  if (failure) throw new Error(failure);
  const ready = String(output).match(
    /^RESULT:\s*READY_TO_MERGE\s*\|\s*task_id=(TASK-\d{3})\s*\|\s*task_head=([^|\s]+)\s*\|\s*base_head=([^|\s]+)\s*\|\s*merge_message=(.+?)\s*$/mi
  );
  if (ready) {
    return {
      outcome: 'ready',
      taskId: ready[1],
      taskHead: ready[2],
      baseHead: ready[3],
      mergeMessage: ready[4].trim(),
    };
  }
  const revalidate = String(output).match(
    /^RESULT:\s*REVALIDATE\s*\|\s*task_head=([^|\s]+)\s*\|\s*base_head=([^|\s]+)\s*\|\s*reason=(.+?)\s*$/mi
  );
  if (revalidate) {
    return {
      outcome: 'revalidate',
      taskHead: revalidate[1],
      baseHead: revalidate[2],
      reason: revalidate[3].trim(),
    };
  }
  throw new Error('finalize-task did not return a structured finalization result');
}

function buildInvocation({ harness, cwd, pluginRoot, prompt, resultFile }) {
  if (harness === 'claude') {
    return {
      command: 'claude',
      args: [
        '-p',
        '--no-session-persistence',
        '--plugin-dir', pluginRoot,
        '--model', 'sonnet',
        '--effort', 'high',
        '--permission-mode', 'acceptEdits',
        '--output-format', 'text',
      ],
      cwd,
      input: prompt,
    };
  }
  if (harness === 'codex') {
    return {
      command: 'codex',
      args: [
        'exec',
        '--ephemeral',
        '--approve-for-me',
        '--sandbox', 'workspace-write',
        '--cd', cwd,
        '--output-last-message', resultFile,
        '-',
      ],
      cwd,
      input: prompt,
    };
  }
  throw new Error(`Unsupported harness: ${harness}`);
}

function invokePhase(input) {
  const resultFile = path.join(os.tmpdir(), `groundwork-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
  const invocation = buildInvocation({ ...input, resultFile });
  const env = buildChildEnv(input.harness, input.env);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env,
    input: invocation.input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let output = result.stdout || '';
  if (input.harness === 'codex' && fs.existsSync(resultFile)) {
    output = fs.readFileSync(resultFile, 'utf8');
    fs.unlinkSync(resultFile);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${input.phase} process exited ${result.status}: ${(result.stderr || output).trim()}`);
  }
  return output;
}

function buildChildEnv(harness, additions = {}) {
  const exact = new Set([
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', 'TERM',
    'COLORTERM', 'NO_COLOR', 'SSH_AUTH_SOCK',
  ]);
  const prefixes = ['LC_', 'XDG_'];
  if (harness === 'claude') {
    prefixes.push('ANTHROPIC_', 'CLAUDE_', 'AWS_', 'GOOGLE_', 'VERTEX_', 'AZURE_');
  } else {
    exact.add('CODEX_HOME');
    prefixes.push('OPENAI_', 'CODEX_', 'AZURE_OPENAI_');
  }
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix))) env[key] = value;
  }
  Object.assign(env, additions);
  delete env.CLAUDECODE;
  delete env.NODE_OPTIONS;
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  return env;
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

function assertClean(cwd, label, seen = new Set()) {
  const canonical = fs.realpathSync(cwd);
  if (seen.has(canonical)) throw new Error(`${label} contains a recursive submodule path`);
  seen.add(canonical);
  try {
    execGit(cwd, ['update-index', '--really-refresh']);
  } catch {
    throw new Error(`${label} has tracked content that differs from its index`);
  }
  const flagged = execGit(cwd, ['ls-files', '-v', '-z'], { raw: true })
    .split('\0')
    .filter((entry) => entry && (/^[a-z] /.test(entry) || entry.startsWith('S ')));
  if (flagged.length) {
    throw new Error(`${label} has assume-unchanged or skip-worktree entries:\n${flagged.join('\n')}`);
  }
  const status = execGit(cwd, [
    'status',
    '--porcelain',
    '--untracked-files=all',
    '--ignore-submodules=none',
  ]);
  if (status) throw new Error(`${label} is not clean:\n${status}`);
  for (const relative of initializedSubmodules(cwd)) {
    const absolute = path.join(cwd, relative);
    assertNoSymlinkComponents(cwd, absolute, `${label} submodule`);
    assertClean(absolute, `${label} submodule ${relative}`, seen);
  }
  seen.delete(canonical);
}

function assertPlanFile(projectRoot, reportedPath) {
  const lexical = path.resolve(projectRoot, reportedPath);
  const lexicalAllowed = path.join(projectRoot, '.groundwork-plans');
  if (!isContained(lexicalAllowed, lexical)) throw new Error('Plan file is outside .groundwork-plans');
  assertNoSymlinkComponents(projectRoot, lexical, 'Plan file');
  const allowed = fs.realpathSync(lexicalAllowed);
  const absolute = fs.realpathSync(lexical);
  if (!isContained(allowed, absolute)) throw new Error('Plan file resolves outside .groundwork-plans');
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Plan file must be a regular non-symlink file');
  return absolute;
}

function ensureLocalPlanIgnore(repoRoot, projectRoot) {
  const gitPath = execGit(repoRoot, ['rev-parse', '--git-path', 'info/exclude']);
  const excludePath = path.resolve(repoRoot, gitPath);
  const relativeProject = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
  const pattern = relativeProject
    ? `/${relativeProject}/.groundwork-plans/`
    : '/.groundwork-plans/';
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  if (!existing.split('\n').includes(pattern)) {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.appendFileSync(excludePath, `${existing && !existing.endsWith('\n') ? '\n' : ''}${pattern}\n`);
  }
}

function phasePrompt(phase, input) {
  const phaseSkill = PHASE_SKILLS[phase];
  const skill = input.harness === 'claude'
    ? ['groundwork', phaseSkill].join(':')
    : `groundwork-${phaseSkill}`;
  const projectArg = input.projectName ? ` --project ${input.projectName}` : '';
  const header = [
    'GROUNDWORK_RUNNER_MODE=true',
    'GROUNDWORK_BATCH_MODE=true',
    `Invoke the ${skill} skill exactly once in this fresh session.`,
    'Do not invoke any earlier or later phase. Do not ask questions; return RESULT: FAILURE when blocked.',
    `Task: ${input.taskId}`,
    `Repository root: ${input.repoRoot}`,
    `Project root: ${input.projectRoot}`,
    `Specs directory: ${input.specsDir}`,
  ];

  if (phase === 'plan') {
    header.push(`Skill arguments: ${input.taskId}${projectArg}`);
  } else if (phase === 'implement') {
    header.push(`Skill arguments: ${input.planFile}${projectArg}`);
    header.push(`Create the task worktree at exactly ${path.join(input.repoRoot, '.worktrees', input.taskId)}.`);
    header.push('The task status must be changed to In Progress inside the task worktree and included in the implementation commit.');
  } else if (phase === 'validate') {
    header.push(`Skill arguments: ${projectArg.trim() || '(none)'}`);
    header.push(`Validate the full diff from base_sha=${input.baseSha} through the current worktree state.`);
  } else {
    header.push(`Skill arguments: ${input.taskId}${projectArg}`);
    header.push(`Worktree: ${input.worktreePath}`);
    header.push(`Task branch: ${input.branch}`);
    header.push(`Base branch: ${input.baseBranch}`);
    header.push(`Expected base head: ${input.baseSha}`);
    header.push(`Validated task head: ${input.validatedHead}`);
  }
  return header.join('\n');
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
    if (currentTask === taskId && /^\*\*Status:\*\*/.test(line)) {
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
  if (!beforeTask || !afterTask || beforeTask.status === 'Complete' || afterTask.status !== 'Complete') {
    throw new Error(`finalize-task did not make only the required ${taskId} completion transition`);
  }
}

function mergeAndCleanup(repoRoot, projectRoot, taskId, implementation, result, implementationHead, validatedHead, baseBranch) {
  if (result.taskId !== taskId) throw new Error(`finalize-task returned the wrong task: ${result.taskId}`);
  if (!result.mergeMessage || result.mergeMessage.length > 200 || /[\r\n]/.test(result.mergeMessage)) {
    throw new Error('finalize-task returned an invalid merge message');
  }
  assertRegisteredWorktree(repoRoot, implementation.worktreePath, implementation.branch);
  assertClean(implementation.worktreePath, 'Task worktree ready to merge');
  if (execGit(implementation.worktreePath, ['rev-parse', 'HEAD']) !== result.taskHead) {
    throw new Error('READY_TO_MERGE task head does not match Git state');
  }
  if (execGit(repoRoot, ['branch', '--show-current']) !== baseBranch) {
    throw new Error(`Primary worktree moved from base branch ${baseBranch}`);
  }
  const priorBaseHead = execGit(repoRoot, ['rev-parse', baseBranch]);
  if (result.baseHead !== priorBaseHead) throw new Error('READY_TO_MERGE base head does not match Git state');
  if (execGit(repoRoot, ['rev-parse', `refs/heads/${implementation.branch}`]) !== result.taskHead) {
    throw new Error('Task branch moved from the verified task head');
  }
  assertClean(repoRoot, 'Base worktree ready to merge');
  execGit(repoRoot, ['merge-base', '--is-ancestor', priorBaseHead, validatedHead]);
  execGit(repoRoot, ['merge-base', '--is-ancestor', implementationHead, validatedHead]);
  execGit(repoRoot, ['merge-base', '--is-ancestor', validatedHead, result.taskHead]);
  taskBookkeepingPaths(repoRoot, projectRoot, taskId, validatedHead, result.taskHead);
  assertClean(repoRoot, 'Base worktree ready to merge');
  if (execGit(repoRoot, ['rev-parse', baseBranch]) !== priorBaseHead) {
    throw new Error('Base branch moved after final verification');
  }
  if (execGit(repoRoot, ['rev-parse', `refs/heads/${implementation.branch}`]) !== result.taskHead) {
    throw new Error('Task branch moved after final verification');
  }
  try {
    execGit(repoRoot, ['merge', '--no-ff', result.taskHead, '-m', result.mergeMessage]);
  } catch (error) {
    try { execGit(repoRoot, ['merge', '--abort']); } catch {}
    throw new Error(`Merge failed and was aborted: ${error.message}`);
  }
  const mergeCommit = execGit(repoRoot, ['rev-parse', 'HEAD']);
  const parents = execGit(repoRoot, ['rev-list', '--parents', '-n', '1', mergeCommit]).split(/\s+/).slice(1);
  if (parents.length !== 2 || parents[0] !== priorBaseHead || parents[1] !== result.taskHead) {
    throw new Error('Final merge parents do not match the verified base and task heads');
  }
  execGit(repoRoot, ['merge-base', '--is-ancestor', implementationHead, mergeCommit]);
  assertClean(repoRoot, 'Base worktree');
  assertRegisteredWorktree(repoRoot, implementation.worktreePath, implementation.branch);
  if (execGit(repoRoot, ['rev-parse', `refs/heads/${implementation.branch}`]) !== result.taskHead) {
    throw new Error('Task branch moved after merge; preserving its worktree and branch');
  }
  execGit(repoRoot, ['worktree', 'remove', implementation.worktreePath]);
  execGit(repoRoot, ['branch', '-d', implementation.branch]);
  assertClean(repoRoot, 'Base worktree');
  return mergeCommit;
}

function runTasks(options, dependencies = {}) {
  const log = dependencies.log || console.log;
  const repoInput = path.resolve(options.repo || process.cwd());
  const repoRoot = fs.realpathSync(execGit(repoInput, ['rev-parse', '--show-toplevel']));
  const commonDir = fs.realpathSync(path.resolve(repoRoot, execGit(repoRoot, ['rev-parse', '--git-common-dir'])));
  const primaryRoot = fs.realpathSync(path.dirname(commonDir));
  if (repoRoot !== primaryRoot) {
    throw new Error(`Run from the primary worktree or pass --repo ${primaryRoot}`);
  }
  const baseBranch = execGit(repoRoot, ['branch', '--show-current']);
  if (!baseBranch) throw new Error('The primary worktree must be on a local branch');
  assertClean(repoRoot, 'Base worktree');

  const project = dependencies.resolveProject
    ? dependencies.resolveProject(repoRoot, options.project, repoInput)
    : resolveProject(repoRoot, options.project, repoInput);
  const projectRoot = fs.realpathSync(project.projectRoot);
  if (!isContained(repoRoot, projectRoot)) throw new Error('Selected project is outside the repository');
  assertNoSymlinkComponents(repoRoot, projectRoot, 'Selected project');

  const catalog = parseTaskCatalog(readTasks(projectRoot));
  const selected = options.command === 'task' ? options.tasks : null;
  const taskIds = orderTasks(catalog, selected);
  if (options.dryRun) {
    taskIds.forEach((taskId) => log(taskId));
    return taskIds;
  }
  ensureLocalPlanIgnore(repoRoot, projectRoot);
  assertPlanTree(projectRoot);
  assertNoCommandGitConfig(repoRoot);
  const gitControls = snapshotGitControls(commonDir);
  const ignoredExclusions = [
    path.join(repoRoot, '.worktrees'),
    path.join(projectRoot, '.groundwork-plans'),
  ];
  const ignoredPaths = snapshotIgnoredPaths(repoRoot, ignoredExclusions);

  const callPhase = dependencies.invokePhase || invokePhase;
  function invokeChecked(input) {
    if (dependencies.beforePhase) dependencies.beforePhase(input);
    const taskWorktree = path.join(repoRoot, '.worktrees', input.taskId);
    const repositoryState = {
      refs: snapshotRepositoryRefs(repoRoot),
      worktrees: snapshotWorktreeRegistry(repoRoot),
      unrelated: snapshotUnrelatedWorktrees(repoRoot, taskWorktree),
    };
    try {
      return callPhase(input);
    } finally {
      assertGitControls(commonDir, gitControls);
      assertPlanTree(projectRoot);
      assertIgnoredPaths(repoRoot, ignoredExclusions, ignoredPaths);
      assertRepositoryTransition(repoRoot, repositoryState, input);
      if (snapshotUnrelatedWorktrees(repoRoot, taskWorktree) !== repositoryState.unrelated) {
        throw new Error(`An unrelated worktree changed during ${input.phase}`);
      }
    }
  }
  const pluginRoot = dependencies.pluginRoot || path.resolve(__dirname, '..');
  const completed = [];

  for (const taskId of taskIds) {
    let implementation = null;
    try {
      const expectedBranch = `task/${taskId}`;
      const expectedWorktree = path.join(repoRoot, '.worktrees', taskId);
      if (refExists(repoRoot, `refs/heads/${expectedBranch}`) || fs.existsSync(expectedWorktree)) {
        throw new Error(`Expected task branch or worktree already exists: ${expectedBranch}, ${expectedWorktree}`);
      }
      const baseSha = execGit(repoRoot, ['rev-parse', 'HEAD']);
      const common = {
        harness: options.harness,
        taskId,
        repoRoot,
        projectName: project.projectName,
        projectRoot,
        specsDir: project.specsDir,
      };
      const env = {
        GROUNDWORK_HARNESS: options.harness,
        GROUNDWORK_HARNESS_CHILD: '1',
        GROUNDWORK_RUNNER_MODE: 'true',
        GROUNDWORK_BATCH_MODE: 'true',
        GROUNDWORK_PROJECT: project.projectName || '',
        GROUNDWORK_PROJECT_ROOT: projectRoot,
      };

      log(`[${taskId}] plan`);
      const planOutput = invokeChecked({
        ...common,
        phase: 'plan',
        cwd: projectRoot,
        pluginRoot,
        env,
        prompt: phasePrompt('plan', common),
      });
      const plan = parsePlanResult(planOutput);
      if (plan.identifier !== taskId) throw new Error(`plan-task returned ${plan.identifier}, expected ${taskId}`);
      const planFile = assertPlanFile(projectRoot, plan.planFilePath);
      if (execGit(repoRoot, ['rev-parse', 'HEAD']) !== baseSha) throw new Error('Base branch changed during planning');
      if (execGit(repoRoot, ['branch', '--show-current']) !== baseBranch) throw new Error('Base branch switched during planning');
      assertClean(repoRoot, 'Base worktree');

      log(`[${taskId}] implement`);
      const implementInput = { ...common, planFile };
      const implementOutput = invokeChecked({
        ...implementInput,
        phase: 'implement',
        cwd: projectRoot,
        pluginRoot,
        env,
        prompt: phasePrompt('implement', implementInput),
      });
      implementation = parseImplementationResult(implementOutput);
      if (implementation.branch !== expectedBranch) {
        throw new Error(`implement-task returned ${implementation.branch}; expected branch ${expectedBranch}`);
      }
      const reportedStat = fs.lstatSync(implementation.worktreePath);
      if (reportedStat.isSymbolicLink() || !reportedStat.isDirectory()) {
        throw new Error('implement-task returned a symlinked or non-directory worktree');
      }
      if (fs.realpathSync(implementation.worktreePath) !== expectedWorktree) {
        throw new Error(`implement-task returned ${implementation.worktreePath}; expected worktree ${expectedWorktree}`);
      }
      implementation.worktreePath = assertRegisteredWorktree(repoRoot, expectedWorktree, implementation.branch);
      if (implementation.baseBranch !== baseBranch || execGit(repoRoot, ['branch', '--show-current']) !== baseBranch) {
        throw new Error(`Expected original base branch ${baseBranch}`);
      }
      if (execGit(repoRoot, ['rev-parse', implementation.baseBranch]) !== baseSha) {
        throw new Error('Base branch changed during implementation');
      }
      assertClean(repoRoot, 'Base worktree');
      assertClean(implementation.worktreePath, 'Task worktree');
      const implementationHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
      execGit(repoRoot, ['merge-base', '--is-ancestor', baseSha, implementationHead]);
      const projectRelativePath = path.relative(repoRoot, projectRoot);
      const lexicalTaskProject = path.join(implementation.worktreePath, projectRelativePath);
      assertNoSymlinkComponents(implementation.worktreePath, lexicalTaskProject, 'Task project');
      const taskProjectRoot = fs.realpathSync(lexicalTaskProject);
      if (!isContained(implementation.worktreePath, taskProjectRoot)) {
        throw new Error('Selected project resolves outside the task worktree');
      }
      assertNoSymlinkComponents(implementation.worktreePath, taskProjectRoot, 'Task project');
      const taskSpecsDir = path.join(taskProjectRoot, 'specs');
      assertNoSymlinkComponents(taskProjectRoot, taskSpecsDir, 'Task specs');
      const taskCommon = {
        ...common,
        projectRoot: taskProjectRoot,
        specsDir: taskSpecsDir,
      };
      const taskEnv = {
        ...env,
        GROUNDWORK_PROJECT_ROOT: taskProjectRoot,
      };

      let validation;
      let validationBase = baseSha;
      let repeats = new Set();
      for (let attempt = 0; attempt < 5; attempt++) {
        log(`[${taskId}] validate`);
        const validateInput = {
          ...taskCommon,
          baseSha: validationBase,
          worktreePath: implementation.worktreePath,
          branch: implementation.branch,
          baseBranch: implementation.baseBranch,
        };
        validation = parseValidationResult(invokeChecked({
          ...validateInput,
          phase: 'validate',
          cwd: taskProjectRoot,
          pluginRoot,
          env: taskEnv,
          prompt: phasePrompt('validate', validateInput),
        }));
        implementation.worktreePath = assertRegisteredWorktree(
          repoRoot,
          implementation.worktreePath,
          implementation.branch
        );
        assertClean(implementation.worktreePath, 'Validated task worktree');
        assertNoSymlinkComponents(implementation.worktreePath, lexicalTaskProject, 'Task project');
        assertNoSymlinkComponents(taskProjectRoot, taskSpecsDir, 'Task specs');
        const validatedHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
        if (validation.validatedHead !== validatedHead) {
          throw new Error('VALIDATED receipt does not match the clean task-worktree HEAD');
        }

        log(`[${taskId}] finalize`);
        const finalizeInput = { ...validateInput, validatedHead };
        const finalization = parseFinalizeResult(invokeChecked({
          ...finalizeInput,
          phase: 'finalize',
          cwd: taskProjectRoot,
          pluginRoot,
          env: taskEnv,
          prompt: phasePrompt('finalize', finalizeInput),
        }));
        implementation.worktreePath = assertRegisteredWorktree(
          repoRoot,
          implementation.worktreePath,
          implementation.branch
        );
        assertNoSymlinkComponents(implementation.worktreePath, lexicalTaskProject, 'Task project');
        assertNoSymlinkComponents(taskProjectRoot, taskSpecsDir, 'Task specs');

        if (finalization.outcome === 'ready') {
          mergeAndCleanup(
            repoRoot,
            projectRoot,
            taskId,
            implementation,
            finalization,
            implementationHead,
            validatedHead,
            baseBranch
          );
          const completedTask = parseTaskCatalog(readTasks(projectRoot)).get(taskId);
          if (!completedTask || completedTask.status !== 'Complete') {
            throw new Error(`${taskId} is not Complete after finalization`);
          }
          const { validatedHead: _validatedHead, ...validationSummary } = validation;
          completed.push({ taskId, validation: validationSummary });
          implementation = null;
          break;
        }

        implementation.worktreePath = assertRegisteredWorktree(
          repoRoot,
          implementation.worktreePath,
          implementation.branch
        );
        assertClean(implementation.worktreePath, 'Task worktree after base integration');
        const actualTaskHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
        const actualBaseHead = execGit(repoRoot, ['rev-parse', implementation.baseBranch]);
        if (finalization.taskHead !== actualTaskHead || finalization.baseHead !== actualBaseHead) {
          throw new Error('REVALIDATE heads do not match Git state');
        }
        const fingerprint = `${actualTaskHead}:${actualBaseHead}`;
        if (repeats.has(fingerprint)) throw new Error('finalize-task requested revalidation without changing Git state');
        repeats.add(fingerprint);
        validationBase = actualBaseHead;

        if (attempt === 4) throw new Error('Base kept moving; finalization exceeded 5 revalidation attempts');
      }
    } catch (error) {
      const preserved = implementation
        ? `\nWorktree preserved: ${implementation.worktreePath}\nBranch preserved: ${implementation.branch}`
        : '';
      throw new Error(`${taskId} failed: ${error.message}${preserved}`);
    }
  }
  return completed;
}

function usage() {
  return `Usage:
  groundwork-run task TASK-NNN [TASK-NNN ...] --harness claude|codex [--project NAME] [--repo PATH]
  groundwork-run all --harness claude|codex [--project NAME] [--repo PATH] [--dry-run]`;
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(usage());
      return 0;
    }
    const completed = runTasks(options);
    console.log(`RESULT: SUCCESS | completed=${completed.length}`);
    return 0;
  } catch (error) {
    console.error(`RESULT: FAILURE | ${error.message}`);
    return 1;
  }
}

module.exports = {
  normalizeTaskId,
  parseArgs,
  parseTaskCatalog,
  orderTasks,
  parsePlanResult,
  parseImplementationResult,
  parseValidationResult,
  parseFinalizeResult,
  buildInvocation,
  buildChildEnv,
  forEachGitRecord,
  invokePhase,
  assertRegisteredWorktree,
  resolveProject,
  runTasks,
  main,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
