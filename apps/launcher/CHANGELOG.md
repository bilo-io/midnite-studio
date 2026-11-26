# Changelog — Midnite Apps

All notable, user-facing changes to Midnite Apps are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are lockstep with the whole Midnite suite, so every release of one app has a section here.
Released sections are mirrored to the public release feed by the release flow.

## [Unreleased]

## [0.0.7] - 2026-11-13

### Added
- **What's new** (Phase 131) for every app and for the launcher itself, read from each app's own changelog.
- Midnite **Science**, **Health** and **Startup** in the catalog, with **Simulator** under Science and **Accountant** under Money.
- **Privacy switches** (Phase 115) for each service the launcher contacts, including avatars.

### Fixed
- Security updates to the validation library (zod 4).

## [0.0.6] - 2026-10-31

### Added
- **One shell for every suite app** (Phase 123): the launcher and every suite app now wear the same frameless window, title-bar cluster, nav rail, status bar with a system monitor, settings pages, chords, terminal panel, companion panel and the FAB / Loops menu.
- **Midnite Apps catalog**: 11 apps with module chips and a grouped detail sheet, plus an **Update launcher** button.

### Changed
- **Retired apps resolve to their hosts.** Tiles for Coder, Creator, Cleaner, Vault, Monitor and Capture open the host app on the right module and view; the launcher offers to swap an installed retired app for its host and imports its data.
