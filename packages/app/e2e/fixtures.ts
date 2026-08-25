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

export const fixtures: MockFixtures = {
  commitDetail: {
    sha: SHA,
    body: 'feat(phase-11): package, install and run from /Applications\n\nmacOS arm64 dmg + zip. Main and preload are bundled.',
    stat: '',
    files: [
      { path: 'packages/desktop/src/main/window.ts', insertions: 4, deletions: 1 },
      { path: '.github/workflows/ci.yml', insertions: 2, deletions: 0 },
      { path: 'docs/screenshots/phase-11-packaged-app.png', insertions: 0, deletions: 0 },
      { path: 'pnpm-lock.yaml', insertions: 4000, deletions: 0 },
    ],
  },
  diffs: {
    [`${SHA}:packages/desktop/src/main/window.ts`]: windowDiff,
    [`${SHA}:.github/workflows/ci.yml`]: gappedDiff,
    [`${SHA}:.github/workflows/ci.yml:12`]: gappedExpanded,
    [`${SHA}:docs/screenshots/phase-11-packaged-app.png`]: binaryDiff,
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
