/**
 * The plugin manifest version must equal the package version.
 *
 * Changesets bump package.json; `.claude-plugin/plugin.json` is what every
 * harness, the marketplace bundle, and the update check read. Without a guard
 * the two diverge silently, and a release ships under the wrong number.
 *
 * Run with: node tests/sync-plugin-version.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const { sync } = require('../lib/sync-plugin-version');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${error.message}`);
    failed++;
  }
}

function fixture(packageJson, pluginJson) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-sync-version-'));
  const packagePath = path.join(dir, 'package.json');
  const pluginPath = path.join(dir, 'plugin.json');
  fs.writeFileSync(packagePath, packageJson);
  fs.writeFileSync(pluginPath, pluginJson);
  return { dir, packagePath, pluginPath };
}

console.log('\nsync-plugin-version');

test('package.json and .claude-plugin/plugin.json carry the same version', () => {
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8')
  ).version;
  const pluginVersion = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')
  ).version;
  assert.strictEqual(
    pluginVersion,
    packageVersion,
    'versions drifted: run `node lib/sync-plugin-version.js` after `changeset version`'
  );
});

test('changesets is set up to version this package at all', () => {
  // The package is private (it is a plugin, not an npm package), and changesets
  // skips private packages unless opted in. Without this key `changeset version`
  // prints "All files have been updated" and changes nothing.
  const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  const config = JSON.parse(
    fs.readFileSync(path.join(PLUGIN_ROOT, '.changeset', 'config.json'), 'utf8')
  );
  assert.strictEqual(pkg.private, true, 'package.json is expected to be private');
  assert.strictEqual(
    config.privatePackages && config.privatePackages.version,
    true,
    '.changeset/config.json must opt in with "privatePackages": { "version": true } or releases bump nothing'
  );
});

test('a version bump rewrites only the version line, leaving all formatting intact', () => {
  const manifest = [
    '{',
    '  "name": "groundwork",',
    '  "keywords": ["skills", "planning"],',
    '  "version": "3.11.0",',
    '  "nested": { "note": "version: is mentioned here" }',
    '}',
    '',
  ].join('\n');
  const { dir, packagePath, pluginPath } = fixture(
    '{\n  "name": "groundwork",\n  "version": "3.12.0"\n}\n',
    manifest
  );
  try {
    const result = sync({ packageJson: packagePath, pluginJson: pluginPath });
    assert.deepStrictEqual(
      { changed: result.changed, version: result.version },
      { changed: true, version: '3.12.0' }
    );
    assert.strictEqual(
      fs.readFileSync(pluginPath, 'utf8'),
      manifest.replace('"version": "3.11.0"', '"version": "3.12.0"'),
      'the manifest changed beyond its version line'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an already-in-sync manifest is left untouched', () => {
  const { dir, packagePath, pluginPath } = fixture(
    '{\n  "version": "3.11.0"\n}\n',
    '{\n  "version": "3.11.0",\n  "name": "groundwork"\n}\n'
  );
  try {
    const result = sync({ packageJson: packagePath, pluginJson: pluginPath });
    assert.strictEqual(result.changed, false);
    assert.strictEqual(
      fs.readFileSync(pluginPath, 'utf8'),
      '{\n  "version": "3.11.0",\n  "name": "groundwork"\n}\n'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a package without a semantic version fails loudly instead of writing garbage', () => {
  const { dir, packagePath, pluginPath } = fixture(
    '{\n  "version": "next"\n}\n',
    '{\n  "version": "3.11.0"\n}\n'
  );
  try {
    assert.throws(() => sync({ packageJson: packagePath, pluginJson: pluginPath }), /semantic "version"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
