'use strict';

// The wire contract and persistence share one vocabulary. Missing legacy
// values demand work; prose and an overall approval never close a finding.
const CLOSED_DISPOSITIONS = new Set(['resolved', 'approved', 'fixed', 'closure-observation']);
function findingDisposition(value, { required = false, id = 'finding' } = {}) {
  if (value === undefined && !required) return 'actionable';
  if (typeof value !== 'string' || !value ||
      (value.toLowerCase() !== 'actionable' && !CLOSED_DISPOSITIONS.has(value.toLowerCase()))) {
    throw new Error(`unrecognized disposition "${String(value)}" on ${id}: expected actionable, ${[...CLOSED_DISPOSITIONS].join('|')}${required ? '' : ', or no disposition field'}`);
  }
  return value.toLowerCase();
}
module.exports = { findingDisposition, CLOSED_DISPOSITIONS };
