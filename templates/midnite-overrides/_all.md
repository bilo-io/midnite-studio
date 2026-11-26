# Substitutions for every generic kit file

Applied after each skill's own file, to every kit skill (not the media set, which ships byte-identical)
and to docs/TRACKER.md. Each block must still match somewhere, or `sync-template.mjs --check` reports it
stale.

The product name becomes "this repo".

<<<<
the **Midnite Studio** repo
====
this repo
>>>>

<<<<
**Midnite Studio**
====
**this repo**
>>>>

The install step is the project's own (AGENTS.md › Toolchain), not this repo's pnpm + GitHub Packages pair.

<<<<
   export GITHUB_PACKAGES_TOKEN=$(gh auth token)
   pnpm install --frozen-lockfile
====
   <the project's install command, from AGENTS.md › Toolchain>
>>>>
