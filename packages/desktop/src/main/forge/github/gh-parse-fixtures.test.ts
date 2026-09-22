import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parsePullList } from './gh-parse';

// Loaded via `readFileSync`, not an `import … from '*.json'` — desktop's
// `tsconfig.json` inherits `composite: true` from the base config, under
// which TypeScript's project-reference build mode does not add a JSON
// module pulled in only through an import to the project's own file list
// (TS6307). `packages/app` sidesteps this by declaring `composite: false`
// outright; that is a package-wide setting change well outside this
// fixture-test's scope, so this reads the same bytes a JSON import would,
// the way `grep-parser.test.ts` already does for its own text fixture.
const prList: unknown = JSON.parse(readFileSync(join(__dirname, '__fixtures__/gh-pr-list.json'), 'utf8'));

/**
 * Phase 90 Theme K — fixture-driven mapper test.
 *
 * `gh-parse.test.ts` already covers `parsePullList`'s branch logic against
 * hand-built minimal literals (one field changed at a time). This is the
 * different, complementary check the phase doc asks for: a **captured
 * response shape** — three real PRs' worth of the noisy extra fields `gh pr
 * list --json` actually sends (`labels`, `mergeable`, `additions`,
 * `deletions`, timestamps, a GraphQL `__typename` on every check run) that
 * the inline literals never carry — proving the parser reads only the
 * fields it declares and tolerates everything else, rather than merely
 * matching a shape the test itself constructed.
 */
describe('parsePullList — fixture (gh-pr-list.json)', () => {
  const pulls = parsePullList(prList);

  it('maps all three rows', () => {
    expect(pulls).toHaveLength(3);
  });

  it('maps an open, approved PR with passing checks, ignoring the noise fields', () => {
    expect(pulls[0]).toEqual({
      id: 'PR_kwDOJ3xN9M6XyzAb',
      number: 412,
      title: 'Add rate limiter to fetch pipeline',
      state: 'open',
      isDraft: false,
      reviewDecision: 'APPROVED',
      checks: 'passing',
      headBranch: 'feature/fetch-rate-limiter',
      author: 'bilo',
      url: 'https://github.com/bilo-io/midnite-studio/pull/412',
      mergedAt: null,
      closedAt: null,
    });
  });

  it('maps a merged PR, carrying its merge and close dates', () => {
    expect(pulls[1]).toMatchObject({
      number: 407,
      state: 'merged',
      mergedAt: '2026-09-06T17:45:11Z',
      closedAt: '2026-09-06T17:45:11Z',
    });
  });

  it('maps a closed, draft PR with changes requested and failing checks — and turns the zero-time mergedAt honest', () => {
    expect(pulls[2]).toMatchObject({
      number: 399,
      state: 'closed',
      isDraft: true,
      reviewDecision: 'CHANGES_REQUESTED',
      checks: 'failing',
      // gh's zero-time sentinel for "never merged" — parsePullList's own rule,
      // exercised here against a real captured value rather than a hand-typed one.
      mergedAt: null,
    });
  });
});
