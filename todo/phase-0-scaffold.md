# Phase 0 — Scaffold

The empty monorepo skeleton: proto + moon + pnpm workspace, four packages, GH Packages auth proven.
Read `docs/INITIAL_PLAN.md` → "Package layout" before starting. Crib root config from
`~/Dev/midnite` (`.moon/tasks.yml` nearly verbatim; `tsconfig.base.json` with paths renamed).

## Deliverables

- [ ] `.prototools` — node 22.12.0, pnpm 9.15.0, moon 2.3.4
- [ ] `.npmrc` — `@bilo-io:registry=https://npm.pkg.github.com` + `//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}` (env indirection, never a committed token)
- [ ] `.moon/workspace.yml` (`projects.globs: ['packages/*']`, `sources: { root: '.' }`, `vcs.defaultBranch: main`)
- [ ] `.moon/toolchain.yml` (node/pnpm mirrored from `.prototools`; `typescript.syncProjectReferences: false`)
- [ ] `.moon/tasks.yml` — inherited `build` (tsc -b) / `typecheck` / `test` (vitest run) / `lint` (eslint)
- [ ] Root `moon.yml` (`id: root`, `install` task), `pnpm-workspace.yaml`, root `package.json` (private, packageManager, engines, moon-passthrough scripts)
- [ ] `tsconfig.base.json` — strict, composite, `noUncheckedIndexedAccess`, paths for `@midnite-git/shared` + `@midnite-git/git-engine`
- [ ] `eslint.config.mjs` — eslint 9 flat config + **boundary rules** via per-package `no-restricted-imports`: `app` may not import git-engine/desktop/electron; `git-engine` may not import electron; `shared` imports no workspace package
- [ ] `packages/{shared,git-engine,app,desktop}/` each with `package.json` (`@midnite-git/<name>`, private, exports → dist), `tsconfig.json`, `moon.yml`, `vitest.config.ts`, stub `src/index.ts` + one trivial test
- [ ] `app` deps include `@bilo-io/ui@0.1.0`, `@bilo-io/shell@0.1.0`, `react@^19`, `react-dom@^19` **now** — proves registry auth early
- [ ] Root `pnpm.peerDependencyRules.ignoreMissing: ["next-intl"]`
- [ ] `scripts/fix-node-pty.cjs` postinstall (crib from midnite root) — spawn-helper chmod
- [ ] `.gitignore`, `.prettierrc.json`, `CLAUDE.md` (boundary rules, conventions — model on midnite's)

## Verification

- [ ] `proto use` installs pinned toolchain
- [ ] `pnpm install` succeeds — `@bilo-io/ui` + `@bilo-io/shell` resolve from GH Packages
- [ ] `moon run :typecheck && moon run :lint && moon run :test` all green
- [ ] `ls node_modules/.pnpm | grep 'react@'` shows a single react version
