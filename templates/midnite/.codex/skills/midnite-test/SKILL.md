---
name: midnite-test
description: Local test suite runner and diagnostic tool for this repo's apps and packages — runs the automated typecheck, lint, unit and e2e layers its convention file names, diagnoses failures, and produces actionable remediation plans.
---

**Invoke with:** [optional: target package, app or layer, e.g. a package name, 'e2e' or 'visual']

You are running the **test** specialist for **this repo**. Testing is executed locally across the repo's packages and apps, using whatever runner and task tool its convention file names.

## Testing Architecture & Levels

Read the repo's testing doc (e.g. `docs/TESTING.md`) and convention file first; they define the layers and the commands. The usual shape, which this repo's own conventions are an example of rather than a rule:
1. **Unit / component tests:** the default for logic, state transitions and rendered text/roles. Fast, run on every change.
2. **Typecheck & lint:** strict type checks and any layer-boundary enforcement.
3. **Visual regression:** appearance checks (screenshot comparison), if the repo has them.
4. **Functional / e2e:** reserved for what needs a real browser, device, process or CLI — real layout, rendering, pointer or terminal behaviour, multi-view flows. Respect any CI concurrency or platform limits the repo documents.

---

## 🔍 Stage 1 — Determine Target Scope

Check `$ARGUMENTS` or inspect git diff:
- **Repo-wide:** No arguments provided → run the full pre-push gate (typecheck, lint, tests and the tracker drift guard, as the convention file names them).
- **Package-specific:** If the user named a package, run that package's typecheck and test tasks.
- **App-specific:** For a target app (web, desktop, CLI), run that app's own build and test tasks.
- **Functional e2e / visual:** run the repo's e2e or visual task when the change touches what those layers cover.

---

## 📊 Stage 2 — Execute & Stream Results

Run the targeted commands. Capture stdout and stderr cleanly.

Produce a structured pass/fail status table:
| Layer / Package | Status | Passed | Failed | Duration | Notes |
|---|---|---|---|---|---|
| `<package>` | ✅ pass | 120 | 0 | 4s | one-line note |
| `typecheck` | ✅ pass | 12 tasks | 0 | 40s | Strict types |
| `lint` | ✅ pass | 12 pkgs | 0 | 8s | Boundaries intact |

---

## 🩺 Stage 3 — Diagnostics & Root Cause Analysis

If any step fails, analyze the failure immediately:
1. **Boundary / lint violation:** look for imports that cross a layer or package boundary the convention file forbids.
2. **Type error:** flag missing exports, contract drift between packages, or stale generated types.
3. **Environment / auth error:** check for a missing token, registry credential or env var the install or tests need.
4. **Concurrency / ordering:** look for tests or commands racing on shared state (lock files, ports, temp dirs).
5. **E2E timeout:** check whether selectors changed or a required mock/fixture was omitted.

---

## 🛠️ Stage 4 — Actionable Remediation Plan

If failures occurred, output a crisp bulleted remediation plan:
- Exact files and line numbers requiring edits.
- The command to rerun once patched.
- Offer to fix the findings immediately using subagents or inline edits.
