/**
 * Project context resolution for monorepo support.
 *
 * Resolves the active project root directory for specs I/O.
 * In single-project repos, this is simply process.cwd().
 * In monorepos with .groundwork.yml, this resolves to the selected project's path.
 *
 * Selection scope: with real pane identity (tmux or a TTY), each terminal pane
 * gets its own state file that survives /clear and isolates concurrent panes.
 * Without pane identity (chat-window harnesses such as ZCode, GUI launches,
 * headless runs), every chat shares one degraded key: the pane file acts as a
 * workspace-level "last selection" default, and hooks — which DO receive a
 * session_id — additionally maintain per-chat snapshots so a chat keeps its
 * own assumption across clear/compaction. The freshest write wins, so an
 * explicit in-chat selection always beats an older pinned snapshot.
 *
 * Resolution chain:
 * 1. GROUNDWORK_PROJECT_ROOT env var (set by project-selector or session restore)
 * 2. .groundwork.yml + GROUNDWORK_PROJECT env var → resolve path
 * 3. Direct detection: cwd has specs/ → return cwd
 * 4. Walk-up: nearest parent with specs/
 * 5. Fallback: process.cwd()
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFileSync } = require('child_process');

/**
 * Resolve the active harness. Exported runtimes set GROUNDWORK_HARNESS
 * explicitly; environment detection keeps direct library use convenient.
 *
 * @returns {string} Harness name
 */
function getHarness() {
  if (process.env.GROUNDWORK_HARNESS) return process.env.GROUNDWORK_HARNESS;
  if (process.env.CODEX_HOME) return 'codex';
  if (process.env.ZCODE_HOME) return 'zcode';
  return 'claude';
}

/**
 * Get the harness-owned state directory.
 *
 * @returns {string} Absolute path to the Groundwork state directory
 */
function getStateDir() {
  const home = process.env.HOME || os.homedir();

  switch (getHarness()) {
    case 'codex':
      return path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'groundwork-state');
    case 'opencode':
      return path.join(
        process.env.OPENCODE_CONFIG_DIR ||
          path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'opencode'),
        'groundwork-state'
      );
    case 'kiro':
      return path.join(process.env.KIRO_HOME || path.join(home, '.kiro'), 'groundwork-state');
    case 'pi':
      return path.join(process.env.PI_HOME || path.join(home, '.pi', 'agent'), 'groundwork-state');
    case 'zcode':
      return path.join(process.env.ZCODE_HOME || path.join(home, '.zcode'), 'groundwork-state');
    case 'claude':
    default:
      return path.join(
        process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'),
        'groundwork-state'
      );
  }
}

/**
 * Get the panes directory in the active harness state directory.
 * @returns {string} Absolute path to panes dir
 */
function getPanesDir() {
  return path.join(getStateDir(), 'panes');
}

/**
 * Get the chat-snapshots directory in the active harness state directory.
 * Holds per-session selection snapshots written by hooks (the only component
 * with a reliable per-chat session id in pane-less harnesses). Named
 * distinctly from the legacy "sessions" dir that session-start.sh removes.
 * @returns {string} Absolute path to the chat-snapshots dir
 */
function getChatSnapshotsDir() {
  return path.join(getStateDir(), 'chat-snapshots');
}

// Cache resolved values for the session
let _cachedProjectRoot = null;
let _cachedConfig = null;
let _cachedConfigPath = null;
let _cachedPaneKey = null;
let _cachedPaneKeySource = null;
let _cachedRepoRoot;
let _cachedMainRepoRoot;

/**
 * Parse a .groundwork.yml config file.
 * Handles the specific format:
 *   version: 1
 *   projects:
 *     project-name:
 *       path: relative/path
 *
 * @param {string} content - File content
 * @returns {object|null} Parsed config or null if invalid
 */
