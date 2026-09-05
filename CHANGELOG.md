# Changelog — Midnite Studio

All notable, user-facing changes to Midnite Studio are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning is **lockstep**: at any moment every package under `packages/*` shares
one `MAJOR.MINOR`, while `PATCH` advances independently per package — enforced by
[`scripts/version-check.mjs`](scripts/version-check.mjs) in `moon ci`. Release
sections are curated from conventional commits via the
[`/midnite-release-prep`](.claude/skills/midnite-release-prep/SKILL.md) →
[`/midnite-release-complete`](.claude/skills/midnite-release-complete/SKILL.md)
flow, and are kept separate from the phase tracker in
[`.midnite/tasks/done.md`](.midnite/tasks/done.md), which logs build progress
rather than release notes.

This repo is private, so once a section here is released it is also mirrored
into the public `bilo-io/midnite-apps` repo's `midnite-studio/CHANGELOG.md` —
that mirror is what the in-app release-notes popover actually reads (see
[`RELEASE_CHANGELOG_RAW_URL`](packages/shared/src/release.ts)), not this file.

## [Unreleased]

_Nothing yet._

[Unreleased]: https://github.com/bilo-io/midnite-studio/commits/main
