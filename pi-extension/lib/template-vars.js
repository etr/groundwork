'use strict';

/**
 * Lowercase Groundwork template variable substitution for the Pi extension.
 *
 * Groundwork skills address artifacts through the lowercase bindings
 * ({{project_root}}, {{project_name}}, {{specs_dir}}, {{plans_dir}},
 * {{debug_dir}}, {{research_dir}}), all absolute. Uppercase spellings are
 * not part of the contract and are deliberately left untouched.
 */

const TEMPLATE_KEYS = [
  'project_root',
  'project_name',
  'specs_dir',
  'plans_dir',
  'debug_dir',
  'research_dir',
];

/**
 * Substitute lowercase template variables in a message body.
 *
 * @param {string} text - Message content
 * @param {object} bindings - Absolute binding values keyed by variable name
 * @returns {string} Content with lowercase placeholders resolved
 */
function applyTemplateVars(text, bindings) {
  if (typeof text !== 'string' || !text.includes('{{')) return text;
  let output = text;
  for (const key of TEMPLATE_KEYS) {
    const value = bindings[key];
    if (typeof value === 'string') {
      output = output.split(`{{${key}}}`).join(value);
    }
  }
  return output;
}

module.exports = { applyTemplateVars, TEMPLATE_KEYS };