function parseConfig(content) {
  if (!content || typeof content !== 'string') return null;

  try {
    const result = { version: 1, projects: {} };
    const lines = content.split('\n');
    let currentProject = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // version: N
      const versionMatch = trimmed.match(/^version:\s*(\d+)$/);
      if (versionMatch) {
        result.version = parseInt(versionMatch[1], 10);
        continue;
      }

      // projects: (section header)
      if (trimmed === 'projects:') continue;

      // Project name (2-space indent, no further nesting)
      const projectMatch = line.match(/^  ([A-Za-z0-9][A-Za-z0-9_-]*):\s*$/);
      if (projectMatch) {
        currentProject = projectMatch[1];
        result.projects[currentProject] = {};
        continue;
      }

      // Project property (4-space indent)
      if (currentProject) {
        const propMatch = line.match(/^    (\w+):\s*(.+)$/);
        if (propMatch) {
          result.projects[currentProject][propMatch[1]] = propMatch[2].trim();
        }
      }
    }

    // Validate: must have at least one project with a path
    const projectNames = Object.keys(result.projects);
    if (projectNames.length === 0) return null;
    for (const name of projectNames) {
      if (!result.projects[name].path) return null;
    }

    return result;
  } catch (error) {
    if (process.env.GROUNDWORK_DEBUG) {
      console.error(`[project-context] Config parse error: ${error.message}`);
    }
    return null;
  }
}

/**
 * Find the git repository root.
 *
 * @returns {string|null} Repo root path or null
 */
function getRepoRoot() {
  if (_cachedRepoRoot !== undefined) return _cachedRepoRoot;

  try {
    _cachedRepoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000
    }).trim();
    return _cachedRepoRoot;
  } catch {
    _cachedRepoRoot = null;
    return null;
  }
}

/**
 * Find the main repository root (not a worktree root).
 * Uses git-common-dir which points to the shared .git directory
 * across all worktrees, so path.dirname gives the main repo root.
 *
 * @returns {string|null} Main repo root path or null
 */
function getMainRepoRoot() {
  if (_cachedMainRepoRoot !== undefined) return _cachedMainRepoRoot;

  try {
    const gitCommonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000
    }).trim();
    _cachedMainRepoRoot = path.dirname(path.resolve(gitCommonDir));
  } catch {
    _cachedMainRepoRoot = getRepoRoot();
  }
  return _cachedMainRepoRoot;
}

/**
 * Load .groundwork.yml from the repo root.
 *
 * @param {string} [repoRoot] - Repo root path (auto-detected if omitted)
 * @returns {{config: object, configPath: string}|null}
 */
function loadConfig(repoRoot) {
  if (_cachedConfig !== null) {
    return _cachedConfig ? { config: _cachedConfig, configPath: _cachedConfigPath } : null;
  }

  const root = repoRoot || getRepoRoot() || process.cwd();
  const configPath = path.join(root, '.groundwork.yml');

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const config = parseConfig(content);
    if (config) {
      _cachedConfig = config;
      _cachedConfigPath = configPath;
      return { config, configPath };
    }
  } catch (error) {
    if (error.code !== 'ENOENT' && process.env.GROUNDWORK_DEBUG) {
      console.error(`[project-context] Error reading config: ${error.message}`);
    }
  }

  _cachedConfig = false; // Cache the miss
  return null;
}

/**
 * Get the state file path for persisting project selection.
 *
 * @returns {string} Path to the state file
 */
function getStateFilePath() {
  const root = getMainRepoRoot() || process.cwd();
  return path.join(root, '.groundwork.local');
}

/**
 * Resolve the project root directory.
 *
 * Resolution chain:
 * 1. GROUNDWORK_PROJECT_ROOT env var
 * 2. Config + GROUNDWORK_PROJECT → resolve path
 * 3. Direct detection: cwd has specs/
 * 4. Walk-up: nearest parent with specs/
 * 5. Fallback: process.cwd()
 *
 * @returns {string} Absolute path to the project root
 */
function getProjectRoot() {
  if (_cachedProjectRoot) return _cachedProjectRoot;

  // 1. Env var override (absolute path)
  if (process.env.GROUNDWORK_PROJECT_ROOT) {
    const envRoot = path.resolve(process.env.GROUNDWORK_PROJECT_ROOT);
    if (fs.existsSync(envRoot)) {
      _cachedProjectRoot = envRoot;
      return envRoot;
    }
  }

  // 2. Config + selection
  const configResult = loadConfig();
  if (configResult) {
    const { config } = configResult;
    const selectedProject = process.env.GROUNDWORK_PROJECT;

    if (selectedProject && config.projects[selectedProject]) {
      const repoRoot = getRepoRoot() || process.cwd();
      const projectPath = path.resolve(repoRoot, config.projects[selectedProject].path);
      if (fs.existsSync(projectPath)) {
        _cachedProjectRoot = projectPath;
        return projectPath;
      }
    }
  }

  // 3. Direct detection: cwd has specs/
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'specs'))) {
    _cachedProjectRoot = cwd;
    return cwd;
  }

  // 4. Walk-up: nearest parent with specs/
  let current = cwd;
  const root = path.parse(current).root;
  while (current !== root) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
    if (fs.existsSync(path.join(current, 'specs'))) {
      _cachedProjectRoot = current;
      return current;
    }
  }

  // 5. Fallback
  _cachedProjectRoot = cwd;
  return cwd;
}

