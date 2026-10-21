import { describe, expect, it } from 'vitest';

import {
  APP_ISSUE_URL_MAX,
  appIssueBody,
  appIssueFormUrl,
  extractChangelogSection,
  NEW_ISSUE_URL,
  releasePageUrl,
} from './release';

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

describe('appIssueFormUrl', () => {
  const params = (url: string) => new URL(url).searchParams;
  const base = {
    title: '[bug] Graph is blank',
    description: 'It broke & stayed broken.',
    diagnostics: 'INFO boot',
  };

  it('opens the bug form on midnite-apps with each field by its form id', () => {
    const url = appIssueFormUrl({ ...base, kind: 'bug', version: '0.0.2' });
    expect(url.startsWith('https://github.com/bilo-io/midnite-apps/issues/new?')).toBe(true);
    const query = params(url);
    expect(query.get('template')).toBe('bug.yml');
    expect(query.get('title')).toBe('[bug] Graph is blank');
    expect(query.get('app')).toBe('midnite-studio');
    expect(query.get('version')).toBe('0.0.2');
    expect(query.get('what')).toBe('It broke & stayed broken.');
    expect(query.get('logs')).toBe('INFO boot');
    expect(query.has('body')).toBe(false);
  });

  it('opens the feature form, which has no logs or version field', () => {
    const query = params(appIssueFormUrl({ ...base, kind: 'feature', version: '0.0.2' }));
    expect(query.get('template')).toBe('feature.yml');
    expect(query.get('problem')).toBe('It broke & stayed broken.');
    expect(query.has('logs')).toBe(false);
    expect(query.has('version')).toBe(false);
  });

  it('leaves the version empty for an unversioned build', () => {
    expect(params(appIssueFormUrl({ ...base, kind: 'bug', version: '0.0.0' })).has('version')).toBe(
      false,
    );
  });

  it('stays under the URL ceiling by dropping the oldest log lines first', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n');
    const url = appIssueFormUrl({ ...base, kind: 'bug', diagnostics: lines });
    expect(url.length).toBeLessThanOrEqual(APP_ISSUE_URL_MAX);
    const logs = params(url).get('logs')!;
    expect(logs.startsWith('… (older lines trimmed)\n')).toBe(true);
    expect(logs.endsWith('line 1999')).toBe(true);
    expect(params(url).get('what')).toBe(base.description);
  });

  it('cuts the description only once the logs are gone', () => {
    const url = appIssueFormUrl({ ...base, kind: 'feature', description: 'é'.repeat(5000) });
    expect(url.length).toBeLessThanOrEqual(APP_ISSUE_URL_MAX);
    expect(params(url).get('problem')!.length).toBeGreaterThan(0);
  });

  it('points the chooser constant at the chooser, not a blank issue', () => {
    expect(NEW_ISSUE_URL).toBe('https://github.com/bilo-io/midnite-apps/issues/new/choose');
  });
});

describe('appIssueBody', () => {
  const draft = {
    kind: 'bug' as const,
    title: '[bug] Graph is blank',
    description: '  It broke & stayed broken.  ',
    diagnostics: 'INFO boot',
    version: '0.0.3',
  };

  /** The answer midnite-apps' `issue-app-label.yml` reads: the first non-empty line under `### App`. */
  const appAnswer = (body: string): string | null => {
    const lines = body.split(/\r?\n/);
    const heading = lines.findIndex((l) => /^###\s+App\s*$/.test(l.trim()));
    if (heading === -1) return null;
    for (const line of lines.slice(heading + 1)) {
      if (!line.trim()) continue;
      return line.trim().startsWith('###') ? null : line.trim();
    }
    return null;
  };

  it('answers the label workflow with the app id, so gh\'s app label is not stripped again', () => {
    expect(appAnswer(appIssueBody(draft))).toBe('midnite-studio');
    expect(appAnswer(appIssueBody({ ...draft, kind: 'feature' }))).toBe('midnite-studio');
  });

  it('lays a bug out as the bug form renders: app, version, what happened, logs', () => {
    expect(appIssueBody(draft)).toBe(
      [
        '### App\n\nmidnite-studio',
        '### Version\n\n0.0.3',
        '### What happened?\n\nIt broke & stayed broken.',
        '### Errors or logs\n\n```\nINFO boot\n```',
      ].join('\n\n'),
    );
  });

  it("heads a feature's words as the feature form does, and keeps its diagnostics", () => {
    const body = appIssueBody({ ...draft, kind: 'feature' });
    expect(body).toContain("### What's the problem?\n\nIt broke & stayed broken.");
    expect(body).toContain('### Errors or logs');
  });

  it('leaves out the version of an unversioned build and an empty diagnostics block', () => {
    const body = appIssueBody({ ...draft, version: '0.0.0', diagnostics: '  ' });
    expect(body).not.toContain('### Version');
    expect(body).not.toContain('### Errors or logs');
  });
});
