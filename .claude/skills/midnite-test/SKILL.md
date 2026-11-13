---
name: midnite-test
description: Local test suite runner and diagnostic tool for Midnite Studio apps and workspace packages (like ekko-test for local app environments) — runs automated typecheck, lint, unit tests, and Playwright e2e, diagnoses failures, and produces actionable remediation plans.
argument-hint: "[optional: target package or app, e.g. 'shared', 'desktop', 'app', 'apps/launcher', or 'e2e']"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, TodoWrite, Agent
---

You are running the **test** specialist for **Midnite Studio**. Because Midnite Studio is a desktop workspace rather than a hosted cloud webapp, testing is executed locally across workspace packages and target apps using moon and pnpm.

## Testing Architecture & Levels

Per `docs/TESTING.md` and repository conventions:
1. **Vitest / jsdom:** Default for unit logic, store transitions, DOM text/roles, IPC envelope handling (`moon run :test` or `moon run <package>:test`).
2. **Typecheck & Lint:** Strict TypeScript checks and layer boundary enforcement (`moon run :typecheck && moon run :lint`).
3. **Playwright Visual Regression:** Appearance testing using locator-cropped `toHaveScreenshot` (`moon run app:visual`).
4. **Playwright Functional e2e:** Reserved for real layout, CSS, canvas, xterm, and multi-view flows (`moon run app:e2e`). Note: 5 concurrent macOS job cap.

---

## 🔍 Stage 1 — Determine Target Scope

Check `$ARGUMENTS` or inspect git diff:
- **Workspace-wide:** No arguments provided → run full pre-push gate:
  ```bash
  moon run :typecheck && moon run :lint && moon run :test && moon run root:tracker-check
  ```
- **Package-specific:** If user requested a specific package (e.g. `shared`, `git-engine`, `feature-tasks`, `runtime`):
  ```bash
  moon run <package>:typecheck && moon run <package>:test
  ```
- **App-specific:** For target apps:
  - Studio: `moon run studio:bundle && moon run app:test`
  - Launcher: `moon run launcher:typecheck && moon run launcher:test`
  - Desktop: `moon run desktop:typecheck && moon run desktop:test`
- **Functional e2e:**
  ```bash
  moon run app:e2e
  ```

---

## 📊 Stage 2 — Execute & Stream Results

Run the targeted commands. Capture stdout and stderr cleanly.

Produce a structured pass/fail status table:
| Layer / Package | Status | Passed | Failed | Duration | Notes |
|---|---|---|---|---|---|
| `shared` | ✅ pass | 3453 | 0 | 35s | Pure types & contracts |
| `git-engine` | ✅ pass | 280 | 0 | 4s | NUL-delimited git parsers |
| `app` | ✅ pass | 450 | 0 | 12s | Renderer RTL tests |
| `typecheck` | ✅ pass | 106 tasks | 0 | 40s | Strict TS |
| `lint` | ✅ pass | 68 pkgs | 0 | 8s | Layer boundaries intact |

---

## 🩺 Stage 3 — Diagnostics & Root Cause Analysis

If any step fails, analyze the failure immediately:
1. **ESLint Boundary Violation:** Look for cross-layer imports (e.g. `app` importing `electron`, or feature importing feature directly instead of `@midnite/studio-frame` or link router).
2. **TypeScript Error:** Flag missing exports, type divergence across `@midnite/studio-shared`, or stale `.d.ts`.
3. **Git Lock Contention:** Detect concurrent git operations colliding on `index.lock` without write-queue.
4. **Environment / Token Error:** Check if `GITHUB_PACKAGES_TOKEN` is missing or `.npmrc` environment substitution failed.
5. **Playwright Timeout:** Check if selectors were modified or `window.midniteStudio` bridge mock was omitted.

---

## 🛠️ Stage 4 — Actionable Remediation Plan

If failures occurred, output a crisp bulleted remediation plan:
- Exact files and line numbers requiring edits.
- The command to rerun once patched.
- Offer to fix the findings immediately using subagents or inline edits.
