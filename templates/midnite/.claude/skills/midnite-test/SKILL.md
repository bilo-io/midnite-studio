---
name: midnite-test
description: Local test suite runner and diagnostic tool for this repo's packages and apps — runs the typecheck, lint, unit and end-to-end tests, diagnoses failures, and produces actionable remediation plans.
argument-hint: "[optional: target package or app, or 'e2e']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **test** specialist for **this repo**. Testing runs locally, across the workspace's packages and apps, with the commands `AGENTS.md` › Toolchain names.

## 0 · Run the script first

Run `node scripts/skills/test-classify.mjs <log-file | ->`. It pipe a failing run's output in and it buckets failures (boundary, ts, index-lock, auth, timeout, billing, assertion, other) before you diagnose. You still choose the focused commands (prefer focused runs to the full gate), read the failures and write the remediation plan. Add `--no-llm` for the fully offline path (deterministic text, no Ollama). If the script errors or is unavailable, fall back to the manual steps below, which stay in place.

## Testing Architecture & Levels

Per the repository's conventions (`AGENTS.md`, and `docs/TESTING.md` if it exists):
1. **Unit tests:** The default for logic, state transitions and rendered text/roles.
2. **Typecheck & Lint:** Strict type checks and any enforced package boundaries.
3. **Visual regression:** Appearance, where the project keeps screenshot baselines.
4. **Functional end-to-end:** Reserved for what genuinely needs a real browser or runtime.

---

## 🔍 Stage 1 — Determine Target Scope

Check `$ARGUMENTS` or inspect git diff:
- **Workspace-wide:** No arguments provided → run the full pre-push gate (`gate` in `.midnite/skills.json`, or the one `AGENTS.md` › Toolchain names).
- **Package-specific:** If the user named a package → that package's typecheck and tests only.
- **App-specific:** If the user named an app → its build (when tests need one), then its tests.
- **Functional e2e:** The project's end-to-end command, if it has one.

---

## 📊 Stage 2 — Execute & Stream Results

Run the targeted commands. Capture stdout and stderr cleanly.

Produce a structured pass/fail status table:
| Layer / Package | Status | Passed | Failed | Duration | Notes |
|---|---|---|---|---|---|
| `core` | ✅ pass | 342 | 0 | 6s | Pure logic |
| `web` | ✅ pass | 120 | 0 | 12s | Component tests |
| `typecheck` | ✅ pass | 12 pkgs | 0 | 20s | Strict types |
| `lint` | ✅ pass | 12 pkgs | 0 | 8s | Boundaries intact |

---

## 🩺 Stage 3 — Diagnostics & Root Cause Analysis

If any step fails, analyze the failure immediately:
1. **Boundary Violation:** Look for a cross-layer import that the project's boundary rules forbid.
2. **Type Error:** Flag missing exports, type divergence across shared packages, or stale generated types.
3. **Git Lock Contention:** Detect concurrent git operations colliding on `index.lock`.
4. **Environment / Token Error:** Check for a missing registry token or environment variable the install or tests need.
5. **E2E Timeout:** Check whether selectors changed or a mock the test relies on was omitted.

---

## 🛠️ Stage 4 — Actionable Remediation Plan

If failures occurred, output a crisp bulleted remediation plan:
- Exact files and line numbers requiring edits.
- The command to rerun once patched.
- Offer to fix the findings immediately using subagents or inline edits.
