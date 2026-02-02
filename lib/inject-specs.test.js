#!/usr/bin/env node
/**
 * Unit tests for inject-specs.js
 *
 * Tests the extraction functions for features, NFRs, and decisions.
 * Run with: node lib/inject-specs.test.js
 */

const assert = require('assert');
const {
  extractFeatures,
  extractNFRs,
  extractDecisions,
  formatAsMarkdown
} = require('./inject-specs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  ${err.message}`);
    failed++;
  }
}

// ============================================
// extractFeatures tests
// ============================================

test('extractFeatures: handles FEAT-XXX: Name format', () => {
  const content = `# FEAT-001: User Authentication
Some description here.

# FEAT-002: Password Reset
More content.`;

  const features = extractFeatures(content, ['specs/product_specs.md'], '/project');
  assert.strictEqual(features.length, 2);
  assert.strictEqual(features[0].code, '001');
  assert.strictEqual(features[0].name, 'User Authentication');
  assert.strictEqual(features[1].code, '002');
  assert.strictEqual(features[1].name, 'Password Reset');
});

test('extractFeatures: handles Feature Name (FEAT-XXX) format', () => {
  const content = `## User Login (FEAT-AUTH)
Description here.

### Session Management (FEAT-SESSION)
More content.`;

  const features = extractFeatures(content, ['specs/prd.md'], '/project');
  assert.strictEqual(features.length, 2);
  assert.strictEqual(features[0].code, 'AUTH');
  assert.strictEqual(features[0].name, 'User Login');
  assert.strictEqual(features[1].code, 'SESSION');
  assert.strictEqual(features[1].name, 'Session Management');
});

test('extractFeatures: handles FEAT_XXX underscore format', () => {
  const content = `# FEAT_LOGIN: Login Feature
Description.`;

  const features = extractFeatures(content, ['specs/prd.md'], '/project');
  assert.strictEqual(features.length, 1);
  assert.strictEqual(features[0].code, 'LOGIN');
  assert.strictEqual(features[0].name, 'Login Feature');
});

test('extractFeatures: handles simple CODE: Description format', () => {
  const content = `# AUTH: User Authentication System
Description here.

# BILLING: Payment Processing
More content.`;

  const features = extractFeatures(content, ['specs/prd.md'], '/project');
  assert.strictEqual(features.length, 2);
  assert.strictEqual(features[0].code, 'AUTH');
  assert.strictEqual(features[0].name, 'User Authentication System');
  assert.strictEqual(features[1].code, 'BILLING');
  assert.strictEqual(features[1].name, 'Payment Processing');
});

test('extractFeatures: skips reserved keywords', () => {
  const content = `# NFR: Non-Functional Requirements
Should be skipped.

# AUTH: User Authentication
Should be included.

# TODO: Fix this later
Should be skipped.`;

  const features = extractFeatures(content, ['specs/prd.md'], '/project');
  assert.strictEqual(features.length, 1);
  assert.strictEqual(features[0].code, 'AUTH');
});

test('extractFeatures: returns empty array for null content', () => {
  const features = extractFeatures(null, [], '/project');
  assert.strictEqual(features.length, 0);
});

test('extractFeatures: returns empty array for empty content', () => {
  const features = extractFeatures('', [], '/project');
  assert.strictEqual(features.length, 0);
});

test('extractFeatures: returns empty array for content without features', () => {
  const content = `# Introduction
This is a product document without feature definitions.

## Overview
Just regular content here.`;

  const features = extractFeatures(content, ['specs/prd.md'], '/project');
  assert.strictEqual(features.length, 0);
});

// ============================================
// extractNFRs tests
// ============================================

test('extractNFRs: handles NFR-XXX: Name format', () => {
  const content = `## NFR-PERF: Response time under 200ms
Details here.

## NFR-SECURITY: All data encrypted at rest
More details.`;

  const nfrs = extractNFRs(content);
  assert.strictEqual(nfrs.length, 2);
  assert.strictEqual(nfrs[0].code, 'NFR-PERF');
  assert.strictEqual(nfrs[0].summary, 'Response time under 200ms');
  assert.strictEqual(nfrs[1].code, 'NFR-SECURITY');
  assert.strictEqual(nfrs[1].summary, 'All data encrypted at rest');
});

test('extractNFRs: handles NFR_XXX underscore format', () => {
  const content = `### NFR_AVAIL: 99.9% uptime SLA
Details here.`;

  const nfrs = extractNFRs(content);
  assert.strictEqual(nfrs.length, 1);
  assert.strictEqual(nfrs[0].code, 'NFR-AVAIL');
  assert.strictEqual(nfrs[0].summary, '99.9% uptime SLA');
});

test('extractNFRs: handles NFR with numbers', () => {
  const content = `## NFR-001: First requirement
## NFR-002: Second requirement`;

  const nfrs = extractNFRs(content);
  assert.strictEqual(nfrs.length, 2);
  assert.strictEqual(nfrs[0].code, 'NFR-001');
  assert.strictEqual(nfrs[1].code, 'NFR-002');
});

test('extractNFRs: returns empty array for null content', () => {
  const nfrs = extractNFRs(null);
  assert.strictEqual(nfrs.length, 0);
});

test('extractNFRs: returns empty array for content without NFRs', () => {
  const content = `# Product Requirements
No NFRs here.`;

  const nfrs = extractNFRs(content);
  assert.strictEqual(nfrs.length, 0);
});

