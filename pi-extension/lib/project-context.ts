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

const { piApply } = require("./selection-ui");

/** Raw core result: resolved bindings, or a typed {ok:false, code, message} failure. */
export type ProjectContextResult = {
  ok: true;
  project_root: string;
  project_name?: string;
  specs_dir: string;
  plans_dir: string;
  debug_dir: string;
  research_dir: string;
  selection_required: boolean;
} | { ok: false; code?: string; reason?: string; message?: string };

/** Resolve the raw core result (canonical semantics, failures included). */
export function resolveProjectContextResult(
  cwd: string,
  selectedProject?: string,
): ProjectContextResult {
  return core.resolveProjectContext(cwd, selectedProject);
}

/** Map a resolved core result to the extension's ProjectContext shape. */
function toProjectContext(resolved: any): ProjectContext {
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

/**
 * Resolve and apply in one step: a typed failure keeps `previous` as the
 * active context and returns one actionable message for the UI; a success
 * returns the fresh context and no message.
 */
export function applyProjectContext(
  cwd: string,
  previous: ProjectContext,
  selectedProject?: string,
): { context: ProjectContext; message: string | null } {
  const applied = piApply(core.resolveProjectContext(cwd, selectedProject), null);
  if (applied.message) return { context: previous, message: applied.message };
  return { context: toProjectContext(applied.context), message: null };
}

/** List selectable projects (canonical mapping keys) for the selector UI. */
export function listProjects(cwd: string): Array<{ name: string; path: string }> {
  return core.listProjects(cwd);
}
