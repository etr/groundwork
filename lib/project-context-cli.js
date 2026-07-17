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
  if (!['claude', 'codex', 'opencode', 'kiro', 'pi'].includes(harness)) {
    throw new Error(`Unsupported harness: ${harness}`);
  }

  return { command, projectName, harness };
}

function bindings(projectName, projectPath, stateFile) {
  const context = require('./project-context');
  const repoRoot = context.getRepoRoot() || process.cwd();
  return {
    harness: context.getHarness(),
    project_name: projectName,
    project_root: path.relative(repoRoot, projectPath) || '.',
    specs_dir: path.join(path.relative(repoRoot, projectPath), 'specs'),
    selection_required: false,
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
  if (!configResult) throw new Error('No .groundwork.yml found');

  const repoRoot = context.getRepoRoot() || process.cwd();
  const paneKey = context.getPaneKey();
  const stateRepoRoot = context.getMainRepoRoot() || repoRoot;
  const stateFile = context.getPaneFilePath(paneKey, stateRepoRoot);

  if (command === 'select') {
    const projectPath = resolveConfiguredProject(repoRoot, configResult.config, projectName);
    context.persistSelection(projectName, projectPath);
    console.log(JSON.stringify(bindings(projectName, projectPath, stateFile)));
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
    console.log(JSON.stringify({
      harness,
      project_name: '',
      project_root: '.',
      specs_dir: 'specs',
      selection_required: true,
      state_file: stateFile,
    }));
    return;
  }

  console.log(JSON.stringify(bindings(validated.projectName, validated.projectPath, stateFile)));
}

try {
  main();
} catch (error) {
  console.error(`project-context error: ${error.message}`);
  process.exit(1);
}
