'use strict';

/**
 * Testable, dependency-free core for the Pi extension's project context.
 *
 * Mirrors the canonical lib/project-context.js semantics:
 *   - parses the canonical mapping-style .groundwork.yml schema
 *     (version / projects / <name> / path) — the list-style "- name:" schema
 *     is not the canonical mapping and is rejected;
 *   - every binding is absolute and invariant to the caller's directory;
 *   - project paths are containment-checked (lexically and after realpath);
 *   - a configured monorepo without a selection reports selection_required,
 *     while a no-config single-project repository resolves outright.
 *
 * Kept as plain CommonJS JavaScript so tests run without a TypeScript
 * compiler and the installer ships it verbatim.
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse the canonical .groundwork.yml mapping schema.
 *
 * @param {string} content - File content
 * @returns {{version: number, projects: Record<string, {path: string}>}|null}
 *   Parsed config, or null when the content is not a canonical mapping.
 */
function parseGroundworkYml(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    const result = { version: 1, projects: {} };
    const lines = content.split('\n');
    let inProjects = false;
    let currentProject = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const versionMatch = trimmed.match(/^version:\s*(\d+)$/);
      if (versionMatch) {
        result.version = parseInt(versionMatch[1], 10);
        continue;
      }

      if (trimmed === 'projects:') {
        inProjects = true;
        continue;
      }
      if (!inProjects) continue;
      if (/^\S/.test(line)) break; // End of the projects block.

      // List-style entries ("- name: web") are not the canonical mapping.
      if (/^\s*-\s/.test(line)) return null;

      const projectMatch = line.match(/^\s+([A-Za-z0-9][A-Za-z0-9_-]*):\s*$/);
      if (projectMatch) {
        currentProject = projectMatch[1];
        result.projects[currentProject] = {};
        continue;
      }

      if (currentProject) {
        const propMatch = line.match(/^\s+(\w+):\s*(.+)$/);
        if (propMatch) {
          result.projects[currentProject][propMatch[1]] = propMatch[2].trim();
        }
      }
    }

    const names = Object.keys(result.projects);
    if (names.length === 0) return null;
    for (const name of names) {
      if (!result.projects[name].path) return null;
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Find the repository root from a directory: nearest ancestor carrying
 * .groundwork.yml or a .git directory.
 *
 * @param {string} cwd - Starting directory
 * @returns {string} Resolved root (falls back to the resolved cwd)
 */
function findRepoRoot(cwd) {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;
  for (;;) {
    if (fs.existsSync(path.join(dir, '.groundwork.yml'))
        || fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    if (dir === root) return path.resolve(cwd);
    dir = path.dirname(dir);
  }
}

function isContained(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function bindings(projectName, projectRoot) {
  return {
    ok: true,
    project_name: projectName,
    project_root: path.resolve(projectRoot),
    specs_dir: path.join(projectRoot, 'specs'),
    plans_dir: path.join(projectRoot, '.groundwork-plans'),
    debug_dir: path.join(projectRoot, '.debug'),
    research_dir: path.join(projectRoot, '.architecture'),
  };
}

/**
 * Resolve the Groundwork project context for a working directory.
 *
 * @param {string} cwd - Current working directory
 * @param {string|null} [selectedProject] - Selected project name (mapping key)
 * @returns {object} Absolute bindings with ok:true and selection_required
 *   flag, or {ok: false, reason} for invalid/missing/escaping selections.
 */
function resolveProjectContext(cwd, selectedProject) {
  const root = findRepoRoot(cwd);
  const configPath = path.join(root, '.groundwork.yml');
  let config = null;
  try {
    config = parseGroundworkYml(fs.readFileSync(configPath, 'utf8'));
  } catch {
    config = null;
  }

  if (!config) {
    // No-config single-project repository: resolve outright.
    return { ...bindings('', root), selection_required: false };
  }

  if (!selectedProject) {
    // A configured monorepo without a verified selection: the caller must
    // select (the selector lists the canonical mapping keys).
    return { ...bindings('', root), selection_required: true };
  }

  const project = config.projects[selectedProject];
  if (!project) {
    return { ok: false, reason: `Project "${selectedProject}" not found in .groundwork.yml` };
  }
  const projectRoot = path.resolve(root, project.path);
  if (!isContained(root, projectRoot)) {
    return { ok: false, reason: `Project path is outside repository: ${projectRoot}` };
  }
  if (!fs.existsSync(projectRoot)) {
    return { ok: false, reason: `Project path does not exist: ${projectRoot}` };
  }
  try {
    const realRoot = fs.realpathSync(root);
    const realProject = fs.realpathSync(projectRoot);
    if (!isContained(realRoot, realProject)) {
      return { ok: false, reason: `Project path is outside repository: ${projectRoot}` };
    }
  } catch (error) {
    return { ok: false, reason: `Project path is not readable: ${error.message}` };
  }
  return { ...bindings(selectedProject, projectRoot), selection_required: false };
}

/**
 * List the canonical mapping keys for the selector UI.
 *
 * @param {string} cwd - Any directory inside the repository
 * @returns {Array<{name: string, path: string}>}
 */
function listProjects(cwd) {
  const root = findRepoRoot(cwd);
  try {
    const config = parseGroundworkYml(fs.readFileSync(path.join(root, '.groundwork.yml'), 'utf8'));
    if (!config) return [];
    return Object.entries(config.projects).map(([name, project]) => ({
      name,
      path: project.path,
    }));
  } catch {
    return [];
  }
}

module.exports = { parseGroundworkYml, findRepoRoot, resolveProjectContext, listProjects };
