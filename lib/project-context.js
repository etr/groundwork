/**
 * Project context resolution for monorepo support.
 *
 * Resolves the active project root directory for specs I/O.
 * In single-project repos, this is simply process.cwd() (or the nearest
 * ancestor with specs/). In monorepos with .groundwork.yml, this resolves to
 * the selected project's path. A repository without .groundwork.yml is a
 * valid single-project repository — it resolves without any selection.
 *
 * Path contract: every operational project/artifact binding this module
 * emits (project root, specs, plans, debug, research directories) is an
 * absolute normalized path, invariant to the caller's working directory.
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
const { writeFileSyncAtomic } = require('./atomic-write');

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
 * Typed configuration failure. A .groundwork.yml that exists but is invalid
 * never degrades to single-project resolution — every consumer fails closed
 * with this error instead of emitting bindings from a misunderstood config.
 */
class ProjectConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProjectConfigError';
    this.code = code;
  }
}

/**
 * Parse and classify a .groundwork.yml config file.
 *
 * Returns the full ConfigLoad classification for the content:
 *   { ok: true, config }                                  — valid monorepo
 *   { ok: false, code, message }                          — invalid, fail closed
 *
 * Codes: empty-config, malformed-yaml, unsupported-version,
 * missing-project-path, escaping-project-path.
 *
 * @param {string} content - File content
 * @returns {{ok: boolean, config?: object, code?: string, message?: string}}
 */
function parseConfigResult(content) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return { ok: false, code: 'empty-config', message: '.groundwork.yml is empty' };
  }

  const result = { version: 1, projects: {} };
  let currentProject = null;
  let sawProjects = false;
  let sawListEntry = false;
  let sawVersion = false;

  // The canonical mapping grammar is exact. Any line that is not one of its
  // productions is malformed config — never silently ignored. Otherwise a
  // broken monorepo config could be interpreted differently by each parser
  // that tolerates a different subset of YAML.
  const malformed = (lineNumber, line, detail) => ({
    ok: false,
    code: 'malformed-yaml',
    message: `.groundwork.yml line ${lineNumber}${detail ? ` (${detail})` : ''}: ${JSON.stringify(line)}`,
  });

  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const lineNumber = index + 1;

    if (sawProjects) {
      if (/^\s*-\s/.test(line)) {
        // List-style entries under projects are not the canonical mapping.
        sawListEntry = true;
        continue;
      }
      const projectMatch = line.match(/^  ([A-Za-z0-9][A-Za-z0-9_-]*):\s*$/);
      if (projectMatch) {
        currentProject = projectMatch[1];
        if (Object.hasOwn(result.projects, currentProject)) {
          return malformed(lineNumber, line, 'duplicate project key');
        }
        result.projects[currentProject] = {};
        continue;
      }
      const propMatch = currentProject && line.match(/^    (\w+):\s*(.+)$/);
      if (propMatch) {
        if (propMatch[1] !== 'path') return malformed(lineNumber, line);
        if (result.projects[currentProject].path !== undefined) {
          return malformed(lineNumber, line, 'duplicate path property');
        }
        result.projects[currentProject][propMatch[1]] = propMatch[2].trim();
        continue;
      }
      return malformed(lineNumber, line);
    }

    // Top-level productions must sit at column zero and in canonical order:
    // exactly one `version:` line first, then exactly one `projects:` line.
    if (/^[ \t]/.test(line)) {
      return malformed(lineNumber, line, 'a top-level key must not be indented');
    }
    const versionMatch = trimmed.match(/^version:\s*(\d+)$/);
    if (versionMatch) {
      if (sawVersion) return malformed(lineNumber, line, 'duplicate version line');
      sawVersion = true;
      result.version = parseInt(versionMatch[1], 10);
      continue;
    }

    if (trimmed === 'projects:') {
      if (!sawVersion) return malformed(lineNumber, line, 'projects: appears before version:');
      sawProjects = true;
      continue;
    }

    return malformed(lineNumber, line);
  }

  if (!sawVersion || !sawProjects) {
    return {
      ok: false,
      code: 'malformed-yaml',
      message: '.groundwork.yml must contain exactly one "version: 1" line followed by one "projects:" mapping'
        + `${sawVersion ? '' : ' (version: is missing)'}${sawProjects ? '' : ' (projects: is missing)'}`,
    };
  }

  if (result.version !== 1) {
    return {
      ok: false,
      code: 'unsupported-version',
      message: `unsupported .groundwork.yml version ${result.version} (expected 1)`,
    };
  }
  if (sawListEntry || !sawProjects || Object.keys(result.projects).length === 0) {
    return {
      ok: false,
      code: 'malformed-yaml',
      message: '.groundwork.yml is not the canonical mapping schema (version/projects/<name>/path)',
    };
  }
  for (const [name, project] of Object.entries(result.projects)) {
    if (!project.path) {
      return {
        ok: false,
        code: 'missing-project-path',
        message: `project "${name}" is missing its path`,
      };
    }
    const relative = project.path;
    if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) {
      return {
        ok: false,
        code: 'escaping-project-path',
        message: `project "${name}" path is outside repository: ${relative}`,
      };
    }
  }
  return { ok: true, config: result };
}

