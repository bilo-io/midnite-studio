import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as release from '../packages/shared/src/release.ts';
import { compareSemVer } from '../packages/shared/src/version.ts';
import {
  CHANGELOG_TITLES,
  changelogSkeleton,
  mirrorAll,
  mirrorMissingSections,
  mirrorSection,
} from './publish-feed-changelog.mjs';

const SEEDED = `# Changelog — Midnite Studio

All notable changes to Midnite Studio are documented here.

This file is the **public mirror** of the changelog in the private source repo
(\`bilo-io/midnite-studio\`).

## [Unreleased]

Pre-release. Nothing has shipped publicly yet — the first tagged build will appear here.

[Unreleased]: https://github.com/bilo-io/midnite-apps/commits/main/midnite-studio
`;

const RELEASE_URL = 'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.1.0';

describe('mirrorSection', () => {
  it('inserts the new section directly below "## [Unreleased]"', () => {
    const next = mirrorSection(SEEDED, '0.1.0', '### Added\n\n- First release.', RELEASE_URL, '2026-09-05');

    const unreleasedIdx = next.indexOf('## [Unreleased]');
    const newSectionIdx = next.indexOf('## [0.1.0]');
    expect(unreleasedIdx).toBeGreaterThanOrEqual(0);
    expect(newSectionIdx).toBeGreaterThan(unreleasedIdx);
    expect(next).toContain('## [0.1.0] - 2026-09-05');
    expect(next).toContain('### Added\n\n- First release.');
  });

  it('keeps the Unreleased blurb and its own link reference intact', () => {
    const next = mirrorSection(SEEDED, '0.1.0', 'Body.', RELEASE_URL, '2026-09-05');
    expect(next).toContain('Pre-release. Nothing has shipped publicly yet');
    expect(next).toContain('[Unreleased]: https://github.com/bilo-io/midnite-apps/commits/main/midnite-studio');
  });

  it('appends a link reference for the new version', () => {
    const next = mirrorSection(SEEDED, '0.1.0', 'Body.', RELEASE_URL, '2026-09-05');
    expect(next.trimEnd().endsWith(`[0.1.0]: ${RELEASE_URL}`)).toBe(true);
  });

  it('is idempotent — a version already present is left untouched', () => {
    const once = mirrorSection(SEEDED, '0.1.0', 'Body.', RELEASE_URL, '2026-09-05');
    const twice = mirrorSection(once, '0.1.0', 'A different body this time.', RELEASE_URL, '2026-09-05');
    expect(twice).toBe(once);
    expect(twice).not.toContain('A different body this time.');
  });

  it('trims the section body before inserting it', () => {
    const next = mirrorSection(SEEDED, '0.1.0', '\n\n  ### Added\n\n- Padded.\n\n  ', RELEASE_URL, '2026-09-05');
    expect(next).toContain('## [0.1.0] - 2026-09-05\n\n### Added\n\n- Padded.\n');
  });

  it('throws when the target has no "## [Unreleased]" heading to anchor on', () => {
    expect(() => mirrorSection('# Changelog\n\nNo unreleased heading here.\n', '0.1.0', 'Body.', RELEASE_URL, '2026-09-05')).toThrow(
      /Unreleased/,
    );
  });

  it('a second, different version inserts above the first release, below Unreleased', () => {
    const afterFirst = mirrorSection(SEEDED, '0.1.0', 'First.', RELEASE_URL, '2026-09-05');
    const afterSecond = mirrorSection(
      afterFirst,
      '0.1.1',
      'Second.',
      'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.1.1',
      '2026-09-10',
    );

    const unreleasedIdx = afterSecond.indexOf('## [Unreleased]');
    const secondIdx = afterSecond.indexOf('## [0.1.1]');
    const firstIdx = afterSecond.indexOf('## [0.1.0]');
    expect(unreleasedIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(firstIdx);
  });
});

describe('mirrorMissingSections', () => {
  const shared = { extractLatestSections: release.extractLatestSections, compareSemVer };
  const url = (v) => `https://example.test/v${v}`;
  const SOURCE = `# Changelog

## [Unreleased]

## [0.0.7] - 2026-11-20

### Added
- seven

## [0.0.6] - 2026-10-31

### Added
- six
`;

  it('fills an empty skeleton, newest first, with both refs', () => {
    const { markdown, added } = mirrorMissingSections(changelogSkeleton('Midnite Money'), SOURCE, url, '2026-01-01', shared);
    expect(added).toEqual(['0.0.7', '0.0.6']);
    expect(markdown.indexOf('## [0.0.7]')).toBeGreaterThan(markdown.indexOf('## [Unreleased]'));
    expect(markdown.indexOf('## [0.0.7]')).toBeLessThan(markdown.indexOf('## [0.0.6]'));
    expect(markdown).toContain('[0.0.7]: https://example.test/v0.0.7');
    expect(markdown).toContain('[0.0.6]: https://example.test/v0.0.6');
  });

  it('adds only the missing version above the existing one, and is idempotent', () => {
    const first = mirrorMissingSections(changelogSkeleton('X'), SOURCE.replace(/## \[0\.0\.7\][\s\S]*?(?=## \[0\.0\.6\])/, ''), url, '2026-01-01', shared).markdown;
    const { markdown, added } = mirrorMissingSections(first, SOURCE, url, '2026-01-01', shared);
    expect(added).toEqual(['0.0.7']);
    expect(markdown.indexOf('## [0.0.7]')).toBeLessThan(markdown.indexOf('## [0.0.6]'));
    const again = mirrorMissingSections(markdown, SOURCE, url, '2026-01-01', shared);
    expect(again).toEqual({ markdown, added: [] });
  });

  it('uses the fallback date for an undated section and keeps an [Unreleased] blurb on top', () => {
    const target = '# Changelog\n\n## [Unreleased]\n\nPre-release blurb.\n';
    const { markdown } = mirrorMissingSections(target, '# C\n\n## [0.0.1]\n\n- one\n', url, '2026-02-02', shared);
    expect(markdown).toContain('## [0.0.1] - 2026-02-02');
    expect(markdown.indexOf('Pre-release blurb.')).toBeLessThan(markdown.indexOf('## [0.0.1]'));
  });
});

describe('mirrorAll', () => {
  it('creates a missing app folder from the skeleton plus the released sections', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'feed-src-'));
    const feed = mkdtempSync(path.join(tmpdir(), 'feed-out-'));
    for (const id of release.CHANGELOG_APP_IDS) {
      if (id === 'studio') continue;
      mkdirSync(path.join(root, 'apps', id), { recursive: true });
      writeFileSync(
        path.join(root, 'apps', id, 'CHANGELOG.md'),
        id === 'money'
          ? '# Changelog — Midnite Money\n\n## [Unreleased]\n\n## [0.0.6] - 2026-10-31\n\n### Added\n- six\n'
          : `# Changelog — ${CHANGELOG_TITLES[id]}\n\n## [Unreleased]\n`,
      );
    }
    const shared = { ...release, compareSemVer };
    const results = await mirrorAll({ feedRoot: feed, releaseDate: '2026-11-20', root, shared });
    expect(results.find((r) => r.id === 'money').added).toEqual(['0.0.6']);
    expect(results.find((r) => r.id === 'science').added).toEqual([]);
    expect(results.some((r) => r.id === 'studio')).toBe(false);
    const out = readFileSync(path.join(feed, 'midnite-money/CHANGELOG.md'), 'utf8');
    expect(out.startsWith('# Changelog — Midnite Money')).toBe(true);
    expect(out).toContain('## [0.0.6] - 2026-10-31');
    expect(out).toContain('releases/tag/midnite-launcher/v0.0.6');
  });
});
