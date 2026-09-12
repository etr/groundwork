#!/usr/bin/env node
/**
 * Portable CLI for selecting and resolving Groundwork monorepo context.
 *
 * Usage:
 *   node project-context-cli.js select <project-name> --harness <target>
 *   node project-context-cli.js resolve --harness <target>
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  let projectName = null;
  let harness = null;

  if (command === 'select' && args[0] && !args[0].startsWith('--')) {
    projectName = args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--harness') harness = args.shift() || null;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!['select', 'resolve'].includes(command)) {
    throw new Error('Usage: project-context-cli.js <select <project-name>|resolve> --harness <target>');
  }
  if (command === 'select' && !projectName) throw new Error('Project name is required');
  if (!harness) throw new Error('--harness is required');
  if (!['claude', 'codex', 'opencode', 'kiro', 'pi', 'zcode'].includes(harness)) {
    throw new Error(`Unsupported harness: ${harness}`);
  }

  return { command, projectName, harness };
}

// Operational bindings are absolute normalized paths, invariant to the
// caller's working directory. Relative values are only ever read from
// historical persisted content, never emitted here.
function bindings(projectName, projectPath, stateFile, selectionSource) {
  const context = require('./project-context');
  const projectRoot = path.resolve(projectPath);
  return {
    harness: context.getHarness(),
    project_name: projectName,
    project_root: projectRoot,
    specs_dir: path.join(projectRoot, 'specs'),
    plans_dir: path.join(projectRoot, '.groundwork-plans'),
    debug_dir: path.join(projectRoot, '.debug'),
    research_dir: path.join(projectRoot, '.architecture'),
    selection_required: false,
    selection_source: selectionSource || '',
    state_file: stateFile,
  };
}

function isContained(repoRoot, candidate) {
  const relative = path.relative(repoRoot, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function resolveConfiguredProject(repoRoot, config, projectName) {
  const project = config.projects[projectName];
  if (!project) throw new Error(`Project "${projectName}" not found in .groundwork.yml`);

  const projectPath = path.resolve(repoRoot, project.path);
  if (!isContained(repoRoot, projectPath)) {
    throw new Error(`Project path is outside repository: ${projectPath}`);
  }
  if (!fs.existsSync(projectPath)) throw new Error(`Project path does not exist: ${projectPath}`);

  const realRepoRoot = fs.realpathSync(repoRoot);
  const realProjectPath = fs.realpathSync(projectPath);
  if (!isContained(realRepoRoot, realProjectPath)) {
    throw new Error(`Project path is outside repository: ${projectPath}`);
  }

  return projectPath;
}

function main() {
  const { command, projectName, harness } = parseArgs(process.argv.slice(2));
  process.env.GROUNDWORK_HARNESS = harness;

  const context = require('./project-context');
  const configResult = context.loadConfig();
  const repoRoot = context.getRepoRoot() || process.cwd();
  const paneKey = context.getPaneKey();
  const stateRepoRoot = context.getMainRepoRoot() || repoRoot;
  const stateFile = context.getPaneFilePath(paneKey, stateRepoRoot);

  if (command === 'select') {
    // Selecting a named project requires a configured monorepo mapping.
    if (!configResult) throw new Error('No .groundwork.yml found');

    const projectPath = resolveConfiguredProject(repoRoot, configResult.config, projectName);
    context.persistSelection(projectName, projectPath);
    console.log(JSON.stringify(bindings(projectName, projectPath, stateFile)));
    return;
  }

  // resolve: a repository without .groundwork.yml is a valid single-project
  // repository. There is nothing to select — bind directly to the detected
  // project root (repository root, or nearest ancestor with specs/).
  if (!configResult) {
    console.log(JSON.stringify(bindings('', context.getProjectRoot(), stateFile)));
    return;
  }

  const saved = context.restoreSelection();
  let validated = null;
  if (saved && configResult.config.projects[saved.projectName]) {
    const configuredPath = resolveConfiguredProject(
      repoRoot,
      configResult.config,
      saved.projectName
    );
    if (path.resolve(saved.projectPath) === configuredPath) validated = saved;
  }
  if (!validated) {
    // A configured monorepo without a verified selection is the only
    // selection_required state; the caller must select (or pass --project).
    console.log(JSON.stringify({
      harness,
      project_name: '',
      project_root: repoRoot,
      specs_dir: path.join(repoRoot, 'specs'),
      plans_dir: path.join(repoRoot, '.groundwork-plans'),
      debug_dir: path.join(repoRoot, '.debug'),
      research_dir: path.join(repoRoot, '.architecture'),
      selection_required: true,
      selection_source: '',
      state_file: stateFile,
    }));
    return;
  }

  console.log(JSON.stringify(bindings(validated.projectName, validated.projectPath, stateFile, validated.source)));
}

try {
  main();
} catch (error) {
  console.error(`project-context error: ${error.message}`);
  process.exit(1);
}