/**
 * Parse a .groundwork.yml config file (legacy shape).
 *
 * @param {string} content - File content
 * @returns {object|null} Parsed config or null if invalid
 */
function parseConfig(content) {
  const result = parseConfigResult(content);
  return result.ok ? result.config : null;
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
 * Fail-closed contract: a MISSING config is a valid single-project repository
 * (returns null); a config that exists but is unreadable or invalid throws
 * ProjectConfigError — never a silent fallback to single-project resolution.
 *
 * @param {string} [repoRoot] - Repo root path (auto-detected if omitted)
 * @returns {{config: object, configPath: string}|null}
 * @throws {ProjectConfigError}
 */
/**
 * Validate that the configured project roots map to disjoint filesystem
 * trees. Two project names that resolve to the same directory, or to
 * ancestor/descendant directories (including through symlinks/realpaths),
 * would receive different per-project leases while targeting overlapping
 * trees — a collision the lease layer cannot detect. Roots are checked
 * lexically first, then through realpath when they exist, and every
 * realpath must stay inside the repository.
 *
 * @param {object} config - Parsed canonical mapping ({version, projects})
 * @param {string} repoRoot - Absolute repository root
 * @returns {{ok: true}|{ok: false, code: string, message: string}}
 */
function validateProjectMapping(config, repoRoot) {
  const names = Object.keys(config.projects);
  const lexical = new Map(names.map((name) => [name, path.resolve(repoRoot, config.projects[name].path)]));
  const real = new Map();
  const realRepoRoot = fs.realpathSync(repoRoot);
  for (const name of names) {
    try {
      const realPath = fs.realpathSync(lexical.get(name));
      const relative = path.relative(realRepoRoot, realPath);
      if (relative.startsWith('..' + path.sep) || relative === '..') {
        return {
          ok: false,
          code: 'overlapping-project-path',
          message: `project "${name}" realpath escapes the repository: ${realPath}`,
        };
      }
      real.set(name, realPath);
    } catch {
      // Not on disk yet: the lexical check below still applies.
    }
  }
  const aliasOf = (name) => real.get(name) || lexical.get(name);
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = aliasOf(names[i]);
      const b = aliasOf(names[j]);
      const relative = path.relative(a, b);
      const nested = relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
      if (nested) {
        return {
          ok: false,
          code: 'overlapping-project-path',
          message: `projects "${names[i]}" (${a}) and "${names[j]}" (${b}) target overlapping trees`
            + ' — distinct project names must map to disjoint directories (checked lexically and after realpath)',
        };
      }
    }
  }
  return { ok: true };
}

