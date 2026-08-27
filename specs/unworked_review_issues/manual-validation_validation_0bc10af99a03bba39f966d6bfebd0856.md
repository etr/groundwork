# Unworked Review Issues

**Run:** 2026-08-27 12:26:40
**Task:** manual-validation
**Total:** 2 (0 critical, 0 major, 2 minor)

## Minor

1. [ ] **code-simplifier** | `bin/groundwork-run.js:12` | dependencies
   Optional module discovery and fallback loading is now repeated nearly verbatim for task-executor memory, validation sessions, and run reporting. Each copy searches the sibling lib directory and the standalone runner directory independently, so another sidecar would add more duplicated loader logic and make the shared fallback contract harder to see.
   *Recommendation:* Extract one small loadOptionalModule(name) helper that preserves the current search order (../lib/name, then name beside the runner) and returns null when neither exists; use it for all three optional helpers without changing their existing destructuring or fallback behavior.

2. [ ] **security-reviewer** | `lib/task-executor-memory.js:76` | insecure-design
   CWE-367: readRegularText() validates path components with lstat(), then separately calls stat() and readFileSync() by pathname. A concurrent symlink/component swap between those operations can make the final read escape the checked regular contained file, contrary to the architecture's non-symlinked-source invariant. The same check-then-open pattern protects Claude sources, snapshots, proposals, and canonical memory.
   *Recommendation:* Open the final file once with O_RDONLY|O_NOFOLLOW, validate size and regular-file type with fstat() on that descriptor, and read from the same descriptor. Keep the parent directory under a trusted 0700 root and revalidate or descriptor-anchor directory components so a component replacement cannot redirect the open. Add a race-oriented seam test that swaps the checked entry before open/read.
