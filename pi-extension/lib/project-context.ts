import * as path from "path";

// The canonical, tested implementation lives in the dependency-free JS core
// (project-context-core.js). This wrapper only adapts it to the extension's
// TypeScript surface; all schema, containment, and binding semantics —
// including selection_required — come from the core so Pi matches the
// canonical lib/project-context.js behavior.
const core = require("./project-context-core");

/** Project context resolved from the working directory */
export interface ProjectContext {
  root: string;
  specsDir: string;
  name: string;
  /** True when a configured monorepo has no verified project selection */
  selectionRequired: boolean;
  /** Absolute bindings used for lowercase template variable substitution */
  bindings: Record<string, string>;
}

/** Resolve project context from the working directory (canonical semantics). */
export function resolveProjectContext(
  cwd: string,
  selectedProject?: string,
): ProjectContext {
  const resolved = core.resolveProjectContext(cwd, selectedProject);
  return {
    root: resolved.project_root,
    specsDir: resolved.specs_dir,
    name: resolved.project_name || path.basename(resolved.project_root),
    selectionRequired: Boolean(resolved.selection_required),
    bindings: {
      project_root: resolved.project_root,
      project_name: resolved.project_name || path.basename(resolved.project_root),
      specs_dir: resolved.specs_dir,
      plans_dir: resolved.plans_dir,
      debug_dir: resolved.debug_dir,
      research_dir: resolved.research_dir,
    },
  };
}

/** List selectable projects (canonical mapping keys) for the selector UI. */
export function listProjects(cwd: string): Array<{ name: string; path: string }> {
  return core.listProjects(cwd);
}
