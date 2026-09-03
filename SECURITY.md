# Security Policy

## Supported versions

Groundwork security fixes are applied to the current `main` branch and the
latest published release. Older releases are updated only when a fix can be
reliably backported without changing the plugin's supported behavior.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to
[sebastiano@hey.com](mailto:sebastiano@hey.com) with `Groundwork security` in
the subject line:

1. Include the affected Groundwork version or commit SHA.
2. Describe the affected harness and installation path, such as Claude Code,
   Codex, OpenCode, Kiro, or Pi.
3. Include reproduction steps and relevant logs with credentials and other
   sensitive material removed.

Do not open a public GitHub issue for an unreported vulnerability.

Reports are acknowledged as soon as possible. If private vulnerability
reporting is later enabled on GitHub, this policy will prefer that channel;
email remains an accepted fallback.

## Scope

This policy covers Groundwork's skills, agents, hooks, installer, exported
runner, workflows, and documentation. Please report vulnerabilities in the
underlying coding-agent harnesses or third-party dependencies to their
maintainers; include a Groundwork reproduction only if Groundwork's own
installation or orchestration contributes to the issue.
