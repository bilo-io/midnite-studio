import { describe, expect, it } from 'vitest';

import { extractLatestSections } from './release';

const MD = `# Changelog

## [Unreleased]
- wip

## [1.3.0] - 2026-03-01
- c

## [1.2.0] - 2026-02-01
\`\`\`
## not a heading
\`\`\`

## [1.1.0] - 2026-01-01
- a

## [1.0.0]

[Unreleased]: https://x/y
`;

describe('extractLatestSections', () => {
  it('returns the newest n released sections and skips Unreleased', () => {
    const r = extractLatestSections(MD, 2);
    expect(r.map((s) => s.version)).toEqual(['1.3.0', '1.2.0']);
    expect(r[0]).toEqual({ version: '1.3.0', date: '2026-03-01', body: '- c' });
    expect(r[1]?.body).toContain('## not a heading');
  });
  it('returns fewer when the file has fewer, dropping empty sections', () => {
    expect(extractLatestSections(MD, 10).map((s) => s.version)).toEqual(['1.3.0', '1.2.0', '1.1.0']);
  });
  it('tolerates CRLF', () => {
    const r = extractLatestSections(MD.replace(/\n/g, '\r\n'), 1);
    expect(r).toEqual([{ version: '1.3.0', date: '2026-03-01', body: '- c' }]);
  });
  it('handles empty, malformed and bad n', () => {
    expect(extractLatestSections('', 3)).toEqual([]);
    expect(extractLatestSections('no headings', 3)).toEqual([]);
    expect(extractLatestSections(MD, 0)).toEqual([]);
  });
});