function loadConfig(repoRoot) {
  if (_cachedConfig !== null) {
    return _cachedConfig ? { config: _cachedConfig, configPath: _cachedConfigPath } : null;
  }

  const root = repoRoot || getRepoRoot() || process.cwd();
  const configPath = path.join(root, '.groundwork.yml');

  let content;
  try {
    content = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      _cachedConfig = false; // Cache the miss
      return null;
    }
    if (error.code === 'EACCES' || error.code === 'EPERM' || error.code === 'EISDIR') {
      throw new ProjectConfigError(
        'unreadable-config',
        `.groundwork.yml at ${configPath} cannot be read: ${error.message}`
      );
    }
    throw error;
  }

  const parsed = parseConfigResult(content);
  if (!parsed.ok) {
    throw new ProjectConfigError(
      parsed.code,
      `.groundwork.yml at ${configPath} is invalid (${parsed.code}): ${parsed.message}`
    );
  }
  const tree = validateProjectMapping(parsed.config, root);
  if (!tree.ok) {
    throw new ProjectConfigError(
      tree.code,
      `.groundwork.yml at ${configPath} is invalid (${tree.code}): ${tree.message}`
    );
  }
  _cachedConfig = parsed.config;
  _cachedConfigPath = configPath;
  return { config: parsed.config, configPath };
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
 * Path contract: the returned binding is an absolute normalized path rooted
 * at getProjectRoot(), invariant to the caller's working directory. Relative
 * values appear only when reading historical persisted content (old plan
 * headers); they are never produced by current writers.
 *
 * @returns {string} Absolute path to the specs dir (e.g., "/repo/specs" or "/repo/apps/web/specs")
 */
function getSpecsDir() {
  return path.join(getProjectRoot(), 'specs');
}

/**
 * Get the resolved plans directory path.
 *
 * Plan files live at <project root>/.groundwork-plans/ so overlapping
 * TASK-NNN identifiers across monorepo projects cannot collide. Absolute and
 * cwd-invariant like getSpecsDir().
 *
 * @returns {string} Absolute path to the plans dir
 */
function getPlansDir() {
  return path.join(getProjectRoot(), '.groundwork-plans');
}

/**
 * Get the resolved debug-journal directory path.
 *
 * Debug journals are keyed on per-project bug slugs, so they live at
 * <project root>/.debug/ — absolute and cwd-invariant like getPlansDir().
 *
 * @returns {string} Absolute path to the debug dir
 */
function getDebugDir() {
  return path.join(getProjectRoot(), '.debug');
}

/**
 * Get the resolved design-research directory path.
 *
 * Swarm architecture research journals are keyed on per-project feature
 * slugs, so they live at <project root>/.architecture/ — absolute and
 * cwd-invariant like getPlansDir().
 *
 * @returns {string} Absolute path to the research dir
 */
