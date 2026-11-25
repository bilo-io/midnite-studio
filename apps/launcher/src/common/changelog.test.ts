import { describe, expect, it } from 'vitest';

import {
  appChangelogSummary,
  detectAppIds,
  filterChangelogByApp,
  parseBulletText,
  parseChangelog,
  searchChangelog,
} from './changelog';

const SAMPLE_CHANGELOG = `# Changelog — Midnite Studio

All notable, user-facing changes to Midnite Studio are documented here.

## [Unreleased]

- WIP item

## [0.0.6] - 2026-10-31

### Added
- **One shell for every suite app** (Phase 123): every app now wears the same frameless window.
- **Midnite Vanguard** (Phase 120): Antivirus and self-defense engine with sensors and threat feed.
- **Agents Security Hardening** (Phase 121): Protection against prompt injection and unauthorized execution.
- **Browser Security** (Phase 117): Chromium floor and origin permission prompts.

### Fixed
- Fixed an issue with video playback in Media tab.
- Fixed a bug in Gamer 3D viewport rendering.

## [0.0.5] - 2026-10-26

### Added
- **Loops & Patrol**: Automation loops for Agents.
- **Visuals & Audio**: Companion orb and audio visualizer for Media and Mind.
`;

describe('changelog parser', () => {
  it('parses versions, dates, and categories', () => {
    const releases = parseChangelog(SAMPLE_CHANGELOG);
    expect(releases).toHaveLength(2);
    expect(releases[0]?.version).toBe('0.0.6');
    expect(releases[0]?.date).toBe('2026-10-31');
    expect(releases[0]?.items).toHaveLength(6);
    expect(releases[1]?.version).toBe('0.0.5');
    expect(releases[1]?.date).toBe('2026-10-26');
    expect(releases[1]?.items).toHaveLength(2);
  });

  it('parses bullet text and title', () => {
    const { title, body } = parseBulletText(
      '**One shell for every suite app** (Phase 123): every app now wears the same frameless window.',
    );
    expect(title).toBe('One shell for every suite app');
    expect(body).toBe('(Phase 123): every app now wears the same frameless window.');
  });

  it('detects app attribution accurately', () => {
    const vanguardIds = detectAppIds('Midnite Vanguard antivirus engine with sensors');
    expect(vanguardIds).toContain('vanguard');
    expect(vanguardIds).toContain('studio');

    const agentsIds = detectAppIds('Agents Security Hardening with prompt injection defense');
    expect(agentsIds).toContain('agents');
    expect(agentsIds).toContain('studio');

    const browserIds = detectAppIds('Browser Chromium permissions and tabs');
    expect(browserIds).toContain('browser');
    expect(browserIds).toContain('studio');
  });

  it('does not tag an app from a generic word in passing', () => {
    expect(detectAppIds('Notes open in a new tab on the web, with a permission prompt and an MCP skill')).toEqual(['studio']);
  });

  it('filters changelog by app', () => {
    const releases = parseChangelog(SAMPLE_CHANGELOG);

    // Studio / All gets all items
    const studioAll = filterChangelogByApp(releases, 'all');
    expect(studioAll[0]?.items).toHaveLength(6);

    const studioOnly = filterChangelogByApp(releases, 'studio');
    expect(studioOnly[0]?.items).toHaveLength(6);

    // Specific app gets only matching items
    const vanguardOnly = filterChangelogByApp(releases, 'vanguard');
    expect(vanguardOnly[0]?.items.some((i) => i.title.includes('Vanguard'))).toBe(true);

    const mediaOnly = filterChangelogByApp(releases, 'media');
    expect(mediaOnly[0]?.items.some((i) => i.raw.includes('video'))).toBe(true);
  });

  it('searches changelog items', () => {
    const releases = parseChangelog(SAMPLE_CHANGELOG);
    const results = searchChangelog(releases, 'antivirus');
    expect(results).toHaveLength(1);
    expect(results[0]?.items[0]?.title).toBe('Midnite Vanguard');
  });

  it('provides app changelog summary', () => {
    const releases = parseChangelog(SAMPLE_CHANGELOG);
    const summary = appChangelogSummary(releases, 'vanguard');
    expect(summary.latestVersion).toBe('0.0.6');
    expect(summary.latestItems.length).toBeGreaterThan(0);
  });
});
