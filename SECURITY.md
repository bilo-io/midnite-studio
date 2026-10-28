# Security policy

## Supported versions

Only the latest release of Midnite Studio is supported, on macOS (arm64). Fixes ship as a new
release; older versions are not patched.

## Reporting a vulnerability

Report privately. Do not open a public issue or pull request for a vulnerability.

- **Preferred:** GitHub private vulnerability reporting on the public releases repository,
  [`bilo-io/midnite-apps`](https://github.com/bilo-io/midnite-apps/security/advisories/new).
- **Fallback:** email bilo.lwabona@gmail.com with "Midnite Studio security" in the subject.

Include the version, macOS version, steps to reproduce and the impact you expect. A proof of concept
helps; please do not test against accounts or data that are not yours.

## What to expect

- Acknowledgement within 5 working days.
- A coordinated disclosure window of 90 days from the report. We aim to ship a fix inside it and will
  credit you in the release notes unless you prefer otherwise. If a fix needs longer, we will say so
  and agree a date with you.

## Out of scope

Two positions are held deliberately; please read them before spending time on one.

- **Agent prompt injection.** An agent in the integrated terminal runs a shell with the user's
  privileges by design. Content that persuades an agent to run commands is not a Midnite Studio
  vulnerability.
- **Same-user access to the broker and MCP sockets.** The terminal broker and MCP server are Unix
  sockets guarded by file modes (`0600`/umask `0o177`), the boundary macOS offers. A process already
  running as the same user can reach them.

Findings from our own audits, and their status, are indexed in
[`docs/security/README.md`](docs/security/README.md).

For full details on key handling, threat modeling, and vault architecture, see
[`docs/VAULT_SECURITY.md`](docs/VAULT_SECURITY.md).
