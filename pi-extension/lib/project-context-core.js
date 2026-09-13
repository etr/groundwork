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
 * Parse and classify the canonical .groundwork.yml mapping schema.
 *
 * @param {string} content - File content
 * @returns {{ok: boolean, config?: object, code?: string, message?: string}}
 *   {ok:true, config} for the canonical mapping; {ok:false, code, message}
 *   with a typed code (empty-config, malformed-yaml, unsupported-version,
 *   missing-project-path, escaping-project-path) otherwise.
 */
function parseGroundworkYmlResult(content) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return { ok: false, code: 'empty-config', message: '.groundwork.yml is empty' };
  }
  const result = { version: 1, projects: {} };
  let inProjects = false;
  let currentProject = null;
  let sawListEntry = false;
  let sawVersion = false;

  // The canonical mapping grammar is exact (mirrors lib/project-context.js):
  // any line that is not one of its productions is malformed — never
  // silently ignored, so every consumer interprets the same config the
  // same way. Exactly one unindented `version:` line must precede exactly
  // one `projects:` line; project keys and path properties are unique.
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

    if (inProjects) {
      // List-style entries ("- name: web") are not the canonical mapping.
      if (/^\s*-\s/.test(line)) {
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
      inProjects = true;
      continue;
    }

    return malformed(lineNumber, line);
  }

  if (!sawVersion || !inProjects) {
    return {
      ok: false,
      code: 'malformed-yaml',
      message: '.groundwork.yml must contain exactly one "version: 1" line followed by one "projects:" mapping'
        + `${sawVersion ? '' : ' (version: is missing)'}${inProjects ? '' : ' (projects: is missing)'}`,
    };
  }

  if (result.version !== 1) {
    return { ok: false, code: 'unsupported-version', message: `unsupported .groundwork.yml version ${result.version} (expected 1)` };
  }
  const names = Object.keys(result.projects);
  if (sawListEntry || names.length === 0) {
    return { ok: false, code: 'malformed-yaml', message: '.groundwork.yml is not the canonical mapping schema (version/projects/<name>/path)' };
  }
  for (const name of names) {
    const project = result.projects[name];
    if (!project.path) {
      return { ok: false, code: 'missing-project-path', message: `project "${name}" is missing its path` };
    }
    if (path.isAbsolute(project.path) || project.path.split(/[\\/]/).includes('..')) {
      return { ok: false, code: 'escaping-project-path', message: `project "${name}" path is outside repository: ${project.path}` };
    }
  }
  return { ok: true, config: result };
}

/**
 * Parse the canonical .groundwork.yml mapping schema (legacy shape).
 *
 * @param {string} content - File content
 * @returns {{version: number, projects: Record<string, {path: string}>}|null}
 *   Parsed config, or null when the content is not a canonical mapping.
 */
function parseGroundworkYml(content) {
  const result = parseGroundworkYmlResult(content);
  return result.ok ? result.config : null;
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
 * Validate that configured project roots map to disjoint filesystem trees
 * (mirrors lib/project-context.js): duplicate or ancestor/descendant roots —
 * including symlink/realpath aliases — would receive different leases while
 * targeting overlapping trees.
 */
function validateProjectMapping(config, repoRoot) {
  const overlap = (message) => ({ ok: false, code: 'overlapping-project-path', message });
  const unreadable = (message) => ({ ok: false, code: 'unreadable-project-path', message });
  const names = Object.keys(config.projects);
  const lexical = new Map(names.map((name) => [name, path.resolve(repoRoot, config.projects[name].path)]));
  const real = new Map();
  let realRepoRoot;
  try {
    realRepoRoot = fs.realpathSync(repoRoot);
  } catch (error) {
    return unreadable(`the repository root cannot be resolved: ${repoRoot} (${error.message})`);
  }
  for (const name of names) {
    try {
      const realPath = fs.realpathSync(lexical.get(name));
      const relative = path.relative(realRepoRoot, realPath);
      if (relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) {
        return overlap(`project "${name}" realpath escapes the repository: ${realPath}`);
      }
      real.set(name, realPath);
    } catch (error) {
      // Only a genuinely missing path may pass unrealpathed; permission or
      // other failures fail closed — silently skipping them could alias a
      // readable tree through an unreadable one.
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') {
        return unreadable(`project "${name}" root cannot be resolved: ${lexical.get(name)} (${error.message})`);
      }
    }
  }
  // TWO independent pairwise passes, each bidirectional:
  //   1. lexical paths — the directory namespace each project name occupies;
  //      a parent owner can rename/replace a child's path component even
  //      when the child resolves through a symlink to a disjoint tree.
  //   2. realpaths (where they exist) — physical aliasing via symlinks.
  // Either pass alone is bypassable; only both together close the contract.
  const strictlyNested = (from, to) => {
    const relative = path.relative(from, to);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
  };
  const checkPairs = (paths, label) => {
    const present = [...paths.keys()];
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = paths.get(present[i]);
        const b = paths.get(present[j]);
        if (strictlyNested(a, b) || strictlyNested(b, a)) {
          return overlap(
            `projects "${present[i]}" (${a}) and "${present[j]}" (${b}) target overlapping ${label} trees`
              + ' — distinct project names must map to disjoint directories (checked lexically and after realpath, in both orders)'
          );
        }
      }
    }
    return null;
  };
  return checkPairs(lexical, 'lexical')
    || checkPairs(real, 'realpath-resolved')
    || { ok: true };
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

  let content = null;
  let configExists = false;
  try {
    content = fs.readFileSync(configPath, 'utf8');
    configExists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // Present but unreadable: fail closed with the typed shape.
      return { ok: false, code: 'unreadable-config', reason: error.message, message: `.groundwork.yml cannot be read: ${error.message}` };
    }
  }

  if (!configExists) {
    // No-config single-project repository: resolve outright.
    return { ...bindings('', root), selection_required: false };
  }

  const parsed = parseGroundworkYmlResult(content);
  if (!parsed.ok) {
    // A present-but-invalid config never degrades to single-project.
    return { ok: false, code: parsed.code, reason: parsed.message, message: parsed.message };
  }
  const config = parsed.config;
  const tree = validateProjectMapping(config, root);
  if (!tree.ok) {
    return { ok: false, code: tree.code, reason: tree.message, message: tree.message };
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

module.exports = { parseGroundworkYml, parseGroundworkYmlResult, findRepoRoot, resolveProjectContext, listProjects };
