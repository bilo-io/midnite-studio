import { describe, expect, it } from 'vitest';
import {
  areSetsEqual,
  computeProgress,
  fixTrackerIndex,
  isExcludedItem,
  parseIndex,
  parsePhaseDoc,
  runTrackerChecks,
} from './tracker-check.mjs';

describe('tracker-check unit tests', () => {
  describe('isExcludedItem', () => {
    it('recognises deferred markers', () => {
      expect(isExcludedItem('⏳ deferred')).toBe(true);
      expect(isExcludedItem('⏳ *only if Phase 23 has landed:* ...')).toBe(true);
      expect(isExcludedItem('**⏳ deferred**')).toBe(true);
      expect(isExcludedItem('(⏳ deferred)')).toBe(true);
      expect(isExcludedItem('[⏳ deferred]')).toBe(true);
    });

    it('recognises out of scope markers', () => {
      expect(isExcludedItem('❌ OUT OF SCOPE')).toBe(true);
      expect(isExcludedItem('**❌ OUT OF SCOPE**')).toBe(true);
      expect(isExcludedItem('(❌ OUT OF SCOPE)')).toBe(true);
      expect(isExcludedItem('[❌ OUT OF SCOPE]')).toBe(true);
    });

    it('does not exclude ordinary items that happen to mention words in text', () => {
      expect(
        isExcludedItem(
          'A phase whose items are all ❌ OUT OF SCOPE reports 0/0 and —, not a division by zero.'
        )
      ).toBe(false);
      expect(
        isExcludedItem('Handle edge cases where network is deferred or slow.')
      ).toBe(false);
    });
  });

  describe('parsePhaseDoc', () => {
    it('counts checked, open, and excluded items correctly', () => {
      const doc = `
# Phase 99 — Mock Phase

## Deliverables

### A — First theme
- [x] Done item 1
- [ ] Open item 1
- [x] Done item 2
- [ ] ⏳ deferred item
- [ ] (❌ OUT OF SCOPE) item
- [ ] Open item 2

## Verification
- [ ] Verification step
`;
      const parsed = parsePhaseDoc(doc);
      expect(parsed.doneCount).toBe(2);
      expect(parsed.openCount).toBe(3); // open 1, open 2, verification step
      expect(parsed.totalCount).toBe(5);
      expect(parsed.themes).toEqual(['A']);
      expect(parsed.duplicateThemes).toEqual([]);
      expect(parsed.refined).toBe(null);
    });

    it('parses both theme heading forms and detects duplicate themes', () => {
      const doc = `
# Phase 98 — Multi-theme

### A — Standard heading form
- [x] Item

### Theme B — Extended heading form
- [ ] Item

## Theme C — Level 2 heading form
- [ ] Item

### A — Duplicate heading form
- [ ] Item
`;
      const parsed = parsePhaseDoc(doc);
      expect(parsed.themes).toEqual(['A', 'B', 'C', 'A']);
      expect(parsed.duplicateThemes).toEqual(['A']);
    });

    it('extracts Refined stamp', () => {
      const doc = `
# Phase 97 — Refined
**Refined: x2** · 2026-08-30
- [x] Item
`;
      const parsed = parsePhaseDoc(doc);
      expect(parsed.refined).toBe('x2');
    });
  });

  describe('computeProgress', () => {
    it('handles 0 total gracefully without division by zero', () => {
      const progress = computeProgress(0, 0);
      expect(progress.bar).toBe('`░░░░░░░░░░`');
      expect(progress.pctStr).toBe('—');
    });

    it('computes rounded percentage and 10-cell progress bar', () => {
      expect(computeProgress(0, 31)).toEqual({
        bar: '`░░░░░░░░░░`',
        pctStr: '0%',
      });
      expect(computeProgress(15, 30)).toEqual({
        bar: '`█████░░░░░`',
        pctStr: '50%',
      });
      expect(computeProgress(31, 32)).toEqual({
        bar: '`██████████`',
        pctStr: '97%',
      });
      expect(computeProgress(10, 10)).toEqual({
        bar: '`██████████`',
        pctStr: '100%',
      });
    });
  });

  describe('areSetsEqual', () => {
    it('compares unordered arrays as sets', () => {
      expect(areSetsEqual(['A', 'B'], ['B', 'A'])).toBe(true);
      expect(areSetsEqual(['A', 'A', 'B'], ['B', 'A'])).toBe(true);
      expect(areSetsEqual(['A', 'B'], ['A', 'B', 'C'])).toBe(false);
      expect(areSetsEqual(['A'], ['B'])).toBe(false);
    });
  });

  describe('runTrackerChecks with fixtures', () => {
    const validIndex = `
# Index

## Phases

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [1 · Test Phase](phases/phase-1-test.md) | ✅ DONE | x1 | 2/2 | \`██████████\` | 100% | — | — |

## Theme key

### [Phase 1 — Test Phase](phases/phase-1-test.md)

- ✅ **A** — Theme A description
- ✅ **B** — Theme B description
`;

    const validDoc1 = `
# Phase 1 — Test Phase
**Refined: x1**

### A — Theme A
- [x] Item 1

### Theme B — Theme B
- [x] Item 2
`;

    it('passes all 7 rules on a perfectly consistent setup', () => {
      const docFiles = new Map([
        ['phases/phase-1-test.md', validDoc1],
      ]);
      const { violations, warnings } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      expect(violations).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it('fails Rule 1 when a phase doc has no index row', () => {
      const docFiles = new Map([
        ['phases/phase-1-test.md', validDoc1],
        ['phases/phase-2-orphan.md', '# Phase 2\n- [ ] Item'],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      const rule1 = violations.find((v) => v.rule === 1);
      expect(rule1).toBeDefined();
      expect(rule1?.phase).toBe(2);
    });

    it('fails Rule 2 when an index row references a non-existent doc', () => {
      const docFiles = new Map(); // empty
      const { violations } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      const rule2 = violations.find((v) => v.rule === 2);
      expect(rule2).toBeDefined();
      expect(rule2?.phase).toBe(1);
    });

    it('fails Rule 3 when counts disagree', () => {
      const badCountsDoc = `
# Phase 1 — Test Phase
**Refined: x1**
### A — Theme A
- [x] Item 1
- [ ] Item 2
### Theme B — Theme B
- [ ] Item 3
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', badCountsDoc],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      const rule3 = violations.find((v) => v.rule === 3);
      expect(rule3).toBeDefined();
      expect(rule3?.expected).toContain('1/3');
      expect(rule3?.actual).toContain('2/2');
    });

    it('fails Rule 4 when doc contains duplicate theme letters', () => {
      const dupThemeDoc = `
# Phase 1 — Test Phase
**Refined: x1**
### A — Theme A
- [x] Item 1
### A — Theme A again
- [x] Item 2
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', dupThemeDoc],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      const rule4 = violations.find((v) => v.rule === 4);
      expect(rule4).toBeDefined();
      expect(rule4?.actual).toContain('A');
    });

    it('fails Rule 5 when theme letters disagree', () => {
      const letterMismatchDoc = `
# Phase 1 — Test Phase
**Refined: x1**
### A — Theme A
- [x] Item 1
### C — Theme C
- [x] Item 2
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', letterMismatchDoc],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: validIndex,
        docFiles,
      });
      const rule5 = violations.find((v) => v.rule === 5);
      expect(rule5).toBeDefined();
      expect(rule5?.expected).toContain('A,C');
      expect(rule5?.actual).toContain('A,B');
    });

    it('fails Rule 6 when Refined stamp does not match index cell', () => {
      const unrefinedDoc = `
# Phase 1 — Test Phase
### A — Theme A
- [x] Item 1
### Theme B — Theme B
- [x] Item 2
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', unrefinedDoc],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: validIndex, // index has x1
        docFiles,
      });
      const rule6 = violations.find((v) => v.rule === 6);
      expect(rule6).toBeDefined();
      expect(rule6?.expected).toBe('— (from doc)');
      expect(rule6?.actual).toBe('x1 (in index)');
    });

    it('fails Rule 7 when progress bar or percent does not match counts', () => {
      const indexWithBadBar = `
## Phases
| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [1 · Test Phase](phases/phase-1-test.md) | 🔄 WIP | x1 | 1/2 | \`░░░░░░░░░░\` | 10% | A | B |

## Theme key
### [Phase 1 — Test Phase](phases/phase-1-test.md)
- ✅ **A** — Theme A
- ◻ **B** — Theme B
`;
      const doc = `
# Phase 1 — Test Phase
**Refined: x1**
### A — Theme A
- [x] Item 1
### Theme B — Theme B
- [ ] Item 2
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', doc],
      ]);
      const { violations } = runTrackerChecks({
        indexContent: indexWithBadBar,
        docFiles,
      });
      const rule7 = violations.find((v) => v.rule === 7);
      expect(rule7).toBeDefined();
      expect(rule7?.expected).toContain('50%');
    });

    it('emits a warning if status is WIP but WIP column is empty', () => {
      const indexWithEmptyWip = `
## Phases
| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [1 · Test Phase](phases/phase-1-test.md) | 🔄 WIP | x1 | 2/2 | \`██████████\` | 100% | — | — |

## Theme key
### [Phase 1 — Test Phase](phases/phase-1-test.md)
- ✅ **A** — Theme A
- ✅ **B** — Theme B
`;
      const docFiles = new Map([
        ['phases/phase-1-test.md', validDoc1],
      ]);
      const { warnings, violations } = runTrackerChecks({
        indexContent: indexWithEmptyWip,
        docFiles,
      });
      expect(violations).toEqual([]);
      expect(warnings.length).toBe(1);
      expect(warnings[0]?.message).toContain('status is 🔄 WIP but WIP column is empty');
    });
  });

  describe('fixTrackerIndex', () => {
    it('corrects counts, bar, % and flips ✅ DONE to 🔄 WIP if done < total', () => {
      const staleIndex = `
## Phases
| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [1 · Test Phase](phases/phase-1-test.md) | ✅ DONE | — | 10/10 | \`██████████\` | 100% | — | — |

## Theme key
### [Phase 1 — Test Phase](phases/phase-1-test.md)
- ✅ **A** — Theme A
`;
      const realDoc = `
# Phase 1 — Test Phase
### A — Theme A
- [x] Item 1
- [ ] Item 2
- [ ] Item 3
- [ ] Item 4
`;
      const docPhases = new Map([
        [1, { path: 'phases/phase-1-test.md', content: realDoc }],
      ]);

      const { content: fixed, fixedPhases } = fixTrackerIndex(staleIndex, docPhases);
      expect(fixedPhases).toEqual([1]);
      expect(fixed).toContain('| [1 · Test Phase](phases/phase-1-test.md) | 🔄 WIP | — | 1/4 | `███░░░░░░░` | 25% | — | — |');
    });

    it('does NOT modify duplicate theme letters or theme letter mismatches', () => {
      const index = `
## Phases
| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [1 · Test Phase](phases/phase-1-test.md) | 🔄 WIP | — | 1/1 | \`██████████\` | 100% | A | — |

## Theme key
### [Phase 1 — Test Phase](phases/phase-1-test.md)
- ✅ **A** — Theme A
- ◻ **B** — Theme B
`;
      const docWithDupAndMismatch = `
# Phase 1 — Test Phase
### A — Theme A
- [x] Item 1
### A — Theme A duplicate
`;
      const docPhases = new Map([
        [1, { path: 'phases/phase-1-test.md', content: docWithDupAndMismatch }],
      ]);

      const { content: fixed } = fixTrackerIndex(index, docPhases);
      // Theme key section in index is untouched
      expect(fixed).toContain('- ✅ **A** — Theme A');
      expect(fixed).toContain('- ◻ **B** — Theme B');
    });
  });
});
