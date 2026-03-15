/**
 * Project context resolution for monorepo support.
 *
 * Resolves the active project root directory for specs I/O.
 * In single-project repos, this is simply process.cwd().
 * In monorepos with .groundwork.yml, this resolves to the selected project's path.
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
 * Get the hash for the current repo (used for per-repo state files).
 *
 * @returns {string} Hash string
 */
function getRepoHash() {
  const root = getRepoRoot() || process.cwd();
  // Simple hash: use last path component + length as a quick identifier
  const basename = path.basename(root);
  let hash = 0;
  for (let i = 0; i < root.length; i++) {
    const char = root.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return `${basename}-${Math.abs(hash).toString(36)}`;
}

/**
 * Get the state file path for persisting project selection.
 *
 * @returns {string} Path to the state file
 */
function getStateFilePath() {
  const stateDir = path.join(process.env.HOME || '', '.claude', 'groundwork-state');
  return path.join(stateDir, `${getRepoHash()}-project.txt`);
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
 * Persist the project selection to the state file.
 *
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 */
function persistSelection(projectName, projectPath) {
  try {
    const stateFile = getStateFilePath();
    const stateDir = path.dirname(stateFile);
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }
    fs.writeFileSync(stateFile, `${projectName}\n${projectPath}`, 'utf8');
  } catch (error) {
    if (process.env.GROUNDWORK_DEBUG) {
      console.error(`[project-context] Error persisting selection: ${error.message}`);
    }
  }
}

/**
 * Restore project selection from the state file.
 *
 * @returns {{projectName: string, projectPath: string}|null}
 */
function restoreSelection() {
  try {
    const stateFile = getStateFilePath();
    const content = fs.readFileSync(stateFile, 'utf8');
    const [projectName, projectPath] = content.trim().split('\n');
    if (projectName && projectPath && fs.existsSync(projectPath)) {
      return { projectName, projectPath };
    }
  } catch {
    // No saved state
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
  getRepoHash,
  persistSelection,
  restoreSelection,
  clearCache,
  getStateFilePath
};
