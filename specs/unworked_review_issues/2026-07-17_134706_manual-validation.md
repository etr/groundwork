# Unworked Review Issues

**Run:** 2026-07-17 13:47:06
**Task:** manual-validation
**Total:** 1 (0 critical, 0 major, 1 minor)

## Minor

1. [x] **performance-reviewer** | `lib/project-context-cli.js:43` | blocking-io
   bindings() synchronously runs git rev-parse through getRepoRoot() even though main() already resolved the same repoRoot before calling bindings(). This adds a redundant subprocess to every successful select and resolve command, on top of the other synchronous repository-discovery calls in the short-lived CLI.
   *Recommendation:* Accept repoRoot as a bindings() argument and pass the value already computed in main(), or cache getRepoRoot()/getMainRepoRoot() for the process lifetime so repeated repository discovery does not spawn duplicate git processes.
