import type { MockFixtures } from './mock-bridge';

/**
 * Fixture data shaped exactly like what main sends — a parsed `FileDiff`, not
 * patch text. Built by hand rather than captured, so each case states the one
 * thing it exercises.
 */

const SHA = 'd9f738429e8a3f30920439adb69f4a474fdcbccf';

type Line = {
  kind: 'add' | 'del' | 'ctx';
  oldNo: number | null;
  newNo: number | null;
  text: string;
  ranges: Array<{ start: number; end: number }>;
  noNewline: boolean;
};

const line = (over: Partial<Line> & Pick<Line, 'kind'>): Line => ({
  oldNo: null,
  newNo: null,
  text: '',
  ranges: [],
  noNewline: false,
  ...over,
});

const fileDiff = (over: Record<string, unknown>) => ({
  path: 'packages/desktop/src/main/window.ts',
  oldPath: 'packages/desktop/src/main/window.ts',
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
  ...over,
});

/** A modification carrying an intraline range — one changed word on one line. */
const windowDiff = fileDiff({
  insertions: 4,
  deletions: 1,
  hunks: [
    {
      oldStart: 40,
      oldLines: 6,
      newStart: 40,
      newLines: 9,
      heading: 'function createWindow() {',
      lines: [
        line({ kind: 'ctx', oldNo: 40, newNo: 40, text: 'const win = new BrowserWindow({' }),
        line({ kind: 'ctx', oldNo: 41, newNo: 41, text: '  width: 1280,' }),
        line({
          kind: 'del',
          oldNo: 42,
          text: '  height: 720,',
          ranges: [{ start: 10, end: 13 }],
        }),
        line({
          kind: 'add',
          newNo: 42,
          text: '  height: 880,',
          ranges: [{ start: 10, end: 13 }],
        }),
        line({ kind: 'add', newNo: 43, text: '  minWidth: 960,' }),
        line({ kind: 'add', newNo: 44, text: '  minHeight: 600,' }),
        line({ kind: 'add', newNo: 45, text: '  titleBarStyle: "hiddenInset",' }),
        line({ kind: 'ctx', oldNo: 43, newNo: 46, text: '});' }),
      ],
    },
  ],
});

/** Two hunks with a gap between them, so the expander has something to offer. */
const gappedDiff = fileDiff({
  path: '.github/workflows/ci.yml',
  oldPath: '.github/workflows/ci.yml',
  insertions: 2,
  deletions: 0,
  hunks: [
    {
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 3,
      heading: '',
      lines: [
        line({ kind: 'ctx', oldNo: 1, newNo: 1, text: 'name: ci' }),
        line({ kind: 'add', newNo: 2, text: 'on: [push, pull_request]' }),
        line({ kind: 'ctx', oldNo: 2, newNo: 3, text: 'jobs:' }),
      ],
    },
    {
      oldStart: 60,
      oldLines: 2,
      newStart: 61,
      newLines: 3,
      heading: 'jobs.build',
      lines: [
        line({ kind: 'ctx', oldNo: 60, newNo: 61, text: '      - run: moon run :test' }),
        line({ kind: 'add', newNo: 62, text: '      - run: moon run :lint' }),
        line({ kind: 'ctx', oldNo: 61, newNo: 63, text: '      - run: echo done' }),
      ],
    },
  ],
});

/** The same file at a wider `-U`, proving expansion is a refetch. */
const gappedExpanded = fileDiff({
  path: '.github/workflows/ci.yml',
  oldPath: '.github/workflows/ci.yml',
  insertions: 2,
  deletions: 0,
  contextLines: 12,
  hunks: [
    {
      oldStart: 1,
      oldLines: 63,
      newStart: 1,
      newLines: 64,
      heading: '',
      lines: [
        line({ kind: 'ctx', oldNo: 1, newNo: 1, text: 'name: ci' }),
        line({ kind: 'add', newNo: 2, text: 'on: [push, pull_request]' }),
        line({ kind: 'ctx', oldNo: 2, newNo: 3, text: 'jobs:' }),
        line({ kind: 'ctx', oldNo: 3, newNo: 4, text: '  build:' }),
        line({ kind: 'ctx', oldNo: 4, newNo: 5, text: '    runs-on: ubuntu-latest' }),
        line({ kind: 'add', newNo: 62, text: '      - run: moon run :lint' }),
      ],
    },
  ],
});

const binaryDiff = fileDiff({
  path: 'docs/screenshots/phase-11-packaged-app.png',
  oldPath: 'docs/screenshots/phase-11-packaged-app.png',
  binary: true,
});

/**
 * A binary that is NOT an image, so the "no textual diff" sentence still has a
 * case: the png above now renders the image viewer instead.
 */
const opaqueBinaryDiff = fileDiff({
  path: 'packages/app/src/fonts/inter.woff2',
  oldPath: 'packages/app/src/fonts/inter.woff2',
  binary: true,
});