// ============================================
// extractDecisions tests
// ============================================

test('extractDecisions: handles DR-NNN: Title format', () => {
  const content = `## DR-001: Use PostgreSQL for data storage
Rationale here.

## DR-002: Adopt microservices architecture
More rationale.`;

  const decisions = extractDecisions(content, ['specs/architecture.md'], '/project');
  assert.strictEqual(decisions.length, 2);
  assert.strictEqual(decisions[0].id, 'DR-001');
  assert.strictEqual(decisions[0].title, 'Use PostgreSQL for data storage');
  assert.strictEqual(decisions[1].id, 'DR-002');
  assert.strictEqual(decisions[1].title, 'Adopt microservices architecture');
});

test('extractDecisions: handles ADR-NNN: Title format', () => {
  const content = `### ADR-001: Choose React for frontend
Details here.

### ADR-002: Use JWT for authentication
More details.`;

  const decisions = extractDecisions(content, ['specs/arch.md'], '/project');
  assert.strictEqual(decisions.length, 2);
  assert.strictEqual(decisions[0].id, 'ADR-001');
  assert.strictEqual(decisions[0].title, 'Choose React for frontend');
  assert.strictEqual(decisions[1].id, 'ADR-002');
  assert.strictEqual(decisions[1].title, 'Use JWT for authentication');
});

test('extractDecisions: handles DR_NNN underscore format', () => {
  const content = `## DR_001: Use TypeScript
Details.`;

  const decisions = extractDecisions(content, ['specs/arch.md'], '/project');
  assert.strictEqual(decisions.length, 1);
  assert.strictEqual(decisions[0].id, 'DR-001');
});

test('extractDecisions: returns empty array for null content', () => {
  const decisions = extractDecisions(null, [], '/project');
  assert.strictEqual(decisions.length, 0);
});

test('extractDecisions: returns empty array for content without decisions', () => {
  const content = `# Architecture Overview
No decision records here.`;

  const decisions = extractDecisions(content, ['specs/arch.md'], '/project');
  assert.strictEqual(decisions.length, 0);
});

// ============================================
// formatAsMarkdown tests
// ============================================

test('formatAsMarkdown: formats features correctly', () => {
  const data = {
    features: [
      { code: 'AUTH', name: 'User Authentication', file: 'specs/prd.md' }
    ],
    nfrs: [],
    decisions: []
  };

  const result = formatAsMarkdown(data);
  assert(result.includes('## Features'));
  assert(result.includes('| AUTH | User Authentication | specs/prd.md |'));
});

test('formatAsMarkdown: formats NFRs correctly', () => {
  const data = {
    features: [],
    nfrs: [
      { code: 'NFR-PERF', summary: 'Fast response times' }
    ],
    decisions: []
  };

  const result = formatAsMarkdown(data);
  assert(result.includes('## Non-Functional Requirements'));
  assert(result.includes('- **NFR-PERF**: Fast response times'));
});

test('formatAsMarkdown: formats decisions correctly', () => {
  const data = {
    features: [],
    nfrs: [],
    decisions: [
      { id: 'DR-001', title: 'Use PostgreSQL', file: 'specs/arch.md' }
    ]
  };

  const result = formatAsMarkdown(data);
  assert(result.includes('## Architectural Decisions'));
  assert(result.includes('| DR-001 | Use PostgreSQL | specs/arch.md |'));
});

test('formatAsMarkdown: includes usage guidance when content exists', () => {
  const data = {
    features: [{ code: 'AUTH', name: 'Auth', file: 'specs/prd.md' }],
    nfrs: [],
    decisions: []
  };

  const result = formatAsMarkdown(data);
  assert(result.includes('**Usage**:'));
});

test('formatAsMarkdown: returns empty string for no data', () => {
  const data = {
    features: [],
    nfrs: [],
    decisions: []
  };

  const result = formatAsMarkdown(data);
  assert.strictEqual(result, '');
});

test('formatAsMarkdown: combines all sections', () => {
  const data = {
    features: [{ code: 'AUTH', name: 'Authentication', file: 'prd.md' }],
    nfrs: [{ code: 'NFR-PERF', summary: 'Fast' }],
    decisions: [{ id: 'DR-001', title: 'Use PostgreSQL', file: 'arch.md' }]
  };

  const result = formatAsMarkdown(data);
  assert(result.includes('## Features'));
  assert(result.includes('## Non-Functional Requirements'));
  assert(result.includes('## Architectural Decisions'));
  assert(result.includes('**Usage**:'));
});

// ============================================
// Size limit tests
// ============================================

test('formatAsMarkdown: handles large feature lists', () => {
  const features = [];
  for (let i = 0; i < 100; i++) {
    features.push({
      code: `FEAT-${String(i).padStart(3, '0')}`,
      name: `Feature number ${i} with a longer description`,
      file: 'specs/product_specs.md'
    });
  }

  const data = { features, nfrs: [], decisions: [] };
  const result = formatAsMarkdown(data);

  // Should include all features - truncation is handled by injectSpecs, not formatAsMarkdown
  assert(result.includes('FEAT-000'));
  assert(result.includes('FEAT-099'));
});

// ============================================
// Summary
// ============================================

console.log('\n---');
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);

process.exit(failed > 0 ? 1 : 0);
