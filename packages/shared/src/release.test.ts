import { describe, expect, it } from 'vitest';

import { extractChangelogSection, releasePageUrl } from './release';

const CHANGELOG = `# Changelog — Midnite Studio

Preamble prose nobody wants in a release-notes popover.

## [Unreleased]

Nothing yet.

## [0.3.1] - 2026-08-01

### Fixed

- The rail no longer forgets its width.

## [0.3.0] - 2026-07-01

### Added

- A version pill.

[Unreleased]: https://github.com/bilo-io/midnite-apps/commits/main/midnite-studio
[0.3.1]: https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.3.1
`;

describe('extractChangelogSection', () => {
  it('returns just the requested version, not its neighbours', () => {
    expect(extractChangelogSection(CHANGELOG, '0.3.1')).toBe(
      '### Fixed\n\n- The rail no longer forgets its width.',
    );
  });

  it('reads the last section without a following heading to stop at', () => {
    expect(extractChangelogSection(CHANGELOG, '0.3.0')).toBe('### Added\n\n- A version pill.');
  });

  it('drops the link-reference definitions parked under the last section', () => {
    expect(extractChangelogSection(CHANGELOG, '0.3.0')).not.toContain('https://');
  });

  it('accepts a leading v on either side', () => {
    expect(extractChangelogSection(CHANGELOG, 'v0.3.1')).toContain('forgets its width');
    expect(extractChangelogSection('## v1.0.0\n\nShipped.\n', '1.0.0')).toBe('Shipped.');
  });

  it('reads an undecorated heading', () => {
    expect(extractChangelogSection('## 1.0.0\n\nShipped.\n', '1.0.0')).toBe('Shipped.');
  });

  it('is null for a version the mirror has not caught up with', () => {
    expect(extractChangelogSection(CHANGELOG, '0.4.0')).toBeNull();
  });

  it('is null for a heading with an empty body', () => {
    expect(extractChangelogSection('## [1.0.0]\n\n## [0.9.0]\n\nOld.\n', '1.0.0')).toBeNull();
  });

  // A section that quotes markdown must not be truncated at the quoted heading.
  it('ignores headings inside fenced code', () => {
    const md = '## [1.0.0]\n\n```md\n## [0.9.0]\n```\n\nAfter the fence.\n\n## [0.9.0]\n\nOld.\n';
    const section = extractChangelogSection(md, '1.0.0');
    expect(section).toContain('After the fence.');
    expect(section).not.toContain('Old.');
  });
});

describe('releasePageUrl', () => {
  // Namespaced, because a bare `v0.3.1` in that repo belongs to whichever
  // sibling app tagged it first.
  it('namespaces the tag under the app', () => {
    expect(releasePageUrl('0.3.1')).toBe(
      'https://github.com/bilo-io/midnite-apps/releases/tag/midnite-studio/v0.3.1',
    );
  });
});