/** Capped, so the "more lines not shown" notice has something to report. */
const truncatedDiff = fileDiff({
  path: 'pnpm-lock.yaml',
  oldPath: 'pnpm-lock.yaml',
  insertions: 4000,
  deletions: 0,
  truncated: true,
  droppedLines: 16_412,
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 4000,
      heading: '',
      lines: Array.from({ length: 40 }, (_, i) =>
        line({ kind: 'add', newNo: i + 1, text: `  '@scope/package-${i}': 1.0.${i}` }),
      ),
    },
  ],
});

export const COMMIT_SHA = SHA;
/** The parent of `SHA` — the target of the inspector's parent-navigation row. */
export const PARENT_SHA = 'f11fafb4c693a8e38ad44f04e4908c15315843a3';
/** A commit referenced by an abbreviated sha in the message body, in this repo. */
export const LINKED_SHA = '4c1a9b2038e75d6f83b1c0e4a7d59f21630bc8ae';
export const LINKED_ABBREV = '4c1a9b2';
/** An abbreviation `revParse` cannot resolve — the not-found state. */
export const ORPHAN_ABBREV = 'a1b2c3d';

const identity = (over: Record<string, unknown> = {}) => ({
  name: 'Bilo Lwabona',
  email: 'bilo.lwabona@ekko.earth',
  date: 1_787_000_000,
  ...over,
});

/**
 * The message the inspector's Theme A path is asserted against.
 *
 * Deliberately one line of each kind the matcher claims to handle, plus the
 * `deadbeef` false positive and a fenced sha the ancestor skip must leave alone.
 */
const BODY = [
  'feat(phase-11): package, install and run from /Applications',
  '',
  'macOS arm64 dmg + zip. Main and preload are bundled.',
  '',
  `Follows on from ${LINKED_ABBREV}, closes #123, see https://example.com/notes.`,
  'The deadbeef path is unaffected.',
  '',
  '```',
  'const sha = 7c521fe;',
  '```',
  '',
  'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
].join('\n');

export const fixtures: MockFixtures = {
  commitDetails: {
    [SHA]: {
      sha: SHA,
      parents: [PARENT_SHA],
      subject: 'feat(phase-11): package, install and run from /Applications',
      body: BODY,
      author: identity(),
      // Differs from the author in both name and email, so the committer row
      // renders — the case a squash-merge through a forge produces.
      committer: identity({ name: 'GitHub', email: 'noreply@github.com' }),
      files: [
        {
          path: 'packages/desktop/src/main/window.ts',
          oldPath: null,
          insertions: 4,
          deletions: 1,
        },
        { path: '.github/workflows/ci.yml', oldPath: null, insertions: 2, deletions: 0 },
        {
          path: 'docs/screenshots/phase-11-packaged-app.png',
          oldPath: null,
          insertions: 0,
          deletions: 0,
        },
        {
          path: 'packages/app/src/fonts/inter.woff2',
          oldPath: null,
          insertions: 0,
          deletions: 0,
        },
        { path: 'pnpm-lock.yaml', oldPath: null, insertions: 4000, deletions: 0 },
      ],
    },
    // The root commit: no parents, one file, no trailers — the other end of
    // every branch in the header's rendering.
    [PARENT_SHA]: {
      sha: PARENT_SHA,
      parents: [],
      subject: 'chore: initial import',
      body: 'chore: initial import',
      author: identity(),
      committer: identity(),
      files: [{ path: 'README.md', oldPath: null, insertions: 1, deletions: 0 }],
    },
    [LINKED_SHA]: {
      sha: LINKED_SHA,
      parents: [PARENT_SHA],
      subject: 'fix(graph): the linkified target',
      body: 'fix(graph): the linkified target',
      author: identity(),
      committer: identity(),
      files: [{ path: 'packages/app/src/a.ts', oldPath: null, insertions: 2, deletions: 2 }],
    },
  },
  revisions: {
    [LINKED_ABBREV]: LINKED_SHA,
    [PARENT_SHA]: PARENT_SHA,
    [SHA]: SHA,
  },
  diffs: {
    [`${SHA}:packages/desktop/src/main/window.ts`]: windowDiff,
    [`${SHA}:.github/workflows/ci.yml`]: gappedDiff,
    [`${SHA}:.github/workflows/ci.yml:12`]: gappedExpanded,
    [`${SHA}:docs/screenshots/phase-11-packaged-app.png`]: binaryDiff,
    [`${SHA}:packages/app/src/fonts/inter.woff2`]: opaqueBinaryDiff,
    [`${SHA}:pnpm-lock.yaml`]: truncatedDiff,
    'wt:packages/desktop/src/main/window.ts': windowDiff,
  },
  graphRows: [
    {
      row: 0,
      commit: {
        sha: SHA,
        parents: ['f11fafb4c693a8e38ad44f04e4908c15315843a3'],
        authorName: 'Bilo Lwabona',
        authorEmail: 'bilo.lwabona@ekko.earth',
        authorDate: 1_787_000_000,
        committerDate: 1_787_000_000,
        subject: 'feat(phase-11): package, install and run from /Applications',
        refs: ['refs/heads/main'],
      },
      lane: 0,
      colorIdx: 0,
      edges: [],
      laneCount: 1,
    },
  ],
  statusEntries: [],
};
