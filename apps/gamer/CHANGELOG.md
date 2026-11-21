# Changelog — Midnite Gamer

All notable, user-facing changes to Midnite Gamer are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions are lockstep with the whole Midnite suite, so every release of one app has a section here.
Released sections are mirrored to the public release feed by the release flow.

## [Unreleased]

## [0.0.7] - 2026-11-13

### Added
- **Release notes in the app** (Phase 131): a version pill in the status bar opens this app's notes for the running version.
- **Media ▸ SFX**: local sound effects with Stable Audio Open Small, usable from games and videos.
- **Animations** (Phase 125): a clip library with bulk import, a timeline player with retargeted preview, Sketchfab search and download, and import into a game.
- **Image → 3D (SF3D)**: every setting in the form, a background cut-out, continue a model with Claude, auto-rig and auto-play clips.
- Games export as a zip or folder that runs with `npm start`.

### Changed
- **Privacy** (Phase 115): the MCP server and terminal broker require a per-launch token.

### Fixed
- Image → 3D (SF3D) no longer crashes.
- The Maps tab no longer flashes.
- Game play-tests paint before each capture and run one at a time per game. An opened game repo now appears in the Games list.
- Security updates to the validation library (zod 4).

## [0.0.6] - 2026-10-31

### Added
- **One shell for every suite app** (Phase 123): every app now wears the same frameless window, title-bar cluster, nav rail, status bar with a system monitor, settings pages, chords, terminal panel, companion panel and the FAB / Loops menu.
- **Modules** (Phase 124): Creator now live here as modules, each with its own nav group.

### Changed
- **Retired apps resolve here.** Links and launcher tiles for the standalone Creator apps open Midnite Gamer on the matching module and view.
