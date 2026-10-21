import type { MockFixtures } from './mock-bridge';

/**
 * A realistic pull request for the Conversation tab: one CHANGES_REQUESTED
 * review with two threads nested under it (by `reviewId`), a resolved thread,
 * an outdated thread, and one thread with `reviewId: null` that interleaves by
 * date. Every `diffHunk` is the real excerpt of the patch in `pullFiles`.
 *
 * Its own export — not merged into `fixtures` — so no spec that counts the
 * default fixtures' PRs or threads can change. Use it as
 * `{ ...fixtures, forge: CONVERSATION_FORGE }`.
 */

const line = (
  kind: 'add' | 'del' | 'ctx',
  text: string,
  oldNo: number | null,
  newNo: number | null,
): Record<string, unknown> => ({ kind, oldNo, newNo, text, ranges: [], noNewline: false });

const file = (
  path: string,
  lines: Record<string, unknown>[],
  insertions: number,
  deletions: number,
): Record<string, unknown> => ({
  path,
  oldPath: null,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    { oldStart: 1, oldLines: 4 + deletions, newStart: 1, newLines: 4 + insertions, heading: '', lines },
  ],
  insertions,
  deletions,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

export const CONVERSATION_PR_NUMBER = 77;
export const CONVERSATION_REVIEW_ID = '7001';
export const CONVERSATION_HUNK_FILE = 'src/lib/retry.ts';
export const CONVERSATION_FAR_FILE = 'src/lib/zeta.ts';

const RETRY = file(
  CONVERSATION_HUNK_FILE,
  [
    line('ctx', 'export async function retry<T>(fn: () => Promise<T>): Promise<T> {', 1, 1),
    line('del', '  return fn();', 2, null),
    line('add', '  let lastError: unknown;', null, 2),
    line('add', '  for (let attempt = 0; attempt < 3; attempt += 1) {', null, 3),
    line('add', '    try {', null, 4),
    line('add', '      return await fn();', null, 5),
    line('add', '    } catch (error) {', null, 6),
    line('add', '      lastError = error;', null, 7),
    line('add', '    }', null, 8),
    line('add', '  }', null, 9),
    line('add', '  throw lastError;', null, 10),
    line('ctx', '}', 3, 11),
  ],
  9,
  1,
);

const plain = (path: string): Record<string, unknown> =>
  file(
    path,
    [
      line('ctx', `// ${path}`, 1, 1),
      line('del', 'export const value = 1;', 2, null),
      line('add', 'export const value = 2;', null, 2),
      line('ctx', 'export default value;', 3, 3),
    ],
    1,
    1,
  );

const comment = (
  id: string,
  author: string,
  body: string,
  createdAt: string,
  diffHunk: string,
  reviewId: string | null,
): Record<string, unknown> => ({
  id,
  databaseId: id.replace(/\D/g, '') || '1',
  author,
  body,
  createdAt,
  url: '',
  diffHunk,
  reviewId,
});

// Ends at the commented line, exactly as GitHub's `diff_hunk` does.
const HUNK_TO_RETURN = [
  '@@ -1,3 +1,11 @@',
  ' export async function retry<T>(fn: () => Promise<T>): Promise<T> {',
  '-  return fn();',
  '+  let lastError: unknown;',
  '+  for (let attempt = 0; attempt < 3; attempt += 1) {',
  '+    try {',
  '+      return await fn();',
].join('\n');
const HUNK_TO_THROW = [HUNK_TO_RETURN, '+    } catch (error) {', '+      lastError = error;', '+    }', '+  }', '+  throw lastError;'].join('\n');
const HUNK_VALUE = [
  '@@ -1,3 +1,3 @@',
  ' // src/lib/alpha.ts',
  '-export const value = 1;',
  '+export const value = 2;',
].join('\n');

const thread = (
  id: string,
  path: string,
  lineNo: number | null,
  flags: { resolved?: boolean; outdated?: boolean },
  comments: Record<string, unknown>[],
): Record<string, unknown> => ({
  id,
  path,
  line: lineNo,
  originalLine: lineNo ?? 5,
  startLine: null,
  side: 'RIGHT',
  resolved: flags.resolved ?? false,
  outdated: flags.outdated ?? false,
  fileLevel: false,
  comments,
});

export const CONVERSATION_FORGE: NonNullable<MockFixtures['forge']> = {
  cli: { reason: 'ready' },
  pulls: [
    {
      number: CONVERSATION_PR_NUMBER,
      title: 'Retry transient failures',
      state: 'open',
      isDraft: false,
      reviewDecision: 'CHANGES_REQUESTED',
      checks: 'passing',
      headBranch: 'feature/retry',
      author: 'bilo',
      url: `https://github.com/bilo-io/midnite-studio/pull/${CONVERSATION_PR_NUMBER}`,
    },
  ],
  pullDetail: {
    [String(CONVERSATION_PR_NUMBER)]: {
      body: 'Wraps the flaky call in a bounded retry.',
      headSha: 'b'.repeat(40),
      baseBranch: 'main',
      additions: 13,
      deletions: 4,
      changedFiles: 5,
      mergeable: 'MERGEABLE',
    },
  },
  // Five files: the sixth-and-later "closed by default" rule needs more than three.
  pullFiles: {
    [String(CONVERSATION_PR_NUMBER)]: {
      files: [
        RETRY,
        plain('src/lib/alpha.ts'),
        plain('src/lib/beta.ts'),
        plain('src/lib/gamma.ts'),
        plain(CONVERSATION_FAR_FILE),
      ] as unknown[],
    },
  },
  pullComments: {
    [String(CONVERSATION_PR_NUMBER)]: [
      {
        id: '7000',
        kind: 'comment',
        author: 'bilo',
        body: 'Ready for another look.',
        createdAt: '2026-08-26T08:00:00Z',
        url: '',
      },
      {
        id: CONVERSATION_REVIEW_ID,
        kind: 'review',
        author: 'ana',
        body: 'Two things before this can land.',
        createdAt: '2026-08-26T09:00:00Z',
        url: '',
        reviewState: 'CHANGES_REQUESTED',
      },
      {
        id: '7002',
        kind: 'comment',
        author: 'maintainer',
        body: 'Thanks both — will re-review tomorrow.',
        createdAt: '2026-08-27T12:00:00Z',
        url: '',
      },
    ],
  },
  pullThreads: {
    [String(CONVERSATION_PR_NUMBER)]: [
      // Two threads under the CHANGES_REQUESTED review.
      thread('PRRT_ret', CONVERSATION_HUNK_FILE, 5, {}, [
        comment(
          'PRRC_7101',
          'ana',
          'Three attempts is a magic number — make it a parameter.',
          '2026-08-26T09:00:00Z',
          HUNK_TO_RETURN,
          CONVERSATION_REVIEW_ID,
        ),
        comment(
          'PRRC_7102',
          'bilo',
          'Good call, added `attempts` with a default of 3.',
          '2026-08-26T10:30:00Z',
          HUNK_TO_RETURN,
          CONVERSATION_REVIEW_ID,
        ),
      ]),
      thread('PRRT_throw', CONVERSATION_HUNK_FILE, 10, {}, [
        comment(
          'PRRC_7103',
          'ana',
          'Throwing `unknown` loses the stack — wrap it in an Error.',
          '2026-08-26T09:00:00Z',
          HUNK_TO_THROW,
          CONVERSATION_REVIEW_ID,
        ),
      ]),
      // Resolved.
      thread('PRRT_done', 'src/lib/alpha.ts', 2, { resolved: true }, [
        comment(
          'PRRC_7201',
          'maintainer',
          'Is bumping this constant intentional?',
          '2026-08-26T11:00:00Z',
          HUNK_VALUE,
          null,
        ),
        comment('PRRC_7202', 'bilo', 'Yes — matches the new default.', '2026-08-26T11:20:00Z', HUNK_VALUE, null),
      ]),
      // Outdated: the line it was on no longer exists.
      thread('PRRT_old', 'src/lib/beta.ts', null, { outdated: true }, [
        comment(
          'PRRC_7301',
          'ana',
          'This branch went away when the helper moved.',
          '2026-08-25T16:40:00Z',
          HUNK_VALUE.replace('alpha', 'beta'),
          null,
        ),
      ]),
      // No review id: interleaves by date.
      thread('PRRT_loose', 'src/lib/gamma.ts', 2, {}, [
        comment(
          'PRRC_7401',
          'maintainer',
          'Nit: prefer `as const` here.',
          '2026-08-27T09:00:00Z',
          HUNK_VALUE.replace('alpha', 'gamma'),
          null,
        ),
      ]),
    ],
  },
};
