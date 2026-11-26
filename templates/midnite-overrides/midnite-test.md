# midnite-test

Everything this skill names about how to run tests here (moon tasks, the app/launcher/desktop targets,
the Playwright lanes, the package names in the example table, the GitHub Packages token) is this repo's;
in an onboarded repo the commands come from AGENTS.md › Toolchain and docs/TESTING.md if it has one.

<<<<
description: Local test suite runner and diagnostic tool for Midnite Studio apps and workspace packages (like ekko-test for local app environments) — runs automated typecheck, lint, unit tests, and Playwright e2e, diagnoses failures, and produces actionable remediation plans.
====
description: Local test suite runner and diagnostic tool for this repo's packages and apps — runs the typecheck, lint, unit and end-to-end tests, diagnoses failures, and produces actionable remediation plans.
>>>>

<<<<
argument-hint: "[optional: target package or app, e.g. 'shared', 'desktop', 'app', 'apps/launcher', or 'e2e']"
====
argument-hint: "[optional: target package or app, or 'e2e']"
>>>>

<<<<
**Invoke with:** [optional: target package or app, e.g. 'shared', 'desktop', 'app', 'apps/launcher', or 'e2e']
====
**Invoke with:** [optional: target package or app, or 'e2e']
>>>>

<<<<
You are running the **test** specialist for **Midnite Studio**. Because Midnite Studio is a desktop workspace rather than a hosted cloud webapp, testing is executed locally across workspace packages and target apps using moon and pnpm.
====
You are running the **test** specialist for **this repo**. Testing runs locally, across the workspace's packages and apps, with the commands `AGENTS.md` › Toolchain names.
>>>>

<<<<
(never the full moon gate on this machine)
====
(prefer focused runs to the full gate)
>>>>

<<<<
Per `docs/TESTING.md` and repository conventions:
1. **Vitest / jsdom:** Default for unit logic, store transitions, DOM text/roles, IPC envelope handling (`moon run :test` or `moon run <package>:test`).
2. **Typecheck & Lint:** Strict TypeScript checks and layer boundary enforcement (`moon run :typecheck && moon run :lint`).
3. **Playwright Visual Regression:** Appearance testing using locator-cropped `toHaveScreenshot` (`moon run app:visual`).
4. **Playwright Functional e2e:** Reserved for real layout, CSS, canvas, xterm, and multi-view flows (`moon run app:e2e`). Note: 5 concurrent macOS job cap.
====
Per the repository's conventions (`AGENTS.md`, and `docs/TESTING.md` if it exists):
1. **Unit tests:** The default for logic, state transitions and rendered text/roles.
2. **Typecheck & Lint:** Strict type checks and any enforced package boundaries.
3. **Visual regression:** Appearance, where the project keeps screenshot baselines.
4. **Functional end-to-end:** Reserved for what genuinely needs a real browser or runtime.
>>>>

<<<<
- **Workspace-wide:** No arguments provided → run full pre-push gate:
  ```bash
  moon run :typecheck && moon run :lint && moon run :test
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
====
- **Workspace-wide:** No arguments provided → run the full pre-push gate (`gate` in `.midnite/skills.json`, or the one `AGENTS.md` › Toolchain names).
- **Package-specific:** If the user named a package → that package's typecheck and tests only.
- **App-specific:** If the user named an app → its build (when tests need one), then its tests.
- **Functional e2e:** The project's end-to-end command, if it has one.
>>>>

<<<<
| `shared` | ✅ pass | 3453 | 0 | 35s | Pure types & contracts |
| `git-engine` | ✅ pass | 280 | 0 | 4s | NUL-delimited git parsers |
| `app` | ✅ pass | 450 | 0 | 12s | Renderer RTL tests |
| `typecheck` | ✅ pass | 106 tasks | 0 | 40s | Strict TS |
| `lint` | ✅ pass | 68 pkgs | 0 | 8s | Layer boundaries intact |
====
| `core` | ✅ pass | 342 | 0 | 6s | Pure logic |
| `web` | ✅ pass | 120 | 0 | 12s | Component tests |
| `typecheck` | ✅ pass | 12 pkgs | 0 | 20s | Strict types |
| `lint` | ✅ pass | 12 pkgs | 0 | 8s | Boundaries intact |
>>>>

<<<<
1. **ESLint Boundary Violation:** Look for cross-layer imports (e.g. `app` importing `electron`, or feature importing feature directly instead of `@midnite/studio-frame` or link router).
2. **TypeScript Error:** Flag missing exports, type divergence across `@midnite/studio-shared`, or stale `.d.ts`.
3. **Git Lock Contention:** Detect concurrent git operations colliding on `index.lock` without write-queue.
4. **Environment / Token Error:** Check if `GITHUB_PACKAGES_TOKEN` is missing or `.npmrc` environment substitution failed.
5. **Playwright Timeout:** Check if selectors were modified or `window.midniteStudio` bridge mock was omitted.
====
1. **Boundary Violation:** Look for a cross-layer import that the project's boundary rules forbid.
2. **Type Error:** Flag missing exports, type divergence across shared packages, or stale generated types.
3. **Git Lock Contention:** Detect concurrent git operations colliding on `index.lock`.
4. **Environment / Token Error:** Check for a missing registry token or environment variable the install or tests need.
5. **E2E Timeout:** Check whether selectors changed or a mock the test relies on was omitted.
>>>>
