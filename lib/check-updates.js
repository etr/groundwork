#!/usr/bin/env node

/**
 * Check for Groundwork plugin updates.
 *
 * Throttled to once per day to avoid network delays.
 * Creates a marker file to track last check time.
 *
 * Usage:
 *   node check-updates.js          # Check and output result as JSON
 *   node check-updates.js --force  # Force check, ignoring throttle
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(os.homedir(), '.claude', 'groundwork-state');
const MARKER_FILE = path.join(STATE_DIR, 'last-update-check');
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureStateDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

function shouldCheck(force = false) {
  if (force) return true;

  if (!fs.existsSync(MARKER_FILE)) return true;

  try {
    const lastCheck = parseInt(fs.readFileSync(MARKER_FILE, 'utf8'), 10);
    if (isNaN(lastCheck)) {
      // Corrupted marker file - remove it so next check works
      try { fs.unlinkSync(MARKER_FILE); } catch {}
      return true;
    }
    return Date.now() - lastCheck > CHECK_INTERVAL_MS;
  } catch {
    return true;
  }
}

function updateMarker() {
  ensureStateDir();
  const tempFile = MARKER_FILE + '.tmp.' + process.pid;
  fs.writeFileSync(tempFile, String(Date.now()));
  fs.renameSync(tempFile, MARKER_FILE);
}

function isGitRepo() {
  const gitDir = path.join(PLUGIN_ROOT, '.git');
  return fs.existsSync(gitDir);
}

function checkForUpdates() {
  if (!isGitRepo()) {
    return { available: false, reason: 'not-a-repo' };
  }

  try {
    // Fetch with timeout to avoid blocking
    execSync('git fetch origin', {
      cwd: PLUGIN_ROOT,
      timeout: 5000,
      stdio: 'pipe'
    });

    // Check if we're behind
    const status = execSync('git status --porcelain=v1 --branch', {
      cwd: PLUGIN_ROOT,
      encoding: 'utf8',
      stdio: 'pipe'
    });

    const behindMatch = status.match(/\[.*behind (\d+).*\]/);
    if (behindMatch) {
      return {
        available: true,
        commits_behind: parseInt(behindMatch[1], 10),
        message: `Groundwork plugin has ${behindMatch[1]} update(s) available. Run 'git pull' in the plugin directory to update.`
      };
    }

    return { available: false, reason: 'up-to-date' };
  } catch (error) {
    return { available: false, reason: 'check-failed', error: error.message };
  }
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  if (!shouldCheck(force)) {
    console.log(JSON.stringify({ skipped: true, reason: 'recently-checked' }));
    return;
  }

  const result = checkForUpdates();

  // Only update marker on successful check - allows retry on network failures
  if (result.reason !== 'check-failed') {
    updateMarker();
  }

  console.log(JSON.stringify(result));

  // Exit with code 1 if updates available (for shell scripting)
  if (result.available) {
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { checkForUpdates, shouldCheck, isGitRepo };

// Run if called directly
if (require.main === module) {
  main();
}
