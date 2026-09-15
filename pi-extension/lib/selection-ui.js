'use strict';

// Dependency-free UI-state adapter for project-context results.
//
// The core (project-context-core.js) returns either resolved bindings or a
// typed failure {ok: false, code, message}. A failure must never degrade
// into garbage bindings: the extension keeps the previous context and
// surfaces one actionable message instead.

/**
 * Apply a core resolve result to the extension's UI state.
 *
 * @param {object|null} result - Core resolveProjectContext result
 * @param {object} previous - The previous UI state to retain on failure
 * @returns {{context: object, message: string|null}} Next UI state; message
 *   is non-null only for failures, phrased as an action for the user.
 */
function piApply(result, previous) {
  if (!result || result.ok === false) {
    return { context: previous, message: actionableSelectionMessage(result) };
  }
  return { context: result, message: null };
}

function actionableSelectionMessage(result) {
  const code = (result && result.code) || 'selection-error';
  const detail = (result && (result.message || result.reason)) || 'unknown error';
  return `Groundwork project selection failed (${code}): ${detail} — the previous project context is kept. Fix .groundwork.yml or re-run groundwork-select-project.`;
}

module.exports = { piApply, actionableSelectionMessage };