/**
 * Set the project root for this session.
 *
 * @param {string} projectPath - Absolute path to set as project root
 */
function setProjectRoot(projectPath) {
  const resolved = path.resolve(projectPath);
  process.env.GROUNDWORK_PROJECT_ROOT = resolved;
  _cachedProjectRoot = resolved;
}

/**
 * Get the resolved specs directory path.
 *
 * @returns {string} Relative path to specs dir (e.g., "specs" or "apps/web-app/specs")
 */
function getSpecsDir() {
  const projectRoot = getProjectRoot();
  const repoRoot = getRepoRoot() || process.cwd();

  if (projectRoot === repoRoot || projectRoot === process.cwd()) {
    return 'specs';
  }

  // Return path relative to repo root
  const relativePath = path.relative(repoRoot, projectRoot);
  return path.join(relativePath, 'specs');
}

/**
 * Get the resolved plans directory path.
 *
 * Plan files live at <project root>/.groundwork-plans/ so overlapping
 * TASK-NNN identifiers across monorepo projects cannot collide. Mirrors
 * getSpecsDir()'s relativity: the returned path resolves correctly from the
 * current working directory.
 *
 * @returns {string} Path to the plans dir (e.g., ".groundwork-plans" or "apps/web/.groundwork-plans")
 */
function getPlansDir() {
  return path.join(path.dirname(getSpecsDir()), '.groundwork-plans');
}

/**
 * List all projects defined in .groundwork.yml.
 *
 * @returns {Array<{name: string, path: string, hasSpecs: boolean}>}
 */
function listProjects() {
  const configResult = loadConfig();
  if (!configResult) return [];

  const { config } = configResult;
  const repoRoot = getRepoRoot() || process.cwd();

  return Object.entries(config.projects).map(([name, project]) => {
    const projectPath = path.resolve(repoRoot, project.path);
    const specsPath = path.join(projectPath, 'specs');
    return {
      name,
      path: project.path,
      hasSpecs: fs.existsSync(specsPath)
    };
  });
}

/**
 * Detect whether the current repo is a monorepo with groundwork config.
 *
 * @returns {{isMonorepo: boolean, configPath?: string, projects?: Array}}
 */
function detectMonorepo() {
  const configResult = loadConfig();
  if (!configResult) {
    return { isMonorepo: false };
  }

  return {
    isMonorepo: true,
    configPath: configResult.configPath,
    projects: listProjects()
  };
}

/**
 * Get the selected project name.
 *
 * @returns {string} Project name or empty string for single-project repos
 */
function getProjectName() {
  return process.env.GROUNDWORK_PROJECT || '';
}

/**
 * Get the session ID from the GROUNDWORK_SESSION_ID env var.
 *
 * Keys the per-chat selection snapshot layer (see persistSessionSelection);
 * pane state itself stays keyed by pane identity.
 *
 * @returns {string|null} Session ID, or null if not available
 */
function getSessionId() {
  return process.env.GROUNDWORK_SESSION_ID || null;
}

/**
 * Derive the active harness's stable selection-scope key.
 *
 * Tmux identity comes directly from $TMUX + $TMUX_PANE so sandboxed Codex
 * subprocesses do not need access to the tmux server socket. Otherwise, walk
 * parent PIDs upward via `ps -o tty=` until an ancestor with a real TTY is
 * found, then normalize the result (e.g. /dev/pts/3 → pts_3). BSD ps prints
 * `??` (not Linux's single `?`) for "no controlling terminal" — both spellings
 * must be rejected or every GUI-spawned process (ZCode, Claude desktop)
 * coalesces on the meaningless key `??`.
 *
 * Fallback chain when no TTY is available (headless, detached, GUI apps):
 * 1. tmux-* from stable environment identity
 * 2. pts_N / ttysN from process walk
 * 3. repo-<sha1(repo root)[:12]> — deterministic per repository, so processes
 *    invoked from different subdirectories of the same repo share one key
 *    (the workspace-default scope); falls back to cwd outside any repo
 * 4. session-<sessionId> (last resort)
 *
 * The result is cached on _cachedPaneKey for the lifetime of this Node
 * process, with its derivation source on _cachedPaneKeySource.
 *
 * @returns {string} Pane key (filesystem-safe)
 */
