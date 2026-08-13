#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const { StringDecoder } = require('string_decoder');
const { Worker } = require('worker_threads');

const TASK_ID = /^TASK-(\d{3})$/;
const PHASE_SKILLS = {
  plan: 'plan-task',
  implement: 'implement-task',
  validate: 'validate',
  finalize: 'finalize-task',
};
const MAX_TASK_FILES = 1000;
const MAX_TASK_BYTES = 10 * 1024 * 1024;
const DEFAULT_HEARTBEAT_MS = 30_000;
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;
const MAX_CHECKPOINT_BYTES = 64 * 1024;

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const clock = `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return hours ? `${hours}:${clock}` : clock;
}

function formatLocalTimestamp(milliseconds) {
  const date = new Date(milliseconds);
  const stamp = [
    date.getFullYear(),
    '-', String(date.getMonth() + 1).padStart(2, '0'),
    '-', String(date.getDate()).padStart(2, '0'),
    ' ', String(date.getHours()).padStart(2, '0'),
    ':', String(date.getMinutes()).padStart(2, '0'),
    ':', String(date.getSeconds()).padStart(2, '0'),
  ].join('');
  const zonePart = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName');
  return `${stamp} ${zonePart ? zonePart.value : 'local'}`;
}

function normalizeActivity(harness, event, state = {}, now = Date.now()) {
  if (!event || typeof event !== 'object') return null;
  const longCommandMs = 10_000;
  function validationProgress(raw) {
    const prefix = 'GROUNDWORK_VALIDATION_PROGRESS ';
    const line = String(raw || '').split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
    if (!line) return null;
    const encoded = line.trim().slice(prefix.length);
    if (!encoded || encoded.length > 8_192) return null;
    let progress;
    try {
      progress = JSON.parse(encoded);
    } catch {
      return null;
    }
    if (!progress || !Number.isInteger(progress.iteration) || progress.iteration < 1
        || progress.iteration > 1_000 || !Array.isArray(progress.agents)
        || progress.agents.length === 0 || progress.agents.length > 32) return null;
    const validName = (name) => typeof name === 'string' && /^[a-z][a-z0-9-]{1,63}$/.test(name);
    if (progress.status === 'launched' && progress.agents.every(validName)) {
      return `validation iteration ${progress.iteration} launched — ${progress.agents.join(', ')}`;
    }
    const validVerdicts = new Set(['approve', 'request-changes', 'skipped']);
    if (progress.status === 'completed' && progress.agents.every((agent) => (
      agent && validName(agent.name) && validVerdicts.has(agent.verdict)
    ))) {
      return `validation iteration ${progress.iteration} completed — ${progress.agents
        .map((agent) => `${agent.name}: ${agent.verdict}`).join(', ')}`;
    }
    return null;
  }
  function safeCommand(raw) {
    let command = String(raw || '').replace(/\s+/g, ' ').trim();
    command = command.replace(
      /\b([A-Z_][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD))=(?:"[^"]*"|'[^']*'|\S+)/gi,
      '$1=[redacted]'
    );
    command = command.replace(
      /(--(?:api[-_]?key|token|secret|password))(=|\s+)(?:"[^"]*"|'[^']*'|\S+)/gi,
      (_match, flag, separator) => `${flag}${separator === '=' ? '=' : ' '}[redacted]`
    );
    return command.length > 180 ? `${command.slice(0, 179)}…` : command;
  }
  function startCommand(id, command) {
    if (!state.commandStarted) state.commandStarted = {};
    if (id) state.commandStarted[id] = now;
    const safe = safeCommand(command);
    return safe ? `$ ${safe}` : 'command started';
  }
  function finishCommand(id, failed, exitCode) {
    const startedAt = state.commandStarted && state.commandStarted[id];
    if (state.commandStarted && id) delete state.commandStarted[id];
    if (failed) {
      return Number.isInteger(exitCode) ? `command failed (exit ${exitCode})` : 'command failed';
    }
    const elapsed = startedAt === undefined ? 0 : now - startedAt;
    return elapsed >= longCommandMs ? `command completed in ${Math.round(elapsed / 1000)}s` : null;
  }
  if (harness === 'codex') {
    if (event.type === 'thread.started') return 'Codex session started';
    if (event.type === 'turn.started' || event.type === 'turn.completed') return null;
    if ((event.type === 'item.started' || event.type === 'item.completed') && event.item) {
      if (event.type === 'item.completed' && event.item.type === 'agent_message') {
        return validationProgress(event.item.text);
      }
      if (event.item.type === 'command_execution') {
        if (event.type === 'item.started') {
          return startCommand(event.item.id, event.item.command);
        }
        const failed = event.item.status === 'failed'
          || (Number.isInteger(event.item.exit_code) && event.item.exit_code !== 0);
        return finishCommand(event.item.id, failed, event.item.exit_code);
      }
      const labels = {
        mcp_tool_call: 'tool',
        web_search: 'web search',
        file_change: 'file change',
        todo_list: 'plan update',
      };
      const label = labels[event.item.type];
      if (!label) return null;
      return `${label} ${event.type.endsWith('started') ? 'started' : 'completed'}`;
    }
    return null;
  }
  if (harness === 'claude') {
    if (event.type === 'system' && event.subtype === 'init') return 'Claude session started';
    const content = event.message && Array.isArray(event.message.content) ? event.message.content : [];
    const progress = validationProgress(content
      .filter((block) => block && block.type === 'text')
      .map((block) => block.text)
      .join('\n'));
    if (progress) return progress;
    const toolUse = content.find((block) => block && block.type === 'tool_use' && block.name);
    if (toolUse) {
      if (!state.toolNames) state.toolNames = {};
      if (toolUse.id) state.toolNames[toolUse.id] = toolUse.name;
      if (toolUse.name === 'Bash') {
        return startCommand(toolUse.id, toolUse.input && toolUse.input.command);
      }
      return `tool ${toolUse.name} started`;
    }
    const toolResult = content.find((block) => block && block.type === 'tool_result');
    if (toolResult) {
      const name = state.toolNames && state.toolNames[toolResult.tool_use_id];
      if (name === 'Bash') {
        return finishCommand(toolResult.tool_use_id, Boolean(toolResult.is_error), null);
      }
      return `tool ${name || 'call'} completed`;
    }
  }
  return null;
}

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
    fromTask: null,
    toTask: null,
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
    else if (arg === '--from') result.fromTask = normalizeTaskId(argv[++index] || '');
    else if (arg === '--to') result.toTask = normalizeTaskId(argv[++index] || '');
    else if (arg === '--dry-run') result.dryRun = true;
    else if (arg === '--help' || arg === '-h') result.help = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else result.tasks.push(normalizeTaskId(arg));
  }

  if (!result.help && !['claude', 'codex'].includes(result.harness)) {
    throw new Error('--harness must be claude or codex');
  }
  if (result.tasks.length && (result.fromTask || result.toTask)) {
    throw new Error('Choose either an explicit task list or a --from/--to range, not both');
  }
  if (result.fromTask && result.toTask
      && Number(result.fromTask.slice(5)) > Number(result.toTask.slice(5))) {
    throw new Error('--from must come before or equal --to');
  }
  if (result.command === 'task' && result.tasks.length === 0 && !result.fromTask && !result.toTask) {
    throw new Error('task requires a task list or --from/--to range');
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
    const statusMatch = body.match(/^(?:[-*+]\s+)?\*\*Status:\*\*\s*(Not Started|In Progress|Complete|Blocked)\s*$/mi);
    const blockedMatch = body.match(/^(?:[-*+]\s+)?\*\*Blocked by:\*\*\s*(.+?)\s*$/mi);
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

function createContainedDirectory(parent, child, label) {
  const parentStat = fs.lstatSync(parent);
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) {
    throw new Error(`${label} parent is not a real directory: ${parent}`);
  }
  const relative = path.relative(parent, child);
  if (!isContained(parent, child)) throw new Error(`${label} is outside ${parent}`);
  let current = parent;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`${label} contains a non-directory or symlink: ${current}`);
      }
    } else {
      try {
        fs.mkdirSync(current, { mode: 0o700 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const stat = fs.lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new Error(`${label} contains a non-directory or symlink: ${current}`);
        }
      }
    }
  }
}

function waitForLease(dependencies) {
  const wait = dependencies.wait || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });
  wait(1_000);
}

function waitForLeaseMutation(dependencies, milliseconds = 10) {
  const wait = dependencies.mutationWait || dependencies.wait || ((milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });
  wait(milliseconds);
}

function processStartIdentity(pid, dependencies = {}) {
  if (dependencies.processStartIdentity) return dependencies.processStartIdentity(pid);
  const procStat = `/proc/${pid}/stat`;
  try {
    const fields = fs.readFileSync(procStat, 'utf8').trim().split(/\s+/);
    if (fields.length > 21 && /^\d+$/.test(fields[21])) return `proc:${fields[21]}`;
  } catch (error) {
    if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
  }
  try {
    const value = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return value || null;
  } catch {
    try {
      process.kill(pid, 0);
      return `pid:${pid}`;
    } catch (error) {
      if (error.code === 'EPERM') return `pid:${pid}`;
      if (error.code === 'ESRCH') return null;
      throw error;
    }
  }
}

function validLeaseText(value, maximum = 128) {
  return typeof value === 'string' && value.length <= maximum && !/[\x00-\x1f\x7f]/.test(value);
}

function normalizeLeaseOwner(owner) {
  const project = String(owner.project || '.');
  const projectPath = String(owner.projectPath || '.');
  const taskId = String(owner.taskId || '');
  if (!validLeaseText(project) || !project || !/^[A-Za-z0-9._-]+$/.test(project)) {
    throw new Error('Repository lease project is invalid');
  }
  if (!validLeaseText(projectPath, 512) || path.isAbsolute(projectPath)
      || projectPath.split(/[\\/]/).includes('..')) {
    throw new Error('Repository lease project path is invalid');
  }
  if (taskId !== 'setup' && !TASK_ID.test(taskId)) {
    throw new Error('Repository lease task identifier is invalid');
  }
  return { project, projectPath: projectPath || '.', taskId };
}

function inspectLease(leasePath, dependencies = {}, expectedToken = null) {
  if (dependencies.beforeLeaseInspect) dependencies.beforeLeaseInspect(leasePath);
  let fd;
  let holder;
  try {
    fd = fs.openSync(leasePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 4_096) {
      throw new Error(`Repository lease is unsafe: ${leasePath}`);
    }
    try {
      holder = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch {
      throw new Error(`Repository lease is invalid: ${leasePath}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ELOOP') throw new Error(`Repository lease is unsafe: ${leasePath}`);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  if (holder && holder.projectPath === undefined) holder.projectPath = '.';
  if (!holder || holder.version !== 1 || !Number.isInteger(holder.pid) || holder.pid < 1
      || typeof holder.token !== 'string' || !/^[0-9a-f]{48}$/.test(holder.token)
      || !validLeaseText(holder.project) || !holder.project
      || !/^[A-Za-z0-9._-]+$/.test(holder.project)
      || !validLeaseText(holder.projectPath, 512) || path.isAbsolute(holder.projectPath)
      || holder.projectPath.split(/[\\/]/).includes('..')
      || (holder.taskId !== 'setup' && !TASK_ID.test(holder.taskId))
      || !Number.isFinite(holder.startedAt) || holder.startedAt <= 0
      || holder.startedAt > (dependencies.now || Date.now)() + 300_000
      || (expectedToken && holder.token !== expectedToken)) {
    throw new Error(`Repository lease has invalid ownership: ${leasePath}`);
  }
  const currentIdentity = processStartIdentity(holder.pid, dependencies);
  const live = typeof holder.processStart === 'string'
    && holder.processStart.length > 0
    && holder.processStart.length <= 256
    && holder.processStart === currentIdentity;
  return { holder, live };
}

