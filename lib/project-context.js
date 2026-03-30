/**
 * Project context resolution for monorepo support.
 *
 * Resolves the active project root directory for specs I/O.
 * In single-project repos, this is simply process.cwd().
 * In monorepos with .groundwork.yml, this resolves to the selected project's path.
 *
 * Session isolation: each Claude session gets its own session file keyed by
 * session_id, so multiple Claude instances in the same monorepo don't overwrite each other.
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
const { execSync } = require('child_process');

/**
 * Get the sessions directory, scoped to the repo root.
 * @returns {string} Absolute path to sessions dir
 */
function getSessionsDir() {
  const root = getMainRepoRoot() || getRepoRoot() || process.cwd();
  return path.join(root, '.claude', 'groundwork-state', 'sessions');
}

// Cache resolved values for the session
let _cachedProjectRoot = null;
let _cachedConfig = null;
let _cachedConfigPath = null;

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
 * @returns {string|null} Session ID, or null if not available
 */
function getSessionId() {
  return process.env.GROUNDWORK_SESSION_ID || null;
}

/**
 * Get the file path for a session state file.
 *
 * @param {string} sessionId - Session ID from getSessionId()
 * @returns {string} Absolute path to session JSON file
 */
function getSessionFilePath(sessionId) {
  return path.join(getSessionsDir(), `${sessionId}.json`);
}

/**
 * Write a session file with the current project selection.
 *
 * @param {string} sessionId - Session ID
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 */
function persistSessionSelection(sessionId, projectName, projectPath) {
  try {
    const sessionsDir = getSessionsDir();
    fs.mkdirSync(sessionsDir, { recursive: true });
    const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
    const data = {
      project: projectName,
      root: projectPath,
      repoRoot,
      timestamp: Math.floor(Date.now() / 1000),
      sessionId
    };
    fs.writeFileSync(getSessionFilePath(sessionId), JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    if (process.env.GROUNDWORK_DEBUG) {
      console.error(`[project-context] Error writing session file: ${error.message}`);
    }
  }
}

/**
 * Read a session file for the given session ID.
 *
 * @param {string} sessionId - Session ID
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restoreSessionSelection(sessionId) {
  try {
    const filePath = getSessionFilePath(sessionId);
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
 * Scan all session files and return the most recently used one for this repo.
 *
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restoreMostRecentSession() {
  try {
    const sessionsDir = getSessionsDir();
    if (!fs.existsSync(sessionsDir)) return null;

    const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    let best = null;
    let bestTimestamp = 0;

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(sessionsDir, file), 'utf8');
        const data = JSON.parse(raw);
        if (data.repoRoot === repoRoot && data.timestamp > bestTimestamp && data.project && data.root) {
          if (fs.existsSync(data.root)) {
            best = { projectName: data.project, projectPath: data.root };
            bestTimestamp = data.timestamp;
          }
        }
      } catch {
        // Skip corrupt files
      }
    }

    return best;
  } catch {
    return null;
  }
}

/**
 * Remove session files older than 24 hours, keeping the most recent per repo.
 */
function cleanupStaleSessions() {
  try {
    const sessionsDir = getSessionsDir();
    if (!fs.existsSync(sessionsDir)) return;

    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    const newestPerRepo = {};

    // First pass: find the newest session per repoRoot
    for (const file of files) {
      try {
        const filePath = path.join(sessionsDir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        const repo = data.repoRoot || '';
        if (!newestPerRepo[repo] || data.timestamp > newestPerRepo[repo].timestamp) {
          newestPerRepo[repo] = { file, timestamp: data.timestamp };
        }
      } catch {
        // Skip corrupt files
      }
    }

    const protectedFiles = new Set(Object.values(newestPerRepo).map(v => v.file));

    // Second pass: remove stale files that aren't the newest for their repo
    for (const file of files) {
      if (protectedFiles.has(file)) continue;
      try {
        const filePath = path.join(sessionsDir, file);
        const raw = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data.timestamp < cutoff) {
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
 * Persist the project selection to the session file.
 *
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 * @param {string} [sessionId] - Session ID (auto-detected if omitted)
 */
function persistSelection(projectName, projectPath, sessionId) {
  const sid = sessionId || getSessionId();
  if (sid) {
    persistSessionSelection(sid, projectName, projectPath);
  }
}

/**
 * Restore project selection using the fallback chain:
 * 1. Session file for current session
 * 2. Most recent session file for this repo
 * 3. One-time migration from .groundwork.local
 * 4. Returns null (caller falls through to CWD detection)
 *
 * @param {string} [sessionId] - Session ID (auto-detected if omitted)
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restoreSelection(sessionId) {
  const sid = sessionId || getSessionId();

  // 1. Session file for current session
  if (sid) {
    const sessionResult = restoreSessionSelection(sid);
    if (sessionResult) return sessionResult;
  }

  // 2. Most recent session file for this repo
  const recentResult = restoreMostRecentSession();
  if (recentResult) {
    // If we have a session ID, persist to create a session file for this session
    if (sid) {
      persistSessionSelection(sid, recentResult.projectName, recentResult.projectPath);
    }
    return recentResult;
  }

  // 3. One-time migration from .groundwork.local
  try {
    const stateFile = getStateFilePath();
    const projectName = fs.readFileSync(stateFile, 'utf8').trim();
    if (projectName) {
      const configResult = loadConfig();
      if (configResult && configResult.config.projects[projectName]) {
        const repoRoot = getRepoRoot() || process.cwd();
        const projectPath = path.resolve(repoRoot, configResult.config.projects[projectName].path);
        if (fs.existsSync(projectPath)) {
          // Migrate: create session file from .groundwork.local
          if (sid) {
            persistSessionSelection(sid, projectName, projectPath);
          }
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
  getSessionFilePath,
  persistSessionSelection,
  restoreSessionSelection,
  restoreMostRecentSession,
  cleanupStaleSessions,
  persistSelection,
  restoreSelection,
  clearCache,
  getStateFilePath
};
