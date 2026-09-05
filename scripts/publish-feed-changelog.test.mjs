import { describe, expect, it } from 'vitest';
import { mirrorSection } from './publish-feed-changelog.mjs';

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
