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

## Guard's sweep and its feeds

Midnite Studio's Guard loop runs a scheduled sweep of deterministic checks, with or without an agent installed: the
lockfiles of every open repository against OSV and CISA's Known Exploited Vulnerabilities list, the installed
software, the Mac's settings, SSH keys and shell files, the sites the browser visited, and the agent audit trail. Each
finding goes into the local findings ledger with a severity; Guard never kills, quarantines or pauses anything
(Vanguard does, behind a confirm). The only data a sweep sends off the machine is package names and versions to
`api.osv.dev`; the CISA and Electron lists are plain downloads. Every outbound host is in the egress registry and
behind the Settings > Privacy switch for Guard's feeds. The threat feed (poisoned packages, MCP servers, ClickFix
domains) is a signed file pulled whole, so nothing about your packages is sent to fetch it; no feed is trusted until a
public key is built in.

## Out of scope

Two positions are held deliberately; please read them before spending time on one.

- **Agent prompt injection.** An agent in the integrated terminal runs a shell with the user's
  privileges by design. Content that persuades an agent to run commands is not a Midnite Studio
  vulnerability.
- **Same-user access to the broker and MCP sockets.** The terminal broker and MCP server are Unix
  sockets guarded by file modes (`0600`/umask `0o177`), the boundary macOS offers. A process already
  running as the same user can reach them.

What the app sends, stores and exposes, in plain language, is in [`docs/PRIVACY.md`](docs/PRIVACY.md).

Findings from our own audits, and their status, are indexed in
[`docs/security/README.md`](docs/security/README.md).

For full details on key handling, threat modeling, and vault architecture, see
[`docs/VAULT_SECURITY.md`](docs/VAULT_SECURITY.md).
