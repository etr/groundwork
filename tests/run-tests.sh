#!/bin/bash
# Run all tests for Groundwork plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Per-suite watchdog: any single suite that exceeds SUITE_TIMEOUT seconds is
# killed (its child processes first, so orphaned workers cannot outlive it)
# and recorded as FAILED, letting the remaining suites still run. Without
# this, one hung suite stalls the whole validation gate indefinitely.
# Override via the environment, e.g. SUITE_TIMEOUT=60 bash tests/run-tests.sh
SUITE_TIMEOUT="${SUITE_TIMEOUT:-300}"

# pkill reaps a timed-out suite's children before the suite itself. If it is
# unavailable, the watchdog still bounds the suite process (children may
# linger, exactly as they did before the watchdog existed).
HAVE_PKILL=0
if command -v pkill >/dev/null 2>&1; then
  HAVE_PKILL=1
fi

echo "Running Groundwork tests..."
echo "================================"

cd "$PLUGIN_ROOT"

# Run each test file
failed=0

for test_file in tests/*.test.js; do
  echo ""
  echo "Running: $test_file"
  echo "--------------------------------"
  node "$test_file" &
  suite_pid=$!
  (
    sleep "$SUITE_TIMEOUT"
    if [ "$HAVE_PKILL" -eq 1 ]; then
      pkill -KILL -P "$suite_pid" 2>/dev/null || true
    fi
    kill -9 "$suite_pid" 2>/dev/null || true
  ) >/dev/null 2>&1 &
  watchdog_pid=$!
  suite_status=0
  wait "$suite_pid" || suite_status=$?
  # Disarm the watchdog: kill its sleep child first, then the watchdog.
  if [ "$HAVE_PKILL" -eq 1 ]; then
    pkill -TERM -P "$watchdog_pid" 2>/dev/null || true
  fi
  kill "$watchdog_pid" 2>/dev/null || true
  wait "$watchdog_pid" 2>/dev/null || true
  if [ "$suite_status" -eq 0 ]; then
    echo "PASSED"
  else
    echo "FAILED"
    if [ "$suite_status" -gt 128 ]; then
      echo "(watchdog killed '$test_file' after SUITE_TIMEOUT=${SUITE_TIMEOUT}s)"
    fi
    failed=1
  fi
done

echo ""
echo "================================"
if [ $failed -eq 0 ]; then
  echo "All test suites passed!"
  exit 0
else
  echo "Some tests failed."
  exit 1
fi