function getPaneKey() {
  if (_cachedPaneKey) return _cachedPaneKey;

  const normalize = (tty) => tty.replace(/^\/dev\//, '').replace(/\//g, '_');

  // Tmux fast path. Hash both the server identity and pane ID to avoid
  // collisions between tmux servers that each have a pane such as %1.
  if (process.env.TMUX_PANE) {
    const identity = `${process.env.TMUX || ''}\0${process.env.TMUX_PANE}`;
    const hash = crypto.createHash('sha1').update(identity).digest('hex').slice(0, 12);
    _cachedPaneKeySource = 'tmux';
    _cachedPaneKey = `tmux-${hash}`;
    return _cachedPaneKey;
  }

  // Process tree walk: ps -o tty= -p <pid>, then ps -o ppid= -p <pid>
  try {
    let pid = process.pid;
    for (let i = 0; i < 32 && pid > 1; i++) {
      let raw;
      try {
        raw = execFileSync('ps', ['-o', 'tty=', '-p', String(pid)], {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 1000
        }).trim();
      } catch {
        raw = '';
      }
      if (raw && !/^\?+$/.test(raw)) {
        _cachedPaneKeySource = 'tty';
        _cachedPaneKey = normalize(raw);
        return _cachedPaneKey;
      }

      let nextPid;
      try {
        nextPid = parseInt(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 1000
        }).trim(), 10);
      } catch {
        break;
      }
      if (!nextPid || nextPid === pid) break;
      pid = nextPid;
    }
  } catch {
    // Fall through
  }

  // Fallback 2: repository hash. Without pane identity the selection is a
  // workspace-level default anyway, so keying on the repo root (rather than
  // cwd) keeps hook invocations at the repo root and skill invocations from
  // subdirectories on the same key.
  try {
    const scope = getMainRepoRoot() || getRepoRoot() || path.resolve(process.cwd());
    const hash = crypto.createHash('sha1').update(scope).digest('hex').slice(0, 12);
    _cachedPaneKeySource = 'repo';
    _cachedPaneKey = `repo-${hash}`;
    return _cachedPaneKey;
  } catch {
    // Fall through
  }

  // Fallback 3: session id
  const sid = getSessionId();
  if (sid) {
    _cachedPaneKeySource = 'session';
    _cachedPaneKey = `session-${sid}`;
    return _cachedPaneKey;
  }

  // Last-resort fallback: pid (always unique within this process, no isolation)
  _cachedPaneKeySource = 'pid';
  _cachedPaneKey = `pid-${process.pid}`;
  return _cachedPaneKey;
}

/**
 * Whether getPaneKey() resolved a real terminal-pane identity (tmux or TTY).
 *
 * When false, all processes of the harness share one degraded key, so pane
 * state is a workspace-level "last selection" default rather than a per-pane
 * or per-chat selection, and per-chat session snapshots should be consulted
 * (see restoreSelection / persistSessionSelection).
 *
 * @returns {boolean} True if the pane key names an actual terminal pane
 */
function hasPaneIdentity() {
  getPaneKey();
  return _cachedPaneKeySource === 'tmux' || _cachedPaneKeySource === 'tty';
}

/**
 * Compute the pane state file path for (paneKey, repoRoot).
 *
 * The composite filename keeps a single pane's selections isolated per repo,
 * so cd-ing between repos in the same pane doesn't collide.
 *
 * @param {string} paneKey - Pane key from getPaneKey()
 * @param {string} repoRoot - Absolute repo root path
 * @returns {string} Absolute path to the pane state JSON file
 */
