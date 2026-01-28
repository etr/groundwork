#!/bin/bash
# Run all tests for Groundwork plugin

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "Running Groundwork tests..."
echo "================================"

cd "$PLUGIN_ROOT"

# Run each test file
failed=0

for test_file in tests/*.test.js; do
  echo ""
  echo "Running: $test_file"
  echo "--------------------------------"
  if node "$test_file"; then
    echo "PASSED"
  else
    echo "FAILED"
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
