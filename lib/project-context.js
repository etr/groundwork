/**
 * Project context resolution for monorepo support.
 *
 * Resolves the active project root directory for specs I/O.
 * In single-project repos, this is simply process.cwd().
 * In monorepos with .groundwork.yml, this resolves to the selected project's path.
 *
 * Pane isolation: each terminal pane gets its own state file keyed by a stable
 * pane identity derived from the TTY ancestry of the current process. Pane keys
 * survive /clear, /resume, and Claude restarts within the same terminal, while
 * still isolating concurrent panes. The Claude session_id is recorded as audit
 * metadata only — never used as the lookup key.
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
const { execSync } = require('child_process');

/**
 * Get the panes directory in the user's home directory.
 * @returns {string} Absolute path to panes dir
 */
function getPanesDir() {
  const home = process.env.HOME || require('os').homedir();
  return path.join(home, '.claude', 'groundwork-state', 'panes');
}

// Cache resolved values for the session
let _cachedProjectRoot = null;
let _cachedConfig = null;
let _cachedConfigPath = null;
let _cachedPaneKey = null;

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
      const projectMatch = line.match(/^  (\S[\w-]*):\s*$/);
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
  try {
    return execSync('git rev-parse --show-toplevel', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000
    }).trim();
  } catch {
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
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 3000
    }).trim();
    return path.dirname(path.resolve(gitCommonDir));
  } catch {
    return getRepoRoot();
  }
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
 * Audit metadata only — never used as a lookup key for project state.
 *
 * @returns {string|null} Session ID, or null if not available
 */
function getSessionId() {
  return process.env.GROUNDWORK_SESSION_ID || null;
}

/**
 * Derive a stable terminal-pane identity from the process tree.
 *
 * Walks parent PIDs upward via `ps -o tty=` until an ancestor with a real TTY
 * is found, then normalizes the result (e.g. /dev/pts/3 → pts_3). Tmux fast
 * path: if $TMUX_PANE is set, query tmux for the pane TTY directly.
 *
 * Fallback chain when no TTY is available (headless, detached, nohup):
 * 1. pts_* from process walk (primary)
 * 2. cwd-<sha1(absolute cwd)[:12]> (deterministic per working directory)
 * 3. session-<sessionId> (last resort)
 *
 * The result is cached on _cachedPaneKey for the lifetime of this Node process.
 *
 * @returns {string} Pane key (filesystem-safe)
 */
function getPaneKey() {
  if (_cachedPaneKey) return _cachedPaneKey;

  const normalize = (tty) => tty.replace(/^\/dev\//, '').replace(/\//g, '_');

  // Tmux fast path
  if (process.env.TMUX_PANE) {
    try {
      const tty = execSync(`tmux display-message -t "${process.env.TMUX_PANE}" -p '#{pane_tty}'`, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 1000
      }).trim();
      if (tty && tty !== '?') {
        _cachedPaneKey = normalize(tty);
        return _cachedPaneKey;
      }
    } catch {
      // Fall through to ps walk
    }
  }

  // Process tree walk: ps -o tty= -p <pid>, then ps -o ppid= -p <pid>
  try {
    let pid = process.pid;
    for (let i = 0; i < 32 && pid > 1; i++) {
      let raw;
      try {
        raw = execSync(`ps -o tty= -p ${pid}`, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 1000
        }).trim();
      } catch {
        raw = '';
      }
      if (raw && raw !== '?') {
        _cachedPaneKey = normalize(raw);
        return _cachedPaneKey;
      }

      let nextPid;
      try {
        nextPid = parseInt(execSync(`ps -o ppid= -p ${pid}`, {
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

  // Fallback 2: cwd hash
  try {
    const cwd = path.resolve(process.cwd());
    const hash = crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 12);
    _cachedPaneKey = `cwd-${hash}`;
    return _cachedPaneKey;
  } catch {
    // Fall through
  }

  // Fallback 3: session id
  const sid = getSessionId();
  if (sid) {
    _cachedPaneKey = `session-${sid}`;
    return _cachedPaneKey;
  }

  // Last-resort fallback: pid (always unique within this process, no isolation)
  _cachedPaneKey = `pid-${process.pid}`;
  return _cachedPaneKey;
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
  try {
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
  } catch (error) {
    if (process.env.GROUNDWORK_DEBUG) {
      console.error(`[project-context] Error writing pane file: ${error.message}`);
    }
  }
}

/**
 * Read a pane state file for the given (paneKey, repoRoot).
 *
 * @param {string} paneKey - Pane key
 * @param {string} repoRoot - Absolute repo root path
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restorePaneSelection(paneKey, repoRoot) {
  try {
    const filePath = getPaneFilePath(paneKey, repoRoot);
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (data.project && data.root && fs.existsSync(data.root)) {
      return { projectName: data.project, projectPath: data.root };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove pane state files older than 30 days. Best-effort.
 */
function cleanupStalePanes() {
  try {
    const panesDir = getPanesDir();
    if (!fs.existsSync(panesDir)) return;

    const cutoff = Math.floor(Date.now() / 1000) - 30 * 86400;
    const files = fs.readdirSync(panesDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(panesDir, file);
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
 * Restore project selection using the fallback chain:
 * 1. Pane state file for current (paneKey, repoRoot)
 * 2. One-time migration from .groundwork.local
 * 3. Returns null (caller falls through to CWD detection)
 *
 * @param {string} [sessionId] - Claude session ID for audit metadata only
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restoreSelection(sessionId) {
  const paneKey = getPaneKey();
  const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
  const sid = sessionId || getSessionId();

  // 1. Pane state file
  const paneResult = restorePaneSelection(paneKey, repoRoot);
  if (paneResult) return paneResult;

  // 2. One-time migration from .groundwork.local
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
          return { projectName, projectPath };
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
}

module.exports = {
  getProjectRoot,
  setProjectRoot,
  getSpecsDir,
  getProjectName,
  listProjects,
  detectMonorepo,
  loadConfig,
  parseConfig,
  getRepoRoot,
  getMainRepoRoot,
  getSessionId,
  getPaneKey,
  getPaneFilePath,
  persistPaneSelection,
  restorePaneSelection,
  cleanupStalePanes,
  persistSelection,
  restoreSelection,
  clearCache,
  getStateFilePath
};