function sameLeaseIdentity(left, right) {
  return Boolean(left && right
    && left.version === right.version
    && left.pid === right.pid
    && left.processStart === right.processStart
    && left.token === right.token
    && left.project === right.project
    && left.projectPath === right.projectPath
    && left.taskId === right.taskId
    && left.startedAt === right.startedAt);
}

function fsyncDirectory(directory, dependencies = {}, finalPath = null) {
  let fd;
  try {
    if (dependencies.beforeLeaseDirectorySync) {
      dependencies.beforeLeaseDirectorySync(finalPath, directory);
    }
    fd = fs.openSync(directory, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } catch (error) {
    if (!['EINVAL', 'ENOTSUP', 'EISDIR'].includes(error.code)) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function publishRecordAtomically(finalPath, record, dependencies = {}, notify = false) {
  const stagingPath = path.join(
    path.dirname(finalPath),
    `.staging-${record.token}-${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let fd;
  let published = false;
  try {
    fd = fs.openSync(stagingPath, 'wx', 0o600);
    if (notify && dependencies.afterLeaseStagingCreate) {
      dependencies.afterLeaseStagingCreate(finalPath, stagingPath, fd);
    }
    fs.writeFileSync(fd, `${JSON.stringify(record)}\n`, 'utf8');
    if (notify && dependencies.afterLeaseStagingWrite) {
      dependencies.afterLeaseStagingWrite(finalPath, stagingPath, fd);
    }
    fs.fsyncSync(fd);
    if (notify && dependencies.afterLeaseStagingSync) {
      dependencies.afterLeaseStagingSync(finalPath, stagingPath, fd);
    }
    fs.closeSync(fd);
    fd = undefined;
    if (notify && dependencies.beforeLeasePublish) {
      dependencies.beforeLeasePublish(finalPath, stagingPath);
    }
    fs.linkSync(stagingPath, finalPath);
    published = true;
    fsyncDirectory(path.dirname(finalPath), dependencies, finalPath);
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    if (published) {
      try { fs.unlinkSync(finalPath); } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') throw cleanupError;
      }
    }
    try { fs.unlinkSync(stagingPath); } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') throw cleanupError;
    }
    throw error;
  }
  try {
    fs.unlinkSync(stagingPath);
    fsyncDirectory(path.dirname(finalPath), dependencies, finalPath);
  } catch (error) {
    // The final hard link is durable and owned by the caller.  Do not turn a
    // recoverable staging cleanup failure into an acquisition without a release handle.
    if (error.code !== 'ENOENT' && dependencies.onLeaseStagingCleanupError) {
      try { dependencies.onLeaseStagingCleanupError(finalPath, stagingPath, error); } catch {}
    }
  }
  return record;
}

function inspectMutationEntry(entryPath) {
  let fd;
  let entry;
  try {
    fd = fs.openSync(entryPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 4_096) {
      throw new Error(`Repository lease mutation entry is unsafe: ${entryPath}`);
    }
    entry = JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ELOOP') {
      throw new Error(`Repository lease mutation entry is unsafe: ${entryPath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Repository lease mutation entry is invalid: ${entryPath}`);
    }
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  const expectedToken = path.basename(entryPath, '.lock');
  if (!entry || entry.version !== 1 || !Number.isInteger(entry.pid) || entry.pid < 1
      || entry.token !== expectedToken || !/^[0-9a-f]{48}$/.test(entry.token)
      || !Number.isInteger(entry.ticket) || entry.ticket < 0
      || typeof entry.processStart !== 'string' || !entry.processStart
      || entry.processStart.length > 256) {
    throw new Error(`Repository lease mutation entry has invalid ownership: ${entryPath}`);
  }
  return entry;
}

function reclaimStaleStagingEntries(directory, dependencies = {}) {
  const reclaimAfter = dependencies.stagingReclaimMs === undefined
    ? 5 * 60 * 1000
    : dependencies.stagingReclaimMs;
  const now = dependencies.now || Date.now;
  for (const name of fs.readdirSync(directory)) {
    const match = /^\.staging-([0-9a-f]{48})-[0-9a-f]{16}\.tmp$/.exec(name);
    if (!match) continue;
    const file = path.join(directory, name);
    let initial;
    try {
      initial = fs.lstatSync(file);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (initial.isSymbolicLink() || !initial.isFile()) {
      throw new Error(`Repository lease staging record is unsafe: ${file}`);
    }
    let stale = false;
    try {
      const current = inspectLease(file, dependencies, match[1]);
      stale = Boolean(current && !current.live);
    } catch {
      stale = now() - initial.mtimeMs >= reclaimAfter;
    }
    if (!stale) continue;
    try {
      const current = fs.lstatSync(file);
      if (current.isSymbolicLink() || !current.isFile()
          || current.ino !== initial.ino || current.size !== initial.size
          || current.mtimeMs !== initial.mtimeMs) continue;
      fs.unlinkSync(file);
      fsyncDirectory(directory, dependencies, file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function mutationEntries(directory) {
  const entries = [];
  for (const name of fs.readdirSync(directory)) {
    if (name.startsWith('.staging-')) continue;
    if (!/^[0-9a-f]{48}\.lock$/.test(name)) {
      throw new Error(`Repository lease mutation filename is invalid: ${path.join(directory, name)}`);
    }
    const file = path.join(directory, name);
    const entry = inspectMutationEntry(file);
    if (entry) entries.push({ file, ...entry });
  }
  return entries;
}

function waitForMutationEntry(entryPath, localProcessStart, dependencies = {}) {
  let retryDelay = 10;
  for (;;) {
    const current = inspectMutationEntry(entryPath);
    if (!current) return;
    const localOwner = current.pid === process.pid && current.processStart === localProcessStart;
    const live = localOwner || processStartIdentity(current.pid, dependencies) === current.processStart;
    if (!live) {
      try { fs.unlinkSync(entryPath); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      return;
    }
    waitForLeaseMutation(dependencies, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 250);
  }
}

function acquireLeaseMutation(mutationRoot, dependencies = {}) {
  const mutationDirectory = path.join(mutationRoot, '.lease-mutation');
  const choosingDirectory = path.join(mutationDirectory, 'choosing');
  const ticketsDirectory = path.join(mutationDirectory, 'tickets');
  createContainedDirectory(path.dirname(mutationRoot), choosingDirectory, 'Repository lease mutation directory');
  createContainedDirectory(path.dirname(mutationRoot), ticketsDirectory, 'Repository lease mutation directory');
  const token = crypto.randomBytes(24).toString('hex');
  const processStart = processStartIdentity(process.pid, dependencies);
  if (!processStart) throw new Error('Cannot identify the runner process instance');
  const baseRecord = {
    version: 1,
    pid: process.pid,
    processStart,
    token,
    startedAt: (dependencies.now || Date.now)(),
  };
  const choosingPath = path.join(choosingDirectory, `${token}.lock`);
  const ticketPath = path.join(ticketsDirectory, `${token}.lock`);
  let ticketPublished = false;
  try {
    publishRecordAtomically(choosingPath, { ...baseRecord, ticket: 0 }, dependencies);
    reclaimStaleStagingEntries(choosingDirectory, dependencies);
    reclaimStaleStagingEntries(ticketsDirectory, dependencies);
    const currentTickets = mutationEntries(ticketsDirectory);
    const ticket = currentTickets.reduce((maximum, entry) => Math.max(maximum, entry.ticket), 0) + 1;
    publishRecordAtomically(ticketPath, { ...baseRecord, ticket }, dependencies);
    ticketPublished = true;
    fs.unlinkSync(choosingPath);

    const choosing = mutationEntries(choosingDirectory)
      .filter((entry) => entry.token !== token);
    for (const contender of choosing) {
      waitForMutationEntry(contender.file, processStart, dependencies);
    }

    const predecessors = mutationEntries(ticketsDirectory)
      .filter((entry) => entry.token !== token
        && (entry.ticket < ticket || (entry.ticket === ticket && entry.token < token)))
      .sort((left, right) => right.ticket - left.ticket || right.token.localeCompare(left.token));
    for (const predecessor of predecessors) {
      waitForMutationEntry(predecessor.file, processStart, dependencies);
    }
    return () => {
      try {
        fs.unlinkSync(ticketPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    };
  } catch (error) {
    let cleanupError = null;
    try { fs.unlinkSync(choosingPath); } catch (currentError) {
      if (currentError.code !== 'ENOENT') cleanupError = currentError;
    }
    if (ticketPublished) {
      try { fs.unlinkSync(ticketPath); } catch (currentError) {
        if (currentError.code !== 'ENOENT' && !cleanupError) cleanupError = currentError;
      }
    }
    if (cleanupError) throw cleanupError;
    throw error;
  }
}

function removeLeaseIfIdentity(leasePath, expected, dependencies = {}) {
  const current = inspectLease(leasePath, dependencies);
  if (!current || !sameLeaseIdentity(current.holder, expected)) return false;
  if (dependencies.beforeLeaseRemove) dependencies.beforeLeaseRemove(leasePath, expected);
  try {
    fs.unlinkSync(leasePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

function acquireLegacyRecoveryLease(recoveryPath, dependencies = {}) {
  const token = crypto.randomBytes(24).toString('hex');
  const processStart = processStartIdentity(process.pid, dependencies);
  if (!processStart) throw new Error('Cannot identify the runner process instance');
  const record = {
    version: 1,
    pid: process.pid,
    processStart,
    token,
    project: 'recovery',
    projectPath: '.',
    taskId: 'setup',
    startedAt: (dependencies.now || Date.now)(),
  };
  for (;;) {
    if (dependencies.beforeLegacyRecoveryPublish) {
      dependencies.beforeLegacyRecoveryPublish(recoveryPath);
    }
    try {
      publishRecordAtomically(recoveryPath, record, dependencies);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const current = inspectLease(recoveryPath, dependencies);
    if (!current) continue;
    if (current.live) return null;
    throw new Error('Cannot safely reclaim while a stale legacy recovery record exists; wait for legacy runners to drain or remove it manually');
  }
  return () => {
    const current = inspectLease(recoveryPath, dependencies);
    if (!current || !sameLeaseIdentity(current.holder, record)) {
      throw new Error('Repository recovery lease ownership changed before release');
    }
    if (!removeLeaseIfIdentity(recoveryPath, record, dependencies)) {
      throw new Error('Repository recovery lease disappeared before release');
    }
  };
}

function reclaimStaleLease(leasePath, expected, dependencies = {}) {
  const mutationRoot = dependencies.mutationRoot || path.dirname(leasePath);
  for (;;) {
    const releaseMutation = acquireLeaseMutation(mutationRoot, dependencies);
    let releaseRecovery;
    let result;
    try {
      const legacyRecoveryPath = path.join(mutationRoot, '.reclaim.lock');
      releaseRecovery = acquireLegacyRecoveryLease(legacyRecoveryPath, dependencies);
      if (releaseRecovery) {
        const inspected = inspectLease(leasePath, dependencies);
        if (!inspected) result = true;
        else if (!sameLeaseIdentity(inspected.holder, expected) || inspected.live) result = false;
        else result = removeLeaseIfIdentity(leasePath, expected, dependencies);
      }
    } finally {
      try {
        if (releaseRecovery) releaseRecovery();
      } finally {
        releaseMutation();
      }
    }
    if (releaseRecovery) return result;
    waitForLeaseMutation(dependencies);
  }
}

function readLiveLease(leasePath, dependencies = {}, expectedToken = null) {
  const inspected = inspectLease(leasePath, dependencies, expectedToken);
  if (!inspected) return null;
  if (inspected.live) return inspected.holder;
  reclaimStaleLease(leasePath, inspected.holder, dependencies);
  return null;
}

function createOwnedLease(leasePath, owner, dependencies = {}, requestedToken = null) {
  const now = dependencies.now || Date.now;
  const token = requestedToken || crypto.randomBytes(24).toString('hex');
  const normalizedOwner = normalizeLeaseOwner(owner);
  const processStart = processStartIdentity(process.pid, dependencies);
  if (!processStart) throw new Error('Cannot identify the runner process instance');
  const record = {
    version: 1,
    pid: process.pid,
    processStart,
    token,
    ...normalizedOwner,
    startedAt: now(),
  };
  const mutationRoot = dependencies.mutationRoot || path.dirname(leasePath);
  const releaseMutation = acquireLeaseMutation(mutationRoot, dependencies);
  try {
    publishRecordAtomically(leasePath, record, dependencies, true);
  } finally {
    releaseMutation();
  }
  return () => {
    const releaseRemoval = acquireLeaseMutation(mutationRoot, dependencies);
    try {
      const current = inspectLease(leasePath, dependencies);
      if (!current || !sameLeaseIdentity(current.holder, record)) {
        throw new Error('Repository lease ownership changed before release');
      }
      if (!removeLeaseIfIdentity(leasePath, record, dependencies)) {
        throw new Error('Repository lease disappeared before release');
      }
    } finally {
      releaseRemoval();
    }
  };
}

function acquireProjectLease(commonDir, owner, dependencies = {}) {
  const log = dependencies.log || console.log;
  const now = dependencies.now || Date.now;
  const project = String(owner.project || '.');
  const projectKey = crypto.createHash('sha256').update(project).digest('hex').slice(0, 32);
  const directory = path.join(commonDir, 'groundwork', 'projects');
  const leasePath = path.join(directory, `${projectKey}.lock`);
  const leaseDependencies = { ...dependencies, mutationRoot: directory };
  let lastProgressAt = -Infinity;
  createContainedDirectory(commonDir, directory, 'Project lease directory');
  for (;;) {
    try {
      return createOwnedLease(leasePath, owner, leaseDependencies);
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const holder = readLiveLease(leasePath, leaseDependencies);
    if (!holder) continue;
    const current = now();
    if (current - lastProgressAt >= (dependencies.heartbeatMs || 30_000)) {
      log(`[${formatLocalTimestamp(current)}] waiting for project ${project} task lease — ${holder.taskId || 'unknown'} (pid ${holder.pid})`);
      lastProgressAt = current;
    }
    waitForLease(dependencies);
  }
}

function liveLeaseFiles(directory, dependencies = {}, expectedName = null) {
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Repository gate is unsafe: ${directory}`);
  const entries = [];
  if (dependencies.beforeLeaseDirectoryScan) dependencies.beforeLeaseDirectoryScan(directory);
  reclaimStaleStagingEntries(directory, dependencies);
  for (const name of fs.readdirSync(directory)) {
    if (name === '.reclaim.lock' || name.startsWith('.staging-')) continue;
    if (!/^[0-9a-f]{48}\.lock$/.test(name)) {
      throw new Error(`Repository lease filename is invalid: ${path.join(directory, name)}`);
    }
    const file = path.join(directory, name);
    const token = name.slice(0, -'.lock'.length);
    const holder = readLiveLease(file, dependencies, expectedName === 'token' ? token : null);
    if (holder) entries.push({ file, holder });
  }
  return entries;
}

function readPeerCheckpoint(checkpointFile) {
  let fd;
  try {
    fd = fs.openSync(checkpointFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_CHECKPOINT_BYTES) {
      throw new Error(`Runner checkpoint is invalid: ${checkpointFile}`);
    }
    try {
      return JSON.parse(fs.readFileSync(fd, 'utf8'));
    } catch {
      throw new Error(`Runner checkpoint is not valid JSON: ${checkpointFile}`);
    }
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'ELOOP') throw new Error(`Runner checkpoint is invalid: ${checkpointFile}`);
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function activeProjectOwners(commonDir, repoRoot, dependencies = {}) {
  const directory = path.join(commonDir, 'groundwork', 'projects');
  if (!fs.existsSync(directory)) return [];
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Project lease directory is unsafe: ${directory}`);
  }
  const owners = [];
  reclaimStaleStagingEntries(directory, dependencies);
  const worktrees = (dependencies.registeredWorktrees || registeredWorktrees)(repoRoot);
  const registeredByPath = new Map(worktrees.map((entry) => [entry.path, entry]));
  for (const name of fs.readdirSync(directory)) {
    if (name === '.reclaim.lock' || name === '.lease-mutation' || name.startsWith('.staging-')) continue;
    if (!/^[0-9a-f]{32}\.lock$/.test(name)) {
      throw new Error(`Project lease filename is invalid: ${path.join(directory, name)}`);
    }
    const file = path.join(directory, name);
    const holder = readLiveLease(file, dependencies);
    if (!holder) continue;
    const expected = `${crypto.createHash('sha256').update(holder.project).digest('hex').slice(0, 32)}.lock`;
    if (name !== expected) throw new Error(`Project lease filename does not match its owner: ${file}`);
    const projectKey = crypto.createHash('sha256').update(holder.projectPath).digest('hex').slice(0, 16);
    const checkpointFile = path.join(commonDir, 'groundwork', 'runner', projectKey, `${holder.taskId}.json`);
    const checkpoint = readPeerCheckpoint(checkpointFile);
    if (!checkpoint || checkpoint.taskId !== holder.taskId || checkpoint.project !== holder.projectPath
        || !checkpoint.workspace || typeof checkpoint.workspace.branch !== 'string'
        || typeof checkpoint.workspace.worktreePath !== 'string') continue;
    const candidates = [{
      branch: `task/${holder.taskId}`,
      worktreePath: path.join(repoRoot, '.worktrees', holder.taskId),
    }];
    if (holder.project !== '.') {
      candidates.push({
        branch: `task/${holder.project}/${holder.taskId}`,
        worktreePath: path.join(repoRoot, '.worktrees', `${holder.project}-${holder.taskId}`),
      });
    }
    if (!candidates.some((candidate) => candidate.branch === checkpoint.workspace.branch
        && candidate.worktreePath === checkpoint.workspace.worktreePath)) continue;
    let peerWorktree;
    try {
      peerWorktree = fs.realpathSync(checkpoint.workspace.worktreePath);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const registered = registeredByPath.get(peerWorktree);
    if (!registered || registered.branch !== `refs/heads/${checkpoint.workspace.branch}`) continue;
    owners.push({ ...holder, branch: checkpoint.workspace.branch });
  }
  return owners;
}

function acquireRepositoryGate(commonDir, mode, owner, dependencies = {}) {
  if (!['read', 'write'].includes(mode)) throw new Error(`Invalid repository gate mode: ${mode}`);
  const log = dependencies.log || console.log;
  const now = dependencies.now || Date.now;
  const root = path.join(commonDir, 'groundwork', 'repository-gate');
  const readers = path.join(root, 'readers');
  const waitingWriters = path.join(root, 'writers-waiting');
  const writer = path.join(root, 'writer.lock');
  const token = crypto.randomBytes(24).toString('hex');
  const readerPath = path.join(readers, `${token}.lock`);
  const leaseDependencies = { ...dependencies, mutationRoot: root };
  let lastProgressAt = -Infinity;
  createContainedDirectory(commonDir, readers, 'Runner checkpoint and repository gate directory');
  createContainedDirectory(commonDir, waitingWriters, 'Runner checkpoint and repository gate directory');

  function report(kind, holder) {
    const current = now();
    if (current - lastProgressAt < (dependencies.heartbeatMs || 30_000)) return;
    log(`[${formatLocalTimestamp(current)}] waiting for repository ${kind} gate — ${holder.project || 'unknown'} ${holder.taskId || ''} (pid ${holder.pid})`);
    lastProgressAt = current;
  }

  if (mode === 'read') {
    for (;;) {
      const queued = liveLeaseFiles(waitingWriters, leaseDependencies, 'token');
      if (queued.length) { report('writer', queued[0].holder); waitForLease(dependencies); continue; }
      if (fs.existsSync(writer)) {
        const holder = readLiveLease(writer, leaseDependencies);
        if (holder) { report('writer', holder); waitForLease(dependencies); continue; }
      }
      let release;
      try {
        release = createOwnedLease(readerPath, owner, leaseDependencies, token);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        continue;
      }
      try {
        if (!readLiveLease(writer, leaseDependencies)
            && liveLeaseFiles(waitingWriters, leaseDependencies, 'token').length === 0) return release;
      } catch (error) {
        try { release(); } catch {}
        throw error;
      }
      release();
    }
  }

  const writerIntent = path.join(waitingWriters, `${token}.lock`);
  const releaseIntent = createOwnedLease(writerIntent, owner, leaseDependencies, token);
  try {
    for (;;) {
      let releaseWriter;
      try {
        releaseWriter = createOwnedLease(writer, owner, leaseDependencies);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const holder = readLiveLease(writer, leaseDependencies);
        if (holder) report('writer', holder);
        waitForLease(dependencies);
        continue;
      }
      try {
        for (;;) {
          const activeReaders = liveLeaseFiles(readers, leaseDependencies, 'token');
          if (activeReaders.length === 0) {
            releaseIntent();
            return releaseWriter;
          }
          report('readers', activeReaders[0].holder);
          waitForLease(dependencies);
        }
      } catch (error) {
        try { releaseWriter(); } catch {}
        throw error;
      }
    }
  } catch (error) {
    try { releaseIntent(); } catch {}
    throw error;
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

function readLocalHooksPaths(repoRoot) {
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
  delete env.GIT_DIR;
  delete env.GIT_WORK_TREE;
  const result = spawnSync(
    'git',
    ['config', '--local', '--no-includes', '--null', '--get-all', 'core.hooksPath'],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }
  );
  if (result.error) throw result.error;
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error((result.stderr || '').trim() || `git config exited with status ${result.status}`);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function restoreTransientTaskHooksPath(repoRoot, input, expected) {
  const current = readLocalHooksPaths(repoRoot);
  if (current.length === expected.length
      && current.every((value, index) => value === expected[index])) return false;
  if (input.phase === 'plan' || expected.length > 1 || current.length !== 1) return false;

  const taskWorktree = input.worktreePath;
  const hooksPath = current[0];
  if (!path.isAbsolute(hooksPath) || !fs.existsSync(hooksPath)) return false;
  try {
    const canonicalHooksPath = fs.realpathSync(hooksPath);
    if (!isContained(taskWorktree, canonicalHooksPath)) return false;
    assertNoSymlinkComponents(taskWorktree, canonicalHooksPath, 'Transient task hooksPath');
    if (!fs.lstatSync(canonicalHooksPath).isDirectory()) return false;
  } catch {
    return false;
  }

  if (expected.length === 0) {
    execGit(repoRoot, ['config', '--local', '--unset-all', 'core.hooksPath']);
  } else {
    execGit(repoRoot, ['config', '--local', '--replace-all', 'core.hooksPath', expected[0]]);
  }
  const restored = readLocalHooksPaths(repoRoot);
  if (restored.length !== expected.length
      || restored.some((value, index) => value !== expected[index])) {
    throw new Error('Failed to restore the pre-phase core.hooksPath');
  }
  return true;
}

function relocateTaskHooksPathBeforeCleanup(repoRoot, worktreePath) {
  const current = readLocalHooksPaths(repoRoot);
  if (current.length !== 1 || !path.isAbsolute(current[0]) || !fs.existsSync(current[0])) return false;

  const canonicalWorktree = fs.realpathSync(worktreePath);
  const canonicalHooksPath = fs.realpathSync(current[0]);
  if (!isContained(canonicalWorktree, canonicalHooksPath)) return false;
  const relative = path.relative(canonicalWorktree, canonicalHooksPath);
  if (!relative) return false;

  const primaryHooksPath = path.join(repoRoot, relative);
  if (!fs.existsSync(primaryHooksPath)) {
    throw new Error(`Cannot remove task worktree while core.hooksPath points inside it: ${current[0]}`);
  }
  assertNoSymlinkComponents(repoRoot, primaryHooksPath, 'Primary hooksPath replacement');
  if (!fs.lstatSync(primaryHooksPath).isDirectory()) {
    throw new Error(`Primary hooksPath replacement is not a directory: ${primaryHooksPath}`);
  }
  execGit(repoRoot, ['config', '--local', '--replace-all', 'core.hooksPath', primaryHooksPath]);
  return true;
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

function refSnapshotMap(snapshot) {
  return new Map(snapshot.split('\n').filter(Boolean).map((entry) => {
    const separator = entry.indexOf('\0');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
}

function allowedPeerTaskRefs(peerOwners) {
  const refs = new Set();
  for (const owner of peerOwners) {
    if (!TASK_ID.test(owner.taskId) || typeof owner.branch !== 'string') continue;
    refs.add(`refs/heads/${owner.branch}`);
  }
  return refs;
}

function assertRepositoryTransition(repoRoot, before, input, peerOwners = []) {
  const afterRefs = snapshotRepositoryRefs(repoRoot);
  const afterWorktrees = snapshotWorktreeRegistry(repoRoot);
  const allowedRefs = allowedPeerTaskRefs(peerOwners);
  if (input.phase !== 'plan') allowedRefs.add(`refs/heads/${input.branch}`);
  const beforeRefs = refSnapshotMap(before.refs);
  const currentRefs = refSnapshotMap(afterRefs);
  const changedRefs = new Set([...beforeRefs.keys(), ...currentRefs.keys()]);
  for (const ref of changedRefs) {
    if (beforeRefs.get(ref) !== currentRefs.get(ref) && !allowedRefs.has(ref)) {
      const taskLabel = ref.startsWith('refs/heads/task/') ? 'inactive task branch' : 'repository refs';
      throw new Error(`${taskLabel} changed during ${input.phase}: ${ref}`);
    }
  }
  if (before.worktrees !== afterWorktrees) {
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

function snapshotRunnerState(commonDir) {
  const root = path.join(commonDir, 'groundwork', 'runner');
  if (!fs.existsSync(root)) return 'missing';
  const hash = crypto.createHash('sha256');
  let totalBytes = 0;
  function add(absolute, relative) {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Runner checkpoint path must not be a symlink: ${absolute}`);
    hash.update(`${relative}\0${stat.mode}\0`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) {
        add(path.join(absolute, entry), path.join(relative, entry));
      }
    } else if (stat.isFile()) {
      totalBytes += stat.size;
      if (stat.size > MAX_CHECKPOINT_BYTES || totalBytes > MAX_CHECKPOINT_BYTES * 100) {
        throw new Error('Runner checkpoint state exceeds its size limit');
      }
      hash.update(fs.readFileSync(absolute));
    } else {
      throw new Error(`Runner checkpoint path is not a regular file or directory: ${absolute}`);
    }
  }
  add(root, '.');
  return hash.digest('hex');
}

function assertRunnerState(commonDir, expected) {
  if (snapshotRunnerState(commonDir) !== expected) {
    throw new Error('Runner checkpoint state changed during a model phase');
  }
}

function snapshotTaskRunnerState(commonDir, repoRoot, projectRoot, taskId) {
  const location = checkpointPath(commonDir, repoRoot, projectRoot, taskId);
  if (!fs.existsSync(location.file)) return 'missing';
  assertNoSymlinkComponents(commonDir, location.file, 'Runner checkpoint');
  const stat = fs.lstatSync(location.file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CHECKPOINT_BYTES) {
    throw new Error(`Runner checkpoint is invalid: ${location.file}`);
  }
  return crypto.createHash('sha256').update(fs.readFileSync(location.file)).digest('hex');
}

function assertTaskRunnerState(commonDir, repoRoot, projectRoot, taskId, expected) {
  if (snapshotTaskRunnerState(commonDir, repoRoot, projectRoot, taskId) !== expected) {
    throw new Error('Runner checkpoint state changed during a model phase');
  }
}

function snapshotRunnerFiles(commonDir) {
  const root = path.join(commonDir, 'groundwork', 'runner');
  const files = new Map();
  if (!fs.existsSync(root)) return files;
  let totalBytes = 0;
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop();
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Runner checkpoint path is unsafe: ${directory}`);
    }
    for (const entry of fs.readdirSync(directory)) {
      const absolute = path.join(directory, entry);
      const entryStat = fs.lstatSync(absolute);
      if (entryStat.isSymbolicLink()) {
        throw new Error(`Runner checkpoint path must not be a symlink: ${absolute}`);
      }
      if (entryStat.isDirectory()) {
        stack.push(absolute);
        continue;
      }
      if (!entryStat.isFile() || entryStat.size > MAX_CHECKPOINT_BYTES) {
        throw new Error(`Runner checkpoint is invalid: ${absolute}`);
      }
      totalBytes += entryStat.size;
      if (totalBytes > MAX_CHECKPOINT_BYTES * 100) {
        throw new Error('Runner checkpoint state exceeds its size limit');
      }
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      files.set(relative, crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex'));
    }
  }
  return files;
}

function peerCheckpointPaths(peerOwners) {
  return new Set(peerOwners.filter((owner) => TASK_ID.test(owner.taskId)).map((owner) => {
    const projectKey = crypto.createHash('sha256').update(owner.projectPath || '.').digest('hex').slice(0, 16);
    return `${projectKey}/${owner.taskId}.json`;
  }));
}

function assertRunnerTransition(before, after, peerOwners) {
  const allowed = peerCheckpointPaths(peerOwners);
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const relative of paths) {
    if (!allowed.has(relative) && before.get(relative) !== after.get(relative)) {
      throw new Error(`Inactive task checkpoint state changed during a model phase: ${relative}`);
    }
  }
}

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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CHECKPOINT_BYTES) {
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
  createContainedDirectory(commonDir, directory, 'Runner checkpoint directory');
  if (fs.existsSync(location.file) && fs.lstatSync(location.file).isSymbolicLink()) {
    throw new Error(`Runner checkpoint must not be a symlink: ${location.file}`);
  }
  const temp = path.join(directory, `.${checkpoint.taskId}.${process.pid}.${Date.now()}.tmp`);
  const fd = fs.openSync(temp, 'wx', 0o600);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(checkpoint)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, location.file);
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

function snapshotUnrelatedWorktrees(repoRoot, projectRoot, taskWorktree) {
  const records = registeredWorktrees(repoRoot);
  const registeredPaths = new Set(records.map((entry) => entry.path));
  const projectRelative = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
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
      if (projectRelative) {
        assertPathspecClean(entry.path, projectRelative, `Selected project in unrelated worktree ${entry.path}`);
      } else {
        assertClean(entry.path, `Unrelated worktree ${entry.path}`);
      }
      return entry.path;
    })
    .join('\n');
}

function legacyWorkspaceOwner(commonDir, taskId, legacyBranch, legacyWorktree) {
  const root = path.join(commonDir, 'groundwork', 'runner');
  if (!fs.existsSync(root)) return null;
  const owners = new Set();
  for (const namespace of fs.readdirSync(root)) {
    const file = path.join(root, namespace, `${taskId}.json`);
    if (!fs.existsSync(file)) continue;
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_CHECKPOINT_BYTES) {
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

function forEachFileLine(filePath, visit) {
  const fd = fs.openSync(filePath, 'r');
  const decoder = new StringDecoder('utf8');
  const chunk = Buffer.allocUnsafe(64 * 1024);
  let pending = '';
  try {
    let bytesRead;
    while ((bytesRead = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      pending += decoder.write(chunk.subarray(0, bytesRead));
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        visit(pending.slice(0, newline).replace(/\r$/, ''));
        pending = pending.slice(newline + 1);
      }
    }
    pending += decoder.end();
    if (pending) visit(pending.replace(/\r$/, ''));
  } finally {
    fs.closeSync(fd);
  }
}

function readClaudeResult(outputPath) {
  let result = null;
  forEachFileLine(outputPath, (line) => {
    try {
      const event = JSON.parse(line);
      if (event && event.type === 'result' && typeof event.result === 'string') result = event.result;
    } catch {}
  });
  if (result === null) throw new Error('Claude stream did not contain a final result');
  return result;
}

function readFileTail(filePath, maxBytes = MAX_DIAGNOSTIC_BYTES) {
  const stat = fs.statSync(filePath);
  if (stat.size === 0) return '';
  const length = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(length);
  try {
    fs.readSync(fd, buffer, 0, length, stat.size - length);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf8');
}

function startProgressMonitor(input, outputPath, startedAt) {
  const progressFd = input.progressFd === undefined ? 1 : input.progressFd;
  if (progressFd === null) return null;
  const heartbeatMs = input.heartbeatMs || DEFAULT_HEARTBEAT_MS;
  const shared = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
  const source = `
'use strict';
const fs = require('fs');
const { StringDecoder } = require('string_decoder');
const { workerData } = require('worker_threads');
const formatElapsed = ${formatElapsed.toString()};
const formatLocalTimestamp = ${formatLocalTimestamp.toString()};
const normalizeActivity = ${normalizeActivity.toString()};
const shared = new Int32Array(workerData.shared);
const decoder = new StringDecoder('utf8');
const state = {};
const fd = fs.openSync(workerData.outputPath, 'r');
let offset = 0;
let pending = '';
let lastHeartbeat = workerData.startedAt;
let writable = true;

function emit(message) {
  if (!writable) return;
  const elapsed = formatElapsed(Date.now() - workerData.startedAt);
  try {
    fs.writeSync(workerData.progressFd, '[' + formatLocalTimestamp(Date.now()) + '] [' + workerData.taskId + ' ' + workerData.phase + ' ' + elapsed + '] ' + message + '\\n');
  } catch {
    writable = false;
  }
}

function visit(line) {
  try {
    const message = normalizeActivity(workerData.harness, JSON.parse(line), state);
    if (message) emit(message);
  } catch {}
}

function drain(final) {
  const size = fs.fstatSync(fd).size;
  const chunk = Buffer.allocUnsafe(64 * 1024);
  while (offset < size) {
    const length = Math.min(chunk.length, size - offset);
    const bytesRead = fs.readSync(fd, chunk, 0, length, offset);
    if (!bytesRead) break;
    offset += bytesRead;
    pending += decoder.write(chunk.subarray(0, bytesRead));
    let newline;
    while ((newline = pending.indexOf('\\n')) !== -1) {
      visit(pending.slice(0, newline).replace(/\\r$/, ''));
      pending = pending.slice(newline + 1);
    }
  }
  if (final) {
    pending += decoder.end();
    if (pending) visit(pending.replace(/\\r$/, ''));
    pending = '';
  }
}

const interval = setInterval(() => {
  const done = Atomics.load(shared, 0) === 1;
  drain(done);
  const now = Date.now();
  if (now - lastHeartbeat >= workerData.heartbeatMs) {
    emit(workerData.harnessLabel + ' still running');
    lastHeartbeat = now;
  }
  if (done) {
    clearInterval(interval);
    fs.closeSync(fd);
    Atomics.store(shared, 1, 1);
    Atomics.notify(shared, 1);
  }
}, Math.max(10, Math.min(250, workerData.heartbeatMs)));
`;
  const worker = new Worker(source, {
    eval: true,
    workerData: {
      shared: shared.buffer,
      outputPath,
      startedAt,
      heartbeatMs,
      progressFd,
      taskId: input.taskId || 'task',
      phase: input.phase || 'phase',
      harness: input.harness,
      harnessLabel: input.harness === 'claude' ? 'Claude Code' : 'Codex',
    },
  });
  worker.on('error', () => {});
  worker.unref();
  return { worker, shared };
}

function stopProgressMonitor(monitor) {
  if (!monitor) return;
  Atomics.store(monitor.shared, 0, 1);
  Atomics.notify(monitor.shared, 0);
  const result = Atomics.wait(monitor.shared, 1, 0, 2_000);
  if (result === 'timed-out') monitor.worker.terminate();
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
        '--output-format', 'stream-json',
        '--verbose',
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
        '--cd', cwd,
        '--json',
        '--color', 'never',
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'groundwork-phase-'));
  const resultFile = path.join(tempDir, 'result.txt');
  const outputPath = path.join(tempDir, 'stdout.jsonl');
  const errorPath = path.join(tempDir, 'stderr.log');
  let outputFd;
  let errorFd;
  let monitor;
  let result;
  try {
    outputFd = fs.openSync(outputPath, 'wx', 0o600);
    errorFd = fs.openSync(errorPath, 'wx', 0o600);
    const invocation = buildInvocation({ ...input, resultFile });
    const env = buildChildEnv(input.harness, input.env);
    monitor = startProgressMonitor(input, outputPath, Date.now());
    result = spawnSync(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env,
      input: invocation.input,
      encoding: 'utf8',
      stdio: ['pipe', outputFd, errorFd],
    });
    fs.closeSync(outputFd);
    outputFd = undefined;
    fs.closeSync(errorFd);
    errorFd = undefined;
    stopProgressMonitor(monitor);
    monitor = null;

    if (result.error) throw result.error;
    if (result.status !== 0) {
      const diagnostic = readFileTail(errorPath).trim() || readFileTail(outputPath).trim();
      throw new Error(`${input.phase} process exited ${result.status}: ${diagnostic}`);
    }
    if (input.harness === 'codex') {
      if (!fs.existsSync(resultFile)) throw new Error('Codex did not write its final result');
      return fs.readFileSync(resultFile, 'utf8');
    }
    return readClaudeResult(outputPath);
  } finally {
    if (outputFd !== undefined) fs.closeSync(outputFd);
    if (errorFd !== undefined) fs.closeSync(errorFd);
    stopProgressMonitor(monitor);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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

function prepareTaskWorkspace(repoRoot, workspace, baseHead) {
  const branchRef = `refs/heads/${workspace.branch}`;
  const branchExists = refExists(repoRoot, branchRef);
  const worktreeExists = fs.existsSync(workspace.worktreePath);
  if (branchExists !== worktreeExists) {
    throw new Error(`Task resume state is incomplete; expected both branch and worktree: ${workspace.branch}, ${workspace.worktreePath}`);
  }
  if (branchExists) return assertRegisteredWorktree(repoRoot, workspace.worktreePath, workspace.branch);

  const parent = path.dirname(workspace.worktreePath);
  createContainedDirectory(repoRoot, parent, 'Task worktree parent');
  execGit(repoRoot, ['worktree', 'add', '-b', workspace.branch, workspace.worktreePath, baseHead]);
  return assertRegisteredWorktree(repoRoot, workspace.worktreePath, workspace.branch);
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

function assertPathspecClean(cwd, pathspec, label) {
  const flagged = execGit(cwd, ['ls-files', '-v', '-z', '--', pathspec], { raw: true })
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
    '--',
    pathspec,
  ]);
  if (status) throw new Error(`${label} is not clean:\n${status}`);
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

function assertRunnerPlanFile(taskProjectRoot, baseProjectRoot, reportedPath) {
  const taskCandidate = path.resolve(taskProjectRoot, reportedPath);
  const baseCandidate = path.resolve(baseProjectRoot, reportedPath);
  if (fs.existsSync(taskCandidate)) return assertPlanFile(taskProjectRoot, reportedPath);
  if (fs.existsSync(baseCandidate)) return assertPlanFile(baseProjectRoot, reportedPath);
  return assertPlanFile(taskProjectRoot, reportedPath);
}

function ensureLocalPlanIgnore(repoRoot, projectRoot) {
  const gitPath = execGit(repoRoot, ['rev-parse', '--git-path', 'info/exclude']);
  const excludePath = path.resolve(repoRoot, gitPath);
  const patterns = [];
  const configPath = path.join(repoRoot, '.groundwork.yml');
  if (fs.existsSync(configPath) && projectRoot !== repoRoot) {
    const projects = parseGroundworkConfig(fs.readFileSync(configPath, 'utf8'));
    for (const project of Object.values(projects)) {
      if (project.path) patterns.push(`/${project.path.replace(/^\.\//, '').replace(/\/$/, '')}/.groundwork-plans/`);
    }
  }
  const relativeProject = path.relative(repoRoot, projectRoot).split(path.sep).join('/');
  patterns.push(relativeProject
    ? `/${relativeProject}/.groundwork-plans/`
    : '/.groundwork-plans/');
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const missing = [...new Set(patterns)].filter((pattern) => !existing.split('\n').includes(pattern));
  if (missing.length) {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.appendFileSync(excludePath, `${existing && !existing.endsWith('\n') ? '\n' : ''}${missing.join('\n')}\n`);
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
    header.push(`Task branch: ${input.branch}`);
    header.push(`Verify and reuse the precreated registered worktree at exactly ${input.worktreePath}.`);
    header.push('The runner exclusively owns task-worktree creation, removal, and recovery.');
    if (input.resumeExistingWorktree) {
      header.push('RESUME EXISTING WORKTREE=true');
      header.push(`Reuse the existing registered worktree at exactly ${input.worktreePath}.`);
      header.push('Inspect the plan, commits, working state, and tests; do not repeat completed implementation work. Finish and commit only what remains.');
    }
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
  if (beforeTask.status === 'Complete' && taskHead !== validatedHead) {
    throw new Error(`finalize-task changed task bookkeeping after validated ${taskId} was already Complete`);
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
  relocateTaskHooksPathBeforeCleanup(repoRoot, implementation.worktreePath);
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
  const now = dependencies.now || Date.now;
  const repoInput = path.resolve(options.repo || process.cwd());
  const repoRoot = fs.realpathSync(execGit(repoInput, ['rev-parse', '--show-toplevel']));
  const commonDir = fs.realpathSync(path.resolve(repoRoot, execGit(repoRoot, ['rev-parse', '--git-common-dir'])));
  const primaryRoot = fs.realpathSync(path.dirname(commonDir));
  if (repoRoot !== primaryRoot) {
    throw new Error(`Run from the primary worktree or pass --repo ${primaryRoot}`);
  }
  const leaseDependencies = {
    log,
    now: dependencies.leaseNow || now,
    wait: dependencies.leaseWait,
    heartbeatMs: dependencies.leaseHeartbeatMs,
    processStartIdentity: dependencies.processStartIdentity,
  };
  const releaseSetupLease = acquireRepositoryGate(
    commonDir,
    'write',
    { project: options.project || '.', taskId: 'setup' },
    leaseDependencies
  );
  let baseBranch;
  let project;
  let projectRoot;
  let taskIds;
  try {
    baseBranch = execGit(repoRoot, ['branch', '--show-current']);
    if (!baseBranch) throw new Error('The primary worktree must be on a local branch');
    assertClean(repoRoot, 'Base worktree');

    project = dependencies.resolveProject
      ? dependencies.resolveProject(repoRoot, options.project, repoInput)
      : resolveProject(repoRoot, options.project, repoInput);
    projectRoot = fs.realpathSync(project.projectRoot);
    if (!isContained(repoRoot, projectRoot)) throw new Error('Selected project is outside the repository');
    assertNoSymlinkComponents(repoRoot, projectRoot, 'Selected project');

    const catalog = parseTaskCatalog(readTasks(projectRoot));
    let selected = options.command === 'task' ? options.tasks : null;
    if (options.fromTask || options.toTask) {
      if (options.fromTask && !catalog.has(options.fromTask)) {
        throw new Error(`Range start not found: ${options.fromTask}`);
      }
      if (options.toTask && !catalog.has(options.toTask)) {
        throw new Error(`Range end not found: ${options.toTask}`);
      }
      const fromNumber = options.fromTask ? Number(options.fromTask.slice(5)) : 0;
      const toNumber = options.toTask ? Number(options.toTask.slice(5)) : Infinity;
      selected = [...catalog.keys()].filter((taskId) => {
        const number = Number(taskId.slice(5));
        return number >= fromNumber && number <= toNumber;
      });
    }
    taskIds = orderTasks(catalog, selected);
    if (!options.dryRun) {
      ensureLocalPlanIgnore(repoRoot, projectRoot);
      assertPlanTree(projectRoot);
      assertNoCommandGitConfig(repoRoot);
    }
  } finally {
    releaseSetupLease();
  }
  if (options.dryRun) {
    taskIds.forEach((taskId) => log(taskId));
    return taskIds;
  }
  const projectRelative = path.relative(repoRoot, projectRoot).split(path.sep).join('/') || '.';
  const leaseOwner = (taskId) => ({
    project: project.projectName || '.',
    projectPath: projectRelative,
    taskId,
  });
  let gitControls;
  const callPhase = dependencies.invokePhase || invokePhase;
  function invokeChecked(input) {
    if (dependencies.beforePhase) dependencies.beforePhase(input);
    const releaseGate = acquireRepositoryGate(
      commonDir,
      'read',
      leaseOwner(input.taskId),
      leaseDependencies
    );
    let peerOwnersBefore;
    let repositoryState;
    try {
      peerOwnersBefore = activeProjectOwners(commonDir, repoRoot, leaseDependencies)
        .filter((owner) => owner.projectPath !== projectRelative || owner.taskId !== input.taskId);
      repositoryState = {
        refs: snapshotRepositoryRefs(repoRoot),
        worktrees: snapshotWorktreeRegistry(repoRoot),
        runner: snapshotRunnerFiles(commonDir),
        hooksPaths: readLocalHooksPaths(repoRoot),
      };
      return callPhase(input);
    } finally {
      try {
        if (repositoryState) {
          if (restoreTransientTaskHooksPath(repoRoot, input, repositoryState.hooksPaths)) {
            log(`[${formatLocalTimestamp(now())}] [${input.taskId}] restored transient task-worktree core.hooksPath`);
          }
          assertGitControls(commonDir, gitControls);
          assertRunnerTransition(repositoryState.runner, snapshotRunnerFiles(commonDir), peerOwnersBefore);
          assertPlanTree(input.projectRoot);
          assertRepositoryTransition(repoRoot, repositoryState, input, peerOwnersBefore);
        }
      } finally {
        releaseGate();
      }
    }
  }
  const pluginRoot = dependencies.pluginRoot || path.resolve(__dirname, '..');
  const completed = [];

  for (const taskId of taskIds) {
    const releaseTaskLease = acquireProjectLease(
      commonDir,
      leaseOwner(taskId),
      leaseDependencies
    );
    let implementation = null;
    let activePhase = null;
    const harnessLabel = options.harness === 'claude' ? 'Claude Code' : 'Codex';
    function taskLog(message, at = now()) {
      log(`[${formatLocalTimestamp(at)}] ${message}`);
    }
    function beginPhase(phase) {
      const startedAt = now();
      activePhase = { phase, startedAt };
      taskLog(`[${taskId}] ${phase} started — ${harnessLabel}`, startedAt);
    }
    function completePhase() {
      const completedAt = now();
      taskLog(
        `[${taskId}] ${activePhase.phase} completed in ${formatElapsed(completedAt - activePhase.startedAt)}`,
        completedAt
      );
      activePhase = null;
    }
    try {
      if (execGit(repoRoot, ['branch', '--show-current']) !== baseBranch) {
        throw new Error(`Primary worktree moved from base branch ${baseBranch}`);
      }
      assertClean(repoRoot, 'Base worktree');
      gitControls = snapshotGitControls(commonDir);
      const baseSha = execGit(repoRoot, ['rev-parse', 'HEAD']);
      const stateLocation = checkpointPath(commonDir, repoRoot, projectRoot, taskId);
      let checkpoint = loadCheckpoint(commonDir, repoRoot, projectRoot, taskId) || {
        version: 1,
        taskId,
        project: stateLocation.projectRelative,
        baseBranch,
      };
      if (checkpoint.baseBranch !== baseBranch) {
        throw new Error(`Runner checkpoint expects base branch ${checkpoint.baseBranch}, not ${baseBranch}`);
      }
      const workspace = taskWorkspaceIdentity(
        repoRoot,
        commonDir,
        projectRoot,
        project.projectName,
        taskId,
        checkpoint
      );
      const expectedBranch = workspace.branch;
      const expectedWorktree = workspace.worktreePath;
      if (!checkpoint.workspace) {
        checkpoint.workspace = { branch: expectedBranch, worktreePath: expectedWorktree };
        saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
      }
      const releaseWorkspaceGate = acquireRepositoryGate(
        commonDir,
        'write',
        leaseOwner(taskId),
        leaseDependencies
      );
      let preparedWorktree;
      try {
        preparedWorktree = prepareTaskWorkspace(repoRoot, workspace, baseSha);
        const inspectUnrelated = dependencies.inspectUnrelatedWorktrees || snapshotUnrelatedWorktrees;
        inspectUnrelated(repoRoot, projectRoot, preparedWorktree);
      } finally {
        releaseWorkspaceGate();
      }
      const taskProjectRelativePath = path.relative(repoRoot, projectRoot);
      const lexicalPreparedProject = path.join(preparedWorktree, taskProjectRelativePath);
      assertNoSymlinkComponents(preparedWorktree, lexicalPreparedProject, 'Task project');
      const preparedTaskProjectRoot = fs.realpathSync(lexicalPreparedProject);
      if (!isContained(preparedWorktree, preparedTaskProjectRoot)) {
        throw new Error('Selected project resolves outside the task worktree');
      }
      assertNoSymlinkComponents(preparedWorktree, preparedTaskProjectRoot, 'Task project');
      const preparedTaskSpecsDir = path.join(preparedTaskProjectRoot, 'specs');
      assertNoSymlinkComponents(preparedTaskProjectRoot, preparedTaskSpecsDir, 'Task specs');
      const common = {
        harness: options.harness,
        taskId,
        repoRoot,
        projectName: project.projectName,
        projectRoot: preparedTaskProjectRoot,
        specsDir: preparedTaskSpecsDir,
        branch: expectedBranch,
        worktreePath: expectedWorktree,
      };
      const env = {
        GROUNDWORK_HARNESS: options.harness,
        GROUNDWORK_HARNESS_CHILD: '1',
        GROUNDWORK_RUNNER_MODE: 'true',
        GROUNDWORK_BATCH_MODE: 'true',
        GROUNDWORK_PROJECT: project.projectName || '',
        GROUNDWORK_PROJECT_ROOT: preparedTaskProjectRoot,
      };

      const conventionalTaskPlan = path.join(preparedTaskProjectRoot, '.groundwork-plans', `${taskId}-plan.md`);
      const conventionalBasePlan = path.join(projectRoot, '.groundwork-plans', `${taskId}-plan.md`);
      let planFile;
      if (fs.existsSync(conventionalTaskPlan) || fs.existsSync(conventionalBasePlan)) {
        planFile = fs.existsSync(conventionalTaskPlan)
          ? assertPlanFile(preparedTaskProjectRoot, conventionalTaskPlan)
          : assertPlanFile(projectRoot, conventionalBasePlan);
        taskLog(`[${taskId}] plan skipped — existing plan`);
      } else {
        beginPhase('plan');
        const planOutput = invokeChecked({
          ...common,
          phase: 'plan',
          cwd: preparedTaskProjectRoot,
          pluginRoot,
          env,
          prompt: phasePrompt('plan', common),
        });
        const plan = parsePlanResult(planOutput);
        if (plan.identifier !== taskId) throw new Error(`plan-task returned ${plan.identifier}, expected ${taskId}`);
        planFile = assertRunnerPlanFile(preparedTaskProjectRoot, projectRoot, plan.planFilePath);
        if (execGit(repoRoot, ['rev-parse', 'HEAD']) !== baseSha) throw new Error('Base branch changed during planning');
        if (execGit(repoRoot, ['branch', '--show-current']) !== baseBranch) throw new Error('Base branch switched during planning');
        assertClean(repoRoot, 'Base worktree');
        completePhase();
      }
      const planRecord = {
        path: path.relative(projectRoot, planFile).split(path.sep).join('/'),
        sha256: fileSha256(planFile),
      };
      const planChanged = !checkpoint.plan
        || checkpoint.plan.path !== planRecord.path
        || checkpoint.plan.sha256 !== planRecord.sha256;
      const planInvalidatedDownstream = planChanged
        && Boolean(checkpoint.implementation || checkpoint.validation);
      if (planChanged) {
        checkpoint.plan = planRecord;
        delete checkpoint.implementation;
        delete checkpoint.validation;
        saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
      }

      const branchExists = refExists(repoRoot, `refs/heads/${expectedBranch}`);
      const worktreeExists = fs.existsSync(expectedWorktree);
      if (branchExists !== worktreeExists) {
        throw new Error(`Task resume state is incomplete; expected both branch and worktree: ${expectedBranch}, ${expectedWorktree}`);
      }
      let resumeExistingWorktree = false;
      let reusableValidation = false;
      if (branchExists) {
        implementation = {
          worktreePath: assertRegisteredWorktree(repoRoot, expectedWorktree, expectedBranch),
          branch: expectedBranch,
          baseBranch,
        };
        let worktreeClean = true;
        try {
          assertClean(implementation.worktreePath, 'Existing task worktree');
        } catch (error) {
          if (/ is not clean:\n/.test(error.message)) worktreeClean = false;
          else throw error;
        }
        const currentHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
        const validationIdentityMatches = worktreeClean
          && checkpoint.validation
          && checkpoint.validation.baseHead === baseSha
          && checkpoint.validation.branch === expectedBranch;
        reusableValidation = Boolean(validationIdentityMatches
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
          && checkpoint.implementation.worktreePath === implementation.worktreePath
          && checkpoint.implementation.taskHead === currentHead;
        const projectRelativePath = path.relative(repoRoot, projectRoot);
        const existingTaskProject = path.join(implementation.worktreePath, projectRelativePath);
        assertNoSymlinkComponents(implementation.worktreePath, existingTaskProject, 'Task project');
        const existingTask = parseTaskCatalog(readTasks(existingTaskProject)).get(taskId);
        const legacyComplete = worktreeClean && !planInvalidatedDownstream && !checkpoint.implementation
          && existingTask && ['In Progress', 'Complete'].includes(existingTask.status)
          && currentHead !== execGit(repoRoot, ['merge-base', baseSha, currentHead]);
        if (reusableValidation || implementationMatches || legacyComplete) {
          taskLog(`[${taskId}] implement skipped — existing clean worktree`);
        } else {
          resumeExistingWorktree = true;
        }
      }

      if (!implementation || resumeExistingWorktree) {
        beginPhase('implement');
        const implementInput = { ...common, planFile, resumeExistingWorktree };
        const implementOutput = invokeChecked({
          ...implementInput,
          phase: 'implement',
          cwd: preparedTaskProjectRoot,
          pluginRoot,
          env,
          prompt: phasePrompt('implement', implementInput),
        });
        implementation = parseImplementationResult(implementOutput);
      }
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
      const observedTaskHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
      const implementationHead = reusableValidation && checkpoint.implementation
        ? checkpoint.implementation.taskHead
        : observedTaskHead;
      execGit(repoRoot, ['merge-base', baseSha, observedTaskHead]);
      execGit(repoRoot, ['merge-base', '--is-ancestor', implementationHead, observedTaskHead]);
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
      if (activePhase) completePhase();
      if (!reusableValidation) {
        checkpoint.implementation = {
          planSha256: planRecord.sha256,
          worktreePath: implementation.worktreePath,
          branch: implementation.branch,
          baseBranch: implementation.baseBranch,
          baseHead: baseSha,
          taskHead: implementationHead,
        };
        delete checkpoint.validation;
        saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
      }

      let validation;
      let validationBase = baseSha;
      let repeats = new Set();
      for (let attempt = 0; attempt < 5; attempt++) {
        const validateInput = {
          ...taskCommon,
          baseSha: validationBase,
          worktreePath: implementation.worktreePath,
          branch: implementation.branch,
          baseBranch: implementation.baseBranch,
        };
        let validatedHead;
        if (reusableValidation && attempt === 0) {
          validation = {
            iterations: checkpoint.validation.iterations,
            fixed: checkpoint.validation.fixed,
            unworked: checkpoint.validation.unworked,
            validatedHead: checkpoint.validation.taskHead,
          };
          validatedHead = checkpoint.validation.taskHead;
          taskLog(`[${taskId}] validate skipped — unchanged validated heads`);
        } else {
          beginPhase('validate');
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
          validatedHead = execGit(implementation.worktreePath, ['rev-parse', 'HEAD']);
          if (validation.validatedHead !== validatedHead) {
            throw new Error('VALIDATED receipt does not match the clean task-worktree HEAD');
          }
          checkpoint.validation = {
            baseHead: validationBase,
            taskHead: validatedHead,
            branch: implementation.branch,
            iterations: validation.iterations,
            fixed: validation.fixed,
            unworked: validation.unworked,
          };
          saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
          completePhase();
        }

        beginPhase('finalize');
        const finalizeInput = { ...validateInput, validatedHead };
        let finalization = parseFinalizeResult(invokeChecked({
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
          if (dependencies.beforePublication) dependencies.beforePublication(finalization);
          const releasePublicationGate = acquireRepositoryGate(
            commonDir,
            'write',
            leaseOwner(taskId),
            leaseDependencies
          );
          let baseMovedBeforePublication = false;
          try {
            const inspectUnrelated = dependencies.inspectUnrelatedWorktrees || snapshotUnrelatedWorktrees;
            inspectUnrelated(repoRoot, projectRoot, implementation.worktreePath);
            baseMovedBeforePublication = execGit(repoRoot, ['rev-parse', baseBranch]) !== finalization.baseHead;
            if (!baseMovedBeforePublication) {
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
            }
          } finally {
            releasePublicationGate();
          }
          if (baseMovedBeforePublication) {
            finalization = {
              outcome: 'revalidate',
              taskHead: execGit(implementation.worktreePath, ['rev-parse', 'HEAD']),
              baseHead: execGit(repoRoot, ['rev-parse', baseBranch]),
              reason: 'base advanced before publication',
            };
          } else {
            const completedTask = parseTaskCatalog(readTasks(projectRoot)).get(taskId);
            if (!completedTask || completedTask.status !== 'Complete') {
              throw new Error(`${taskId} is not Complete after finalization`);
            }
            clearCheckpoint(commonDir, repoRoot, projectRoot, taskId);
            gitControls = snapshotGitControls(commonDir);
            completePhase();
            const { validatedHead: _validatedHead, ...validationSummary } = validation;
            completed.push({ taskId, validation: validationSummary });
            implementation = null;
            break;
          }
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
        checkpoint.implementation = {
          ...checkpoint.implementation,
          baseHead: actualBaseHead,
          taskHead: actualTaskHead,
        };
        delete checkpoint.validation;
        saveCheckpoint(commonDir, repoRoot, projectRoot, checkpoint);
        reusableValidation = false;

        if (attempt === 4) throw new Error('Base kept moving; finalization exceeded 5 revalidation attempts');
        completePhase();
      }
    } catch (error) {
      if (activePhase) {
        const failedAt = now();
        taskLog(
          `[${taskId}] ${activePhase.phase} failed after ${formatElapsed(failedAt - activePhase.startedAt)}`,
          failedAt
        );
      }
      const preserved = implementation
        ? `\nWorktree preserved: ${implementation.worktreePath}\nBranch preserved: ${implementation.branch}`
        : '';
      throw new Error(`${taskId} failed: ${error.message}${preserved}`);
    } finally {
      releaseTaskLease();
    }
  }
  return completed;
}

function usage() {
  return `Usage:
  groundwork-run task TASK-NNN [TASK-NNN ...] --harness claude|codex [--project NAME] [--repo PATH]
  groundwork-run task --from TASK-NNN [--to TASK-NNN] --harness claude|codex [--project NAME] [--repo PATH]
  groundwork-run all --harness claude|codex [--from TASK-NNN] [--to TASK-NNN] [--project NAME] [--repo PATH] [--dry-run]`;
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
  formatElapsed,
  formatLocalTimestamp,
  normalizeActivity,
  forEachGitRecord,
  invokePhase,
  assertRegisteredWorktree,
  acquireProjectLease,
  acquireRepositoryGate,
  activeProjectOwners,
  processStartIdentity,
  snapshotUnrelatedWorktrees,
  resolveProject,
  runTasks,
  main,
};

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
