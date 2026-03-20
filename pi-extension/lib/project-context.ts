import * as fs from "fs";
import * as path from "path";

/** Project context resolved from the working directory */
export interface ProjectContext {
  root: string;
  specsDir: string;
  name: string;
}

/**
 * Resolve project context from the working directory.
 * Supports monorepo setups via .groundwork.yml.
 *
 * @param cwd - Current working directory
 * @param selectedProject - Optional project name for monorepo selection
 */
export function resolveProjectContext(
  cwd: string,
  selectedProject?: string,
): ProjectContext {
  const root = findProjectRoot(cwd);
  if (!root) {
    return { root: cwd, specsDir: "", name: path.basename(cwd) };
  }

  const config = loadGroundworkConfig(root);
  if (!config) {
    // Single-project mode
    const specsDir = findSpecsDir(root);
    return { root, specsDir, name: path.basename(root) };
  }

  // Monorepo mode — resolve the selected or default project
  const project = selectedProject
    ? config.projects.find((p) => p.name === selectedProject)
    : config.projects.find((p) => p.default) || config.projects[0];

  if (!project) {
    return { root, specsDir: "", name: path.basename(root) };
  }

  const projectRoot = path.resolve(root, project.path || ".");
  const specsDir = project.specsDir
    ? path.resolve(projectRoot, project.specsDir)
    : findSpecsDir(projectRoot);

  return { root: projectRoot, specsDir, name: project.name };
}

/** Find the project root by walking up from cwd looking for markers */
function findProjectRoot(cwd: string): string | null {
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, ".groundwork.yml")) ||
      fs.existsSync(path.join(dir, ".git")) ||
      fs.existsSync(path.join(dir, "product_specs"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

/** Find the specs directory within a project root */
function findSpecsDir(root: string): string {
  const candidates = [
    "product_specs",
    "product-specs",
    "specs",
    ".groundwork/specs",
  ];
  for (const candidate of candidates) {
    const full = path.join(root, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      return full;
    }
  }
  return "";
}

/** Parsed .groundwork.yml configuration */
interface GroundworkConfig {
  projects: Array<{
    name: string;
    path?: string;
    specsDir?: string;
    default?: boolean;
  }>;
}

/** Load and parse .groundwork.yml (minimal YAML parser for known structure) */
function loadGroundworkConfig(root: string): GroundworkConfig | null {
  const configPath = path.join(root, ".groundwork.yml");
  if (!fs.existsSync(configPath)) return null;

  const content = fs.readFileSync(configPath, "utf-8");
  const projects: GroundworkConfig["projects"] = [];
  const lines = content.split("\n");

  let inProjects = false;
  let current: (typeof projects)[0] | null = null;

  for (const line of lines) {
    if (/^projects:/.test(line)) {
      inProjects = true;
      continue;
    }
    if (!inProjects) continue;
    if (/^\S/.test(line) && !/^\s*#/.test(line)) break; // End of projects block

    const nameMatch = line.match(/^\s+-\s+name:\s*(.+)/);
    if (nameMatch) {
      if (current) projects.push(current);
      current = { name: nameMatch[1].trim() };
      continue;
    }

    if (!current) continue;

    const pathMatch = line.match(/^\s+path:\s*(.+)/);
    if (pathMatch) {
      current.path = pathMatch[1].trim();
      continue;
    }

    const specsDirMatch = line.match(/^\s+specs[-_]?dir:\s*(.+)/);
    if (specsDirMatch) {
      current.specsDir = specsDirMatch[1].trim();
      continue;
    }

    const defaultMatch = line.match(/^\s+default:\s*(true|yes)/i);
    if (defaultMatch) {
      current.default = true;
    }
  }

  if (current) projects.push(current);
  return projects.length > 0 ? { projects } : null;
}
