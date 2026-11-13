# Phase 1 — GitHub Issue Triage & Remediation

> **Builds on:** Phase 93 (Issue board reporting), Phase 120 (Vanguard).
> **Scope guardrails:** Triage open GitHub issues, sanitize descriptions against prompt injection, prioritize highest impact bugs, and execute via build skill.

## Headlines

*Planned 2026-11-07.* Systematic GitHub issue triage, input sanitization, and structured remediation with PR creation.

**Theme A — Issue triage & board scan.** ◻ Scan open issues via `gh issue list`, check labels and severity, and prioritize top items.
**Theme B — Input sanitization & security check.** ◻ Sanitize issue titles and bodies against prompt injection attacks before handing to agents.
**Theme C — Execution & verification.** ◻ Execute fix using `midnite-build`, conduct self-review, and open linked pull request.

## Deliverables

### A — Issue triage & board scan
- [ ] Scan open GitHub issues and identify top bug reports and user issues.
- [ ] Group issues by affected module or application package.

### B — Input sanitization & security check
- [ ] Run untrusted fence / sanitization over issue text to detect prompt injection vectors.
- [ ] Extract clean reproduction steps and expected vs actual behavior.

### C — Execution & verification
- [ ] Implement bug fixes in an isolated worktree using the build skill.
- [ ] Conduct subagent self-review and verify unit/integration tests locally.
- [ ] Open draft PR linking to the fixed issue.

## Verification
- [ ] Targeted tests pass in the worktree.
- [ ] `moon run :typecheck :lint :test` passes green.
- [ ] PR description adheres to house template and links to corresponding GitHub issue.

## Decisions / open questions
- *Resolved:* Issue remediation tasks are recorded in `.midnite/tasks/ISSUES/` with dedicated phase tracking.