function getResearchDir() {
  return path.join(getProjectRoot(), '.architecture');
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
 * Encode a repository root into a filename-safe, collision-free slug.
 *
 * Paths are percent-encoded ('%' first, then '/') so distinct repo roots can
 * never map to one file — the legacy '/':'_' mapping made '/a/b' and '/a_b'
 * collide on a single pane/snapshot file.
 */
function encodeRepoSlug(repoRoot) {
  return path.resolve(repoRoot).replace(/%/g, '%25').replace(/\//g, '%2F');
}

/** Legacy '/':'_' slug — read during the transition only, never written. */
function legacyRepoSlug(repoRoot) {
  return path.resolve(repoRoot).replace(/\//g, '_');
}

/**
 * Compute the pane state file path for (paneKey, repoRoot).
 *
 * The composite filename keeps a single pane's selections isolated per repo,
 * so cd-ing between repos in the same pane doesn't collide.
 *
 * @param {string} paneKey - Pane key from getPaneKey()
 * @param {string} repoRoot - Absolute repo root path
 * @param {object} [options]
 * @param {boolean} [options.legacy=false] - Use the pre-encoding slug form
 * @returns {string} Absolute path to the pane state JSON file
 */
function getPaneFilePath(paneKey, repoRoot, options = {}) {
  const repoSlug = options.legacy ? legacyRepoSlug(repoRoot) : encodeRepoSlug(repoRoot);
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
  writeFileSyncAtomic(getPaneFilePath(paneKey, repoRoot), JSON.stringify(data, null, 2));
}

/**
 * Read and validate one selection-file candidate (pane state or chat
 * snapshot). Shared by both restore paths so the acceptance predicate
 * (project, root, root exists) cannot drift between them.
 *
 * @param {string} filePath - Candidate selection JSON path
 * @returns {{projectName: string, projectPath: string, timestamp: number}|null}
 */
function readSelectionFile(filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.project && data.root && fs.existsSync(data.root)) {
      return {
        projectName: data.project,
        projectPath: data.root,
        timestamp: data.timestamp || 0
      };
    }
  } catch {
    // Missing/unreadable/invalid candidate — try the next slug form.
  }
  return null;
}

/**
 * Read a pane state file for the given (paneKey, repoRoot).
 *
 * @param {string} paneKey - Pane key from getPaneKey()
 * @param {string} repoRoot - Absolute repo root path
 * @returns {{projectName: string, projectPath: string, timestamp: number}|null}
 */
function restorePaneSelection(paneKey, repoRoot) {
  // Try the encoded slug first, then the legacy form written by older
  // versions — reads only; writers always use the encoded form.
  for (const legacy of [false, true]) {
    const found = readSelectionFile(getPaneFilePath(paneKey, repoRoot, { legacy }));
    if (found) return found;
  }
  return null;
}

/**
 * Compute the chat-snapshot file path for (sessionId, repoRoot).
 *
 * @param {string} sessionId - Harness session/chat id
 * @param {string} repoRoot - Absolute repo root path
 * @param {object} [options]
 * @param {boolean} [options.legacy=false] - Use the pre-encoding slug form
 * @returns {string} Absolute path to the snapshot JSON file
 */
function getSnapshotFilePath(sessionId, repoRoot, options = {}) {
  const repoSlug = options.legacy ? legacyRepoSlug(repoRoot) : encodeRepoSlug(repoRoot);
  return path.join(getChatSnapshotsDir(), `${sessionId}__${repoSlug}.json`);
}

/**
 * Write a per-chat selection snapshot. Session snapshots are authoritative
 * for their session: restoreSelection prefers them unconditionally over the
 * shared workspace default, and the only writer paths are a direct selector
 * invocation carrying a stable session id or a hook pinning from a verified
 * selection receipt (see pinSessionSelection). Timestamps exist for cleanup
 * and diagnostics only — never for authorization or arbitration.
 *
 * @param {string} sessionId - Harness session/chat id (filesystem-safe)
 * @param {string} projectName - Name of the selected project
 * @param {string} projectPath - Absolute path to the project
 */
function persistSessionSelection(sessionId, projectName, projectPath) {
  if (!isSafeIdentifier(sessionId)) return;
  const repoRoot = getMainRepoRoot() || getRepoRoot() || process.cwd();
  const dir = getChatSnapshotsDir();
  fs.mkdirSync(dir, { recursive: true });
  writeFileSyncAtomic(getSnapshotFilePath(sessionId, repoRoot), JSON.stringify({
    project: projectName,
    root: projectPath,
    repoRoot,
    sessionId,
    timestamp: Math.floor(Date.now() / 1000)
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Selection receipts
// ---------------------------------------------------------------------------

/** Protocol tag of the selection-receipt contract (see createSelectionReceipt). */
const SELECTION_RECEIPT_PROTOCOL = 'groundwork-project-selection-v1';

/**
 * Filesystem-safe identifier check shared by project names and session ids.
 * Rejects path separators, shell metacharacters, and leading dots.
 */
function isSafeIdentifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

/**
 * Build a selection receipt — the authoritative record that a selector
 * invocation succeeded. Emitted by both selector entry points
 * (project-context-cli.js select and persist-project.js) and consumed by the
 * PostToolUse pin hook, which trusts only a receipt that appears in the
 * current hook invocation's own tool response.
 *
 * @param {object} input
 * @param {string} input.projectName - Selected project name
 * @param {string} input.projectRoot - Absolute project path
 * @param {string} input.repoRoot - Absolute repository path
 * @param {string|null} [input.sessionId] - Selector's session id, if stable
 * @returns {object} Receipt object
 */
function createSelectionReceipt({ projectName, projectRoot, repoRoot, sessionId }) {
  return {
    protocol: SELECTION_RECEIPT_PROTOCOL,
    status: 'selected',
    project_name: projectName,
    project_root: path.resolve(projectRoot),
    repo_root: path.resolve(repoRoot),
    selection_id: crypto.randomBytes(12).toString('hex'),
    ...(sessionId ? { session_id: sessionId } : {}),
  };
}

/**
 * Extract receipt-shaped JSON objects from arbitrary command output text.
 * Balanced-brace scanning keeps embedded strings (braces inside JSON string
 * values) from producing garbage candidates. Returns every parsed object
 * carrying the receipt protocol tag — the caller decides whether exactly one
 * was found.
 *
 * @param {string} text - Tool response text
 * @returns {Array<object>} Parsed receipt candidates
 */
function extractSelectionReceipts(text) {
  if (typeof text !== 'string' || !text.includes('{')) return [];
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  const receipts = [];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && parsed.protocol === SELECTION_RECEIPT_PROTOCOL) {
        receipts.push(parsed);
      }
    } catch {
      // Not JSON — ignore the candidate.
    }
  }
  return receipts;
}

function isContainedBy(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * Validate a selection receipt against the local repository state.
 *
 * Accepted only when: the schema is exact, identifiers are safe, both paths
 * are absolute, the project is contained by the reported repository (lexically
 * and after realpath), the receipt's repository is this repository, the
 * project resolves to the canonical path recorded in .groundwork.yml, and an
 * optional receipt session id matches the caller's session.
 *
 * @param {object} receipt - Parsed receipt candidate
 * @param {object} [options]
 * @param {string|null} [options.sessionId] - Caller's session id, if known
 * @returns {{ok: boolean, reason: string}}
 */
function validateSelectionReceipt(receipt, options = {}) {
  if (!receipt || typeof receipt !== 'object') return { ok: false, reason: 'receipt is not an object' };
  if (receipt.protocol !== SELECTION_RECEIPT_PROTOCOL) {
    return { ok: false, reason: 'unknown receipt protocol' };
  }
  // Exact schema: the six required keys, at most session_id besides them.
  // A merged bindings+receipt object is NOT a receipt — the hook must not
  // pin from an object the selector never minted as a standalone receipt.
  const requiredKeys = ['protocol', 'status', 'project_name', 'project_root', 'repo_root', 'selection_id'];
  const allowedKeys = new Set([...requiredKeys, 'session_id']);
  const receiptKeys = Object.keys(receipt);
  for (const key of requiredKeys) {
    if (!(key in receipt)) return { ok: false, reason: `receipt is missing the required key ${key}` };
  }
  for (const key of receiptKeys) {
    if (!allowedKeys.has(key)) return { ok: false, reason: `receipt carries a surplus key: ${key}` };
  }
  if (receipt.status !== 'selected') {
    return { ok: false, reason: 'receipt is not a successful selection' };
  }
  if (!isSafeIdentifier(receipt.project_name)) {
    return { ok: false, reason: 'receipt project name is not a safe identifier' };
  }
  // selection_id is a 12-byte lowercase hex token minted by the selector.
  if (!/^[0-9a-f]{24}$/.test(String(receipt.selection_id))) {
    return { ok: false, reason: 'receipt selection_id is not a 24-char lowercase hex token' };
  }
  if (receipt.session_id !== undefined && !isSafeIdentifier(receipt.session_id)) {
    return { ok: false, reason: 'receipt session_id is not a safe identifier' };
  }
  if (!path.isAbsolute(String(receipt.project_root)) || !path.isAbsolute(String(receipt.repo_root))) {
    return { ok: false, reason: 'receipt paths must be absolute' };
  }
  if (!isContainedBy(receipt.repo_root, receipt.project_root)) {
    return { ok: false, reason: 'receipt project is outside the reported repository' };
  }
  try {
    const realRepoRoot = fs.realpathSync(receipt.repo_root);
    const realProjectRoot = fs.realpathSync(receipt.project_root);
    if (!isContainedBy(realRepoRoot, realProjectRoot)) {
      return { ok: false, reason: 'receipt project escapes the repository after realpath' };
    }
  } catch {
    return { ok: false, reason: 'receipt paths are not readable' };
  }

  const configResult = loadConfig();
  if (!configResult) return { ok: false, reason: 'no .groundwork.yml mapping to verify against' };
  const configured = configResult.config.projects[receipt.project_name];
  if (!configured) return { ok: false, reason: 'receipt project is not configured in .groundwork.yml' };
  const repoRoot = getRepoRoot() || process.cwd();
  if (path.resolve(receipt.repo_root) !== path.resolve(repoRoot)) {
    return { ok: false, reason: 'receipt repository does not match this repository' };
  }
  const configuredPath = path.resolve(repoRoot, configured.path);
  if (path.resolve(receipt.project_root) !== configuredPath) {
    return { ok: false, reason: 'receipt project path does not match the configured canonical path' };
  }
  if (receipt.session_id && options.sessionId && receipt.session_id !== options.sessionId) {
    return { ok: false, reason: 'receipt belongs to a different session' };
  }
  return { ok: true, reason: '' };
}

/**
 * Pin a session's selection snapshot from a verified receipt. The single
 * sanctioned write path for pane-less hook runtimes: shared pane state is
 * never an input, and an invalid or ambiguous receipt is a no-op.
 *
 * @param {string} sessionId - Hook/session id to pin for
 * @param {object} receipt - Receipt candidate from this hook's tool response
 * @returns {{ok: boolean, reason: string}}
 */
function pinSessionSelection(sessionId, receipt) {
  if (!isSafeIdentifier(sessionId)) return { ok: false, reason: 'session id is not safe' };
  const verdict = validateSelectionReceipt(receipt, { sessionId });
  if (!verdict.ok) return verdict;
  persistSessionSelection(sessionId, receipt.project_name, path.resolve(receipt.project_root));
  return { ok: true, reason: '' };
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
  // Encoded slug first, then the legacy form written by older versions.
  for (const legacy of [false, true]) {
    const found = readSelectionFile(getSnapshotFilePath(sessionId, root, { legacy }));
    if (found) return found;
  }
  return null;
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
  ProjectConfigError,
  getHarness,
  getStateDir,
  getProjectRoot,
  setProjectRoot,
  getSpecsDir,
  getPlansDir,
  getDebugDir,
  getResearchDir,
  getProjectName,
  listProjects,
  detectMonorepo,
  loadConfig,
  validateProjectMapping,
  parseConfig,
  parseConfigResult,
  getRepoRoot,
  getMainRepoRoot,
  getSessionId,
  getPaneKey,
  hasPaneIdentity,
  getPaneFilePath,
  getChatSnapshotsDir,
  getSnapshotFilePath,
  encodeRepoSlug,
  legacyRepoSlug,
  persistPaneSelection,
  restorePaneSelection,
  persistSessionSelection,
  restoreSessionSelection,
  cleanupStalePanes,
  persistSelection,
  restoreSelection,
  SELECTION_RECEIPT_PROTOCOL,
  createSelectionReceipt,
  extractSelectionReceipts,
  validateSelectionReceipt,
  pinSessionSelection,
  clearCache,
  getStateFilePath
};
