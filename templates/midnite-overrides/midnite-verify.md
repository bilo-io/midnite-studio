# midnite-verify

This repo's moon gate, package names, pnpm filter and packaged-app task become generic.

<<<<
   Typechecks the touched packages and lints the changed files (never the workspace-wide moon gate, which exhausts RAM).
====
   Typechecks the touched packages and lints the changed files (the script assumes a JS workspace with vitest, tsc and eslint; elsewhere run the project's focused equivalents).
>>>>

<<<<
   Identify relevant packages touched by the phase (`packages/app`, `packages/git-engine`, `packages/desktop`, `packages/shared`, etc.):
   ```bash
   # Run relevant unit tests
   pnpm --filter <package> test -- <test-file>
   ```
====
   Identify the packages the phase touched and run their tests, focused on the relevant files, with
   the project's test command (`AGENTS.md` › Toolchain).
>>>>

<<<<
   - Items requiring physical device or OS-specific interactions (e.g. macOS native menus, detached panels).
   - Packaged-app behavioral passes (`desktop:install-local`).
====
   - Items requiring a physical device or OS-specific interactions.
   - Behaviour that only shows in a real build (packaged, released or deployed).
>>>>
