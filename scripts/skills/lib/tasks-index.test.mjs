import { describe, expect, it } from 'vitest';

import { countByTheme, countCheckboxes, parseIndex, updateIndexRow } from './tasks-index.mjs';

const INDEX = `# Idx

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [151 · Skill scripts](phases/phase-151.md) | ◻ TODO | — | 0/30 | \`░░░░░░░░░░\` | 0% | — | A B |
| [150 · Startup](phases/phase-150.md) | 🔄 WIP | x1 | 12/41 | \`███░░░░░░░\` | 29% | C | — |

prose after
`;

describe('parseIndex', () => {
  it('reads rows', () => {
    const rows = parseIndex(INDEX);
    expect(rows.map((r) => r.phase)).toEqual([151, 150]);
    expect(rows[1]).toMatchObject({ status: '🔄 WIP', done: '12/41', wip: 'C', path: 'phases/phase-150.md' });
  });
});

describe('updateIndexRow', () => {
  it('rewrites only the target row cells and round-trips the rest', () => {
    const out = updateIndexRow(INDEX, 151, { done: 15, total: 30 });
    expect(out).toContain('| 15/30 | `█████░░░░░` | 50% |');
    expect(out).toContain('| [150 · Startup](phases/phase-150.md) | 🔄 WIP | x1 | 12/41 | `███░░░░░░░` | 29% | C | — |');
    expect(out.endsWith('prose after\n')).toBe(true);
    expect(parseIndex(out)[0]).toMatchObject({ phase: 151, done: '15/30', pct: '50%', status: '◻ TODO', todo: 'A B' });
  });
  it('is a no-op for an unknown phase', () => expect(updateIndexRow(INDEX, 9, { done: 1, total: 2 })).toBe(INDEX));
});

describe('countCheckboxes', () => {
  const doc = `### Theme A — first
- [x] one
- [ ] two
- [ ] ⏳ deferred later
- [ ] (❌ OUT OF SCOPE) nope
### Theme B — second
- [X] three
- [ ] four
## Verification
- [ ] verify
`;
  it('counts done/open and excludes deferred and out-of-scope', () => {
    expect(countCheckboxes(doc)).toMatchObject({ done: 2, open: 3, excluded: 2, total: 5, pct: 40, bar: '████░░░░░░' });
  });
  it('groups by theme and ignores items under non-theme headings', () => {
    expect(countByTheme(doc)).toEqual({ A: { done: 1, open: 1 }, B: { done: 1, open: 1 } });
  });
  it('handles an empty doc', () => expect(countCheckboxes('')).toMatchObject({ total: 0, pct: 0 }));
});
