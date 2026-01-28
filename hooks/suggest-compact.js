#!/usr/bin/env node
/**
 * Strategic Compact Suggester
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs on PreToolUse to suggest manual compaction at logical intervals
 *
 * Why manual over auto-compact:
 * - Auto-compact happens at arbitrary points, often mid-task
 * - Strategic compacting preserves context through logical phases
 * - Compact after exploration, before execution
 * - Compact after completing a milestone, before starting next
 */

const path = require('path');
const fs = require('fs');
const {
  getTempDir,
  readFile,
  writeFile,
  log
} = require('../lib/utils');

// Clean up old counter files (older than 7 days)
function cleanupOldCounters() {
  try {
    const tempDir = getTempDir();
    const files = fs.readdirSync(tempDir);
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file.startsWith('claude-tool-count-')) {
        const filePath = path.join(tempDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (now - stats.mtimeMs > sevenDays) {
            fs.unlinkSync(filePath);
          }
        } catch (e) {
          // Ignore individual file errors
        }
      }
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

async function main() {
  // Only count write operations - reads don't contribute to context bloat
  const toolName = process.env.TOOL_NAME || '';
  const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit'];
  if (!WRITE_TOOLS.includes(toolName)) {
    process.exit(0);
  }

  // Occasionally clean up old files (1% chance per run)
  if (Math.random() < 0.01) {
    cleanupOldCounters();
  }

  // Track tool call count (increment in a temp file)
  // Use working directory hash as session identifier since CLAUDE_SESSION_ID isn't exposed
  // This ties the counter to the project being worked on, which is more meaningful
  const crypto = require('crypto');
  const cwd = process.cwd();
  const cwdHash = crypto.createHash('md5').update(cwd).digest('hex').slice(0, 8);
  const counterFile = path.join(getTempDir(), `claude-tool-count-${cwdHash}`);
  const threshold = parseInt(process.env.COMPACT_THRESHOLD || '100', 10);

  let count = 1;

  // Read existing count or start at 1
  const existing = readFile(counterFile);
  if (existing) {
    const parsed = parseInt(existing.trim(), 10);
    // Handle corrupted counter files - treat NaN as starting fresh
    count = isNaN(parsed) ? 1 : parsed + 1;
  }

  // Save updated count
  writeFile(counterFile, String(count));

  // Suggest compact after threshold write operations
  if (count === threshold) {
    // Output via hook context for important milestone
    const output = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: `**Context checkpoint:** ${threshold} write operations reached. Consider running /compact if you're transitioning between phases (e.g., exploration → implementation).`
      }
    };
    console.log(JSON.stringify(output));
    process.exit(0);
  }

  // Suggest at regular intervals after threshold (less intrusive - stderr only)
  if (count > threshold && count % 50 === 0) {
    log(`[StrategicCompact] ${count} write operations - good checkpoint for /compact if context is stale`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[StrategicCompact] Error:', err.message);
  process.exit(0);
});
