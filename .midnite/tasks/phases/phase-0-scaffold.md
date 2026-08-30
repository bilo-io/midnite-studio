# Phase 0 — Scaffold

The empty monorepo skeleton: proto + moon + pnpm workspace, four packages, GH Packages auth proven.
Read `docs/INITIAL_PLAN.md` → "Package layout" before starting. Crib root config from
`~/Dev/midnite` (`.moon/tasks.yml` nearly verbatim; `tsconfig.base.json` with paths renamed).

## Deliverables

- [x] `.prototools` — node 22.12.0, pnpm 9.15.0, moon 2.3.4
- [x] `.npmrc` — `@bilo-io:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}` (env indirection, never a committed token)
- [x] `.moon/workspace.yml` (`projects.globs: ['packages/*']`, `sources: { root: '.' }`, `vcs.defaultBranch: main`)
- [x] `.moon/toolchain.yml` (node/pnpm mirrored from `.prototools`; `typescript.syncProjectReferences: false`)
- [x] `.moon/tasks.yml` — inherited `build` (tsc -b) / `typecheck` / `test` (vitest run) / `lint` (eslint)
- [x] Root `moon.yml` (`id: root`, `install` task), `pnpm-workspace.yaml`, root `package.json` (private, packageManager, engines, moon-passthrough scripts)
- [x] `tsconfig.base.json` — strict, composite, `noUncheckedIndexedAccess`, paths for `@midnite/studio-shared` + `@midnite/studio-git-engine`
- [x] `eslint.config.mjs` — eslint 9 flat config + **boundary rules** via per-package `no-restricted-imports`: `app` may not import git-engine/desktop/electron; `git-engine` may not import electron; `shared` imports no workspace package
- [x] `packages/{shared,git-engine,app,desktop}/` each with `package.json` (`@midnite/studio-<name>`, private, exports → dist), `tsconfig.json`, `moon.yml`, `vitest.config.ts`, stub `src/index.ts` + one trivial test
- [x] `app` deps include `@bilo-io/ui@0.1.0`, `@bilo-io/shell@0.1.0`, `react@^19`, `react-dom@^19` **now** — proves registry auth early
- [x] Root `pnpm.peerDependencyRules.ignoreMissing: ["next-intl"]`
- [x] `scripts/fix-node-pty.cjs` postinstall (crib from midnite root) — spawn-helper chmod
- [x] `.gitignore`, `.prettierrc.json`, `CLAUDE.md` (boundary rules, conventions — model on midnite's)

## Verification

- [x] `proto use` installs pinned toolchain
- [x] `pnpm install` succeeds — `@bilo-io/ui` + `@bilo-io/shell` resolve from GH Packages
- [x] `moon run :typecheck && moon run :lint && moon run :test` all green
- [x] `ls node_modules/.pnpm | grep 'react@'` shows a single react version

## Findings while landing this phase

- **moon 2 ignores a top-level `.moon/tasks.yml`.** Global inherited tasks must live in
  `.moon/tasks/<name>.yml` (here: `.moon/tasks/typescript.yml`). With the old 1.x path the
  projects come out with zero inherited tasks and `moon run :typecheck` silently no-ops.
  The filename does **not** scope by language either — every `.moon/tasks/*.yml` applies to
  every project, so the `root` project opts out via `workspace.inheritedTasks.exclude`.
- **moon appends a local task's args to the inherited ones by default.** `app:build` overrides
  the inherited `tsc -b` with `vite build` and needs `options.mergeArgs: 'replace'`, or it runs
  `pnpm exec tsc -b exec vite build`.
- **`root:install` must stay CI-enabled.** moon rejects a `runInCI: false` task being depended
  on by a CI task (`app:build`).
- **Boundary rules are scoped to `packages/app/src/**`**, not the whole package — the app's own
  `vite.config.ts` legitimately imports `node:url` at build time.
- `pnpm` prints `Failed to replace env in config: ${GITHUB_PACKAGES_TOKEN}` as a *warning* when
  the token is unset; the install only hard-fails when it actually needs to fetch `@bilo-io/*`.