function getPaneFilePath(paneKey, repoRoot) {
  const repoSlug = path.resolve(repoRoot).replace(/\//g, '_');
  return path.join(getPanesDir(), `${paneKey}__${repoSlug}.json`);
}

/**
 * Write a pane state file with the current project selection.
 *
 * @param {string} paneKey - Pane key
 * @param {string} repoRoot - Absolute repo root path
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 * @param {string|null} sessionId - Claude session ID (audit metadata only)
 */
function persistPaneSelection(paneKey, repoRoot, projectName, projectPath, sessionId) {
  const panesDir = getPanesDir();
  fs.mkdirSync(panesDir, { recursive: true });
  const data = {
    project: projectName,
    root: projectPath,
    repoRoot,
    paneKey,
    timestamp: Math.floor(Date.now() / 1000),
    sessionId: sessionId || null
  };
  fs.writeFileSync(getPaneFilePath(paneKey, repoRoot), JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Read a pane state file for the given (paneKey, repoRoot).
 *
 * @param {string} paneKey - Pane key from getPaneKey()
 * @param {string} repoRoot - Absolute repo root path
 * @returns {{projectName: string, projectPath: string, timestamp: number}|null}
 */
function restorePaneSelection(paneKey, repoRoot) {
  try {
    const filePath = getPaneFilePath(paneKey, repoRoot);
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data.project && data.root && fs.existsSync(data.root)) {
      return {
        projectName: data.project,
        projectPath: data.root,
        timestamp: data.timestamp || 0
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Compute the chat-snapshot file path for (sessionId, repoRoot).
 *
 * @param {string} sessionId - Harness session/chat id
 * @param {string} repoRoot - Absolute repo root path
 * @returns {string} Absolute path to the snapshot JSON file
 */
function getSnapshotFilePath(sessionId, repoRoot) {
  const repoSlug = path.resolve(repoRoot).replace(/\//g, '_');
  return path.join(getChatSnapshotsDir(), `${sessionId}__${repoSlug}.json`);
}

/**
 * Write a per-chat selection snapshot. Hooks call this whenever they observe a
 * restored selection: it pins the chat's current assumption so a later
 * clear/compaction in the same session restores it instead of whatever
 * workspace default another chat has written since. Freshest write wins, so
 * an explicit in-chat selection (a newer pane write) still overrides it.
 *
 * @param {string} sessionId - Harness session/chat id
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 */
function persistSessionSelection(sessionId, projectName, projectPath) {
  if (!sessionId) return;
  const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
  const dir = getChatSnapshotsDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getSnapshotFilePath(sessionId, repoRoot), JSON.stringify({
    project: projectName,
    root: projectPath,
    repoRoot,
    sessionId,
    timestamp: Math.floor(Date.now() / 1000)
  }, null, 2), 'utf8');
}

/**
 * Read the per-chat selection snapshot for (sessionId, repoRoot).
 *
 * @param {string} sessionId - Harness session/chat id
 * @param {string} [repoRoot] - Absolute repo root path (auto-detected if omitted)
 * @returns {{projectName: string, projectPath: string, timestamp: number}|null}
 */
function restoreSessionSelection(sessionId, repoRoot) {
  if (!sessionId) return null;
  const root = repoRoot || getMainRepoRoot() || getRepoRoot() || process.cwd();
  try {
    const raw = fs.readFileSync(getSnapshotFilePath(sessionId, root), 'utf8');
    const data = JSON.parse(raw);
    if (data.project && data.root && fs.existsSync(data.root)) {
      return {
        projectName: data.project,
        projectPath: data.root,
        timestamp: data.timestamp || 0
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove pane state files and chat snapshots older than 30 days. Best-effort.
 */
function cleanupStalePanes() {
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
  for (const dir of [getPanesDir(), getChatSnapshotsDir()]) {
    try {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const filePath = path.join(dir, file);
          const raw = fs.readFileSync(filePath, 'utf8');
          const data = JSON.parse(raw);
          if (data.timestamp && data.timestamp < cutoff) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Skip errors during cleanup
        }
      }
    } catch {
      // Cleanup is best-effort
    }
  }
}

/**
 * Persist the project selection to the pane state file.
 *
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 * @param {string} [sessionId] - Claude session ID for audit metadata only
 */
function persistSelection(projectName, projectPath, sessionId) {
  const paneKey = getPaneKey();
  const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
  const sid = sessionId || getSessionId();
  persistPaneSelection(paneKey, repoRoot, projectName, projectPath, sid);
}

/**
 * Restore project selection using the fallback chain.
 *
 * With real pane identity (terminal harnesses):
 * 1. Pane state file for current (paneKey, repoRoot) → source 'pane'
 *
 * Without pane identity (chat-window/GUI harnesses), when a session id is
 * available (hook invocations):
 * 2. Per-chat snapshot → source 'session'. Snapshots win unconditionally
 *    over the shared pane file: the snapshot records what THIS chat selected
 *    or assumed, and a foreign pane write (another chat's selection) must
 *    not steal it. This chat's own selections stay correct because the
 *    PostToolUse hook adopts them into the snapshot the moment their
 *    persist command runs (see hooks/pin-session-selection.sh).
 *
 * Without pane identity and without a session id (skill invocations):
 * 3. Shared pane file as a workspace-level default → source 'workspace-default'
 *
 * Degraded mode only, then:
 * 4. One-time migration from the pre-fix literal `??` pane key
 * 5. One-time migration from .groundwork.local → source 'migration'
 * 6. Returns null (caller falls through to CWD detection)
 *
 * @param {string} [sessionId] - Harness session/chat id (hooks provide it)
 * @returns {{projectName: string, projectPath: string, source: string}|null}
 */
function restoreSelection(sessionId) {
  const paneKey = getPaneKey();
  const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
  const sid = sessionId || getSessionId();

  if (hasPaneIdentity()) {
    // 1. Per-pane state is authoritative and survives /clear in the same pane.
    const paneResult = restorePaneSelection(paneKey, repoRoot);
    if (paneResult) return { ...paneResult, source: 'pane' };
  } else {
    if (sid) {
      // 2. The per-chat snapshot is this chat's own selection history; the
      // pane file is a shared workspace default that any chat may rewrite.
      const snapshot = restoreSessionSelection(sid, repoRoot);
      if (snapshot) return { ...snapshot, source: 'session' };
    }

    // 3. The pane file is a shared workspace-level default here, never a
    // per-chat selection — callers should surface it as an assumption.
    const paneResult = restorePaneSelection(paneKey, repoRoot);
    if (paneResult) return { ...paneResult, source: 'workspace-default' };

    // 4. One-time migration: processes running before the `??` fix coalesced
    // on that literal key; adopt and re-pin the selection under the new key.
    const legacy = restorePaneSelection('??', repoRoot);
    if (legacy) {
      persistPaneSelection(paneKey, repoRoot, legacy.projectName, legacy.projectPath, sid);
      return { ...legacy, source: 'workspace-default' };
    }
  }

  // 5. One-time migration from .groundwork.local
  try {
    const stateFile = getStateFilePath();
    const projectName = fs.readFileSync(stateFile, 'utf8').trim();
    if (projectName) {
      const configResult = loadConfig();
      if (configResult && configResult.config.projects[projectName]) {
        const cfgRepoRoot = getRepoRoot() || process.cwd();
        const projectPath = path.resolve(cfgRepoRoot, configResult.config.projects[projectName].path);
        if (fs.existsSync(projectPath)) {
          // Migrate: seed the pane state file from .groundwork.local
          persistPaneSelection(paneKey, repoRoot, projectName, projectPath, sid);
          return { projectName, projectPath, timestamp: 0, source: 'migration' };
        }
      }
    }
  } catch {
    // No .groundwork.local
  }

  return null;
}

/**
 * Clear all cached values. Useful for testing or after project switch.
 */
function clearCache() {
  _cachedProjectRoot = null;
  _cachedConfig = null;
  _cachedConfigPath = null;
  _cachedPaneKey = null;
  _cachedPaneKeySource = null;
  _cachedRepoRoot = undefined;
  _cachedMainRepoRoot = undefined;
}

module.exports = {
  getHarness,
  getStateDir,
  getProjectRoot,
  setProjectRoot,
  getSpecsDir,
  getPlansDir,
  getProjectName,
  listProjects,
  detectMonorepo,
  loadConfig,
  parseConfig,
  getRepoRoot,
  getMainRepoRoot,
  getSessionId,
  getPaneKey,
  hasPaneIdentity,
  getPaneFilePath,
  getChatSnapshotsDir,
  getSnapshotFilePath,
  persistPaneSelection,
  restorePaneSelection,
  persistSessionSelection,
  restoreSessionSelection,
  cleanupStalePanes,
  persistSelection,
  restoreSelection,
  clearCache,
  getStateFilePath
};
