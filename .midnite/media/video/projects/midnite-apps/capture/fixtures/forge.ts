/**
 * A seeded GitHub forge for forge-light: this repo's own recent pull requests
 * (#944–#952, real titles), with #950 open, its CI run still going (e2e shard
 * 4/4 running, the rest green), two review threads on `ci.yml`, a review
 * conversation, and the real hunks of its diff.
 */
import type { MockFixtures } from '../../../../../../../packages/app/test-support/mock-bridge';

const URL = 'https://github.com/bilo-io/midnite-studio';
const HEAD = 'e5859cdc096241d4489e46121cc4ddebd1503609';
const BASE = '6380f1d8a4c2e91b07d3f5a8c6e2b9d04f1a7c35';
const HOURS = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const MINS = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const pull = (over: Record<string, unknown>) => ({
  id: `PR_${String(over['number'])}`,
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: 'passing',
  author: 'bilo-io',
  mergedAt: null,
  closedAt: null,
  ...over,
  url: `${URL}/pull/${String(over['number'])}`,
});

export const PULLS = [
  pull({ number: 950, title: 'feat(ci): fold gate-locale into gate-native and rebalance to 4 e2e shards (Phase 116 Theme D)', headBranch: 'feature/phase-116-theme-d', checks: 'pending', reviewDecision: 'APPROVED' }),
  pull({ number: 952, title: 'feat(ci): consolidate gate-node with root test-node, lint-all, and typecheck-node (Phase 116 Theme A)', headBranch: 'feature/phase-116-theme-a', reviewDecision: 'APPROVED' }),
  pull({ number: 951, title: 'chore(e2e): purge 158 shot specs, inline screenshots, and unreferenced PNGs (Phase 116 Theme B)', headBranch: 'feature/phase-116-theme-b', reviewDecision: 'REVIEW_REQUIRED' }),
  pull({ number: 953, title: 'feat(monitor): per-process GPU share in the Usage panel (Phase 117 Theme A)', headBranch: 'feature/phase-117-theme-a', isDraft: true, checks: 'failing' }),
  pull({ number: 949, title: 'Release v0.0.4', headBranch: 'release/v0.0.4', state: 'merged', mergedAt: HOURS(9), closedAt: HOURS(9) }),
  pull({ number: 948, title: 'feat(loops): 1m, 2m, 5m and 10m cadences in a loop’s schedule', headBranch: 'feature/loop-cadences', state: 'merged', mergedAt: HOURS(11), closedAt: HOURS(11) }),
  pull({ number: 947, title: 'feat(launcher): Move all apps to Trash from the top bar', headBranch: 'feature/launcher-trash-all', state: 'merged', mergedAt: HOURS(14), closedAt: HOURS(14) }),
  pull({ number: 945, title: 'fix(install): Gatekeeper warns instead of refusing, the launcher is sealed, and releases check what the installers check', headBranch: 'fix/gatekeeper-warn', state: 'merged', mergedAt: HOURS(20), closedAt: HOURS(20) }),
  pull({ number: 944, title: 'fix(loops): Patrol’s Routine box adds a rule for labelled PRs, it no longer narrows the pass', headBranch: 'fix/patrol-routine', state: 'merged', mergedAt: HOURS(23), closedAt: HOURS(23) }),
];

type Row = { kind: 'add' | 'del' | 'ctx'; text: string };
const ctx = (text: string): Row => ({ kind: 'ctx', text });
const add = (text: string): Row => ({ kind: 'add', text });
const del = (text: string): Row => ({ kind: 'del', text });

function hunk(oldStart: number, newStart: number, heading: string, rows: Row[]) {
  let o = oldStart;
  let n = newStart;
  const lines = rows.map((row) => {
    const line = {
      kind: row.kind,
      oldNo: row.kind === 'add' ? null : o,
      newNo: row.kind === 'del' ? null : n,
      text: row.text,
      ranges: [],
      noNewline: false,
    };
    if (row.kind !== 'add') o += 1;
    if (row.kind !== 'del') n += 1;
    return line;
  });
  return {
    oldStart,
    oldLines: rows.filter((r) => r.kind !== 'add').length,
    newStart,
    newLines: rows.filter((r) => r.kind !== 'del').length,
    heading,
    lines,
  };
}

function file(path: string, hunks: ReturnType<typeof hunk>[]) {
  const all = hunks.flatMap((h) => h.lines);
  return {
    path,
    oldPath: null,
    change: 'modified',
    binary: false,
    oldMode: null,
    newMode: null,
    hunks,
    insertions: all.filter((l) => l.kind === 'add').length,
    deletions: all.filter((l) => l.kind === 'del').length,
    contextLines: 3,
    combined: false,
    truncated: false,
    droppedLines: 0,
  };
}

const CI_YML = file('.github/workflows/ci.yml', [
  hunk(338, 338, 'jobs:', [
    ctx('        run: pnpm exec moon run root:electron-freshness'),
    ctx(''),
    ctx('  gate-node-app-test:'),
    del('    # `ubuntu-24.04` for the same reason as `gate-node` above: these are jsdom'),
    del('    # unit tests with no macOS behaviour in them, and four of them held four of'),
    del('    # the five available macOS slots.'),
    add('    # `ubuntu-26.04` for the same reason as `gate-node` above: these are jsdom'),
    add('    # unit tests with no macOS behaviour in them. Reduced from 4 shards to 2 in'),
    add('    # Phase 116 Theme D to save two Ubuntu runner setups and ~170s of duplicate'),
    add('    # install overhead while keeping shard wall-clock balanced.'),
    ctx('    runs-on: ubuntu-26.04'),
    ctx('    strategy:'),
    ctx('      fail-fast: false'),
    ctx('      matrix:'),
    del('        shard: [1, 2, 3, 4]'),
    add('        shard: [1, 2]'),
    ctx('    steps:'),
    ctx('      - uses: actions/checkout@v7'),
  ]),
  hunk(369, 366, 'jobs:', [
    ctx('          GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}'),
    ctx(''),
    del("      - name: 'app:test (shard ${{ matrix.shard }}/4)'"),
    del('        run: pnpm exec moon run app:test -- --shard=${{ matrix.shard }}/4'),
    add("      - name: 'app:test (shard ${{ matrix.shard }}/2)'"),
    add('        run: pnpm exec moon run app:test -- --shard=${{ matrix.shard }}/2'),
    ctx('        env:'),
    ctx('          GITHUB_PACKAGES_TOKEN: ${{ secrets.GITHUB_TOKEN }}'),
    ctx(''),
    ctx('  gate-native:'),
    del('    # macos-14, 10x billing — reserved for the two packages that genuinely need'),
    del('    # it: git-engine’s integration tests shell out to dugite’s bundled git, and'),
    del('    # desktop links node-pty against Electron’s native module ABI.'),
    add('    # macos-14, 10x billing — reserved for packages that genuinely need'),
    add('    # it: git-engine’s integration tests shell out to dugite’s bundled git, desktop'),
    add('    # links node-pty against Electron’s native module ABI, and hostile locale'),
    add('    # testing (Phase 116 Theme D folded gate-locale in here to eliminate a 321s'),
    add('    # macOS VM boot and free a macOS runner slot).'),
    ctx('    runs-on: macos-14'),
    ctx('    steps:'),
  ]),
  hunk(417, 414, 'jobs:', [
    ctx('          GIT_COMMITTER_NAME: ci'),
    ctx('          GIT_COMMITTER_EMAIL: ci@example.com'),
    ctx(''),
    del('  gate-locale:'),
    del('    # Phase 85 Theme A — hostile-locale CI gate. Runs desktop and git-engine tests'),
    del('    # under LC_ALL=de_DE.UTF-8 on macos-14 to ensure subprocess parsers and numeric'),
    del('    # formatting do not break under comma locales.'),
    del('    runs-on: macos-14'),
    del('    steps:'),
    del('      - uses: actions/checkout@v7'),
    del('        with:'),
    del('          fetch-depth: 0'),
    add('      # Hostile-locale test pass folded into gate-native (Phase 116 Theme D;'),
    add('      # formerly standalone gate-locale).'),
    add('      - name: desktop + git-engine under LC_ALL=de_DE.UTF-8'),
    add('        run: pnpm exec moon run desktop:test git-engine:test'),
    add('        env:'),
    add('          LC_ALL: de_DE.UTF-8'),
  ]),
  hunk(520, 505, 'e2e:', [
    ctx('  e2e:'),
    ctx('    runs-on: macos-14'),
    del('    timeout-minutes: 20'),
    add('    timeout-minutes: 25'),
    ctx('    strategy:'),
    ctx('      fail-fast: false'),
    ctx('      matrix:'),
    del('        shard: [1, 2, 3]'),
    add('        shard: [1, 2, 3, 4]'),
  ]),
]);

const CLAUDE_MD = file('CLAUDE.md', [
  hunk(214, 214, '## Conventions that bite if ignored', [
    ctx('  repo now matches. **Every CI job that exercises platform behaviour runs on a `macos-*`'),
    del('  runner** — `e2e` (3 shards), `gate-native` and `gate-locale`. Phase 82 Themes E/H had put them on'),
    add('  runner** — `e2e` (4 shards) and `gate-native` (hostile-locale tests folded in Phase 116 Theme D;'),
    add('  formerly standalone `gate-locale`). Phase 82 Themes E/H had put them on'),
    ctx('  `ubuntu-24.04` purely for the 1x billing rate.'),
  ]),
]);

const small = (path: string, o: number, before: string, after: string) => file(path, [hunk(o, o, '', [del(before), add(after)])]);

export const FILES_950 = [
  CI_YML,
  small('.midnite/tasks/_INDEX.md', 131, '| 116 | Test-suite diet and screenshot purge | 🔄 WIP | A B | 🔄 D | ◻ C E |', '| 116 | Test-suite diet and screenshot purge | 🔄 WIP | A B D | — | ◻ C E |'),
  CLAUDE_MD,
  small('AGENTS.md', 214, '  runner** — `e2e` (3 shards), `gate-native` and `gate-locale`.', '  runner** — `e2e` (4 shards) and `gate-native` (hostile-locale tests folded in Phase 116 Theme D).'),
  small('GEMINI.md', 214, '  runner** — `e2e` (3 shards), `gate-native` and `gate-locale`.', '  runner** — `e2e` (4 shards) and `gate-native` (hostile-locale tests folded in Phase 116 Theme D).'),
  small('scripts/release-bundles.test.mjs', 42, "const MAC_JOBS = ['gate-native', 'gate-locale', 'e2e'];", "const MAC_JOBS = ['gate-native', 'e2e'];"),
];

const comment = (id: string, author: string, body: string, ago: number) => ({
  id: `PRRC_${id}`,
  databaseId: id,
  author,
  body,
  createdAt: MINS(ago),
  url: `${URL}/pull/950#discussion_r${id}`,
});

export const THREADS_950 = [
  {
    id: 'PRRT_shards',
    path: '.github/workflows/ci.yml',
    line: 349,
    originalLine: 349,
    startLine: null,
    side: 'RIGHT',
    resolved: false,
    outdated: false,
    fileLevel: false,
    comments: [
      comment('2291', 'thandi-m', 'Two shards keeps `gate-node-app-test` under 4 minutes? The last run had shard 3/4 at 2m 51s on its own.', 52),
      comment('2297', 'bilo-io', 'Measured on three runs: 3m 38s and 3m 44s per shard, and it frees two runner setups. The install was ~170s of each shard anyway.', 41),
      comment('2304', 'thandi-m', 'Good trade. Leaving this open until the next main run confirms it.', 33),
    ],
  },
  {
    id: 'PRRT_locale',
    path: '.github/workflows/ci.yml',
    line: 422,
    originalLine: 422,
    startLine: null,
    side: 'RIGHT',
    resolved: true,
    outdated: false,
    fileLevel: false,
    comments: [
      comment('2310', 'jkruger', 'Does `LC_ALL` here leak into the earlier steps of gate-native?', 28),
      comment('2312', 'bilo-io', 'No, it is step-scoped `env:`, so only this step runs under de_DE.', 24),
    ],
  },
];

export const COMMENTS_950 = [
  { id: 'IC_1', kind: 'comment', author: 'bilo-io', body: 'Folds `gate-locale` into `gate-native` and moves `e2e` to 4 shards, so a PR run schedules **exactly 5** macOS jobs against the cap of 5. No more queueing behind the cap.', createdAt: MINS(70), url: `${URL}/pull/950`, reviewState: null },
  { id: 'PRR_1', kind: 'review', author: 'thandi-m', body: 'Read the whole `ci.yml` diff. One question on the app-test shard count inline.', createdAt: MINS(52), url: `${URL}/pull/950`, reviewState: 'COMMENTED' },
  { id: 'IC_2', kind: 'comment', author: 'bilo-io', body: 'Peak concurrent `macos-14` jobs on the last run: 5. Queued: 0. Wall-clock 13m 40s, down from 21m.', createdAt: MINS(30), url: `${URL}/pull/950`, reviewState: null },
  { id: 'PRR_2', kind: 'review', author: 'jkruger', body: 'LGTM 🚀', createdAt: MINS(22), url: `${URL}/pull/950`, reviewState: 'APPROVED' },
];

const run = (id: string, name: string, status: string, conclusion: string | null, startedMin: number) => ({
  id,
  name,
  workflowName: name,
  workflowId: `90${id}`,
  status,
  conclusion,
  headBranch: 'feature/phase-116-theme-d',
  headSha: HEAD,
  createdAt: MINS(startedMin),
  startedAt: MINS(startedMin),
  updatedAt: status === 'completed' ? MINS(startedMin - 4) : null,
  event: 'pull_request',
  displayTitle: PULLS[0]!.title,
  number: 18_700 + Number(id),
  attempt: 1,
  url: `${URL}/actions/runs/187${id}`,
});

export const RUNS = [
  run('41', 'CI', 'in_progress', null, 11),
  run('42', 'Installer mirror', 'completed', 'success', 12),
  run('43', 'CodeQL', 'completed', 'success', 12),
  run('44', 'Website', 'completed', 'skipped', 12),
];

const step = (n: number, name: string, status: string, conclusion: string | null) => ({
  number: n,
  name,
  status,
  conclusion,
  startedAt: MINS(10),
  completedAt: status === 'completed' ? MINS(8) : null,
});
const done = (...names: string[]) => names.map((s, i) => step(i + 1, s, 'completed', 'success'));
const job = (id: string, name: string, status: string, conclusion: string | null, steps: unknown[], took = 4) => ({
  id,
  name,
  status,
  conclusion,
  startedAt: MINS(11),
  completedAt: status === 'completed' ? MINS(11 - took) : null,
  steps,
  url: `${URL}/actions/runs/18741/job/${id}`,
});

const SETUP = ['Set up job', 'Run actions/checkout@v7', 'Run pnpm/action-setup', 'Run actions/setup-node@v7', 'Install'];
export const RUN_DETAIL = {
  '41': {
    jobs: [
      job('501', 'gate-node', 'completed', 'success', done(...SETUP, 'typecheck + lint', 'root:test-node'), 5),
      job('502', 'gate-node-app-test (1)', 'completed', 'success', done(...SETUP, 'app:test (shard 1/2)'), 4),
      job('503', 'gate-node-app-test (2)', 'completed', 'success', done(...SETUP, 'app:test (shard 2/2)'), 4),
      job('504', 'gate-native', 'completed', 'success', done(...SETUP, 'git-engine:test', 'desktop:test', 'desktop + git-engine under LC_ALL=de_DE.UTF-8'), 7),
      job('505', 'e2e (1)', 'completed', 'success', done(...SETUP, 'Install Playwright browsers', 'app:e2e (shard 1/4)'), 8),
      job('506', 'e2e (2)', 'completed', 'success', done(...SETUP, 'Install Playwright browsers', 'app:e2e (shard 2/4)'), 8),
      job('507', 'e2e (3)', 'completed', 'success', done(...SETUP, 'Install Playwright browsers', 'app:e2e (shard 3/4)'), 9),
      job('508', 'e2e (4)', 'in_progress', null, [
        ...done(...SETUP, 'Install Playwright browsers'),
        step(7, 'app:e2e (shard 4/4)', 'in_progress', null),
        step(8, 'Upload report', 'queued', null),
      ]),
    ],
  },
};

const T = (s: number) => `2026-10-21T18:${String(26 + Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.4129931Z`;
const logLines = (jobName: string, stepName: string, lines: string[]) => lines.map((l, i) => `${jobName}\t${stepName}\t${T(i * 3)} ${l}`);
export const RUN_LOGS = {
  '41': {
    lines: [
      ...logLines('gate-node', 'root:test-node', [
        '> moon run root:test-node',
        'root:test-node | RUN  v3.2.4 /home/runner/work/midnite-studio/midnite-studio',
        'root:test-node |  ✓ scripts/layer-boundaries.test.mjs (41 tests) 812ms',
        'root:test-node |  ✓ scripts/release-bundles.test.mjs (18 tests) 96ms',
        'root:test-node |  ✓ scripts/e2e-budget.test.mjs (9 tests) 41ms',
        'root:test-node |  ✓ packages/shared/src/keybindings.test.ts (64 tests) 133ms',
        'root:test-node |  ✓ packages/git-engine/src/parse/log.test.ts (37 tests) 58ms',
        'root:test-node | Test Files  212 passed (212)',
        'root:test-node |      Tests  4108 passed (4108)',
        'root:test-node |   Duration  58.31s',
        'Tasks: 1 completed',
      ]),
      ...logLines('e2e (4)', 'app:e2e (shard 4/4)', [
        '> moon run app:e2e -- --shard=4/4',
        'Running 61 tests using 3 workers, shard 4 of 4',
        '  ✓  1 [chromium] › reviews-view.spec.ts:150:1 › the Reviews view narrows the sidebar (2.1s)',
        '  ✓  2 [chromium] › review-threads.spec.ts:152:1 › an existing thread renders on its line (1.8s)',
        '  ✓  3 [chromium] › terminal-broker.spec.ts:44:1 › a terminal survives a window reload (4.6s)',
        '  ✓  4 [chromium] › graph-ci-column.spec.ts:31:1 › the CI column draws every run state (2.4s)',
        '  ✓  5 [chromium] › command-palette.spec.ts:18:1 › Mod+k opens the palette from the terminal (1.2s)',
        '  ✓  6 [chromium] › rail-tooltip.spec.ts:22:1 › a rail item shows only its chord (0.9s)',
        '  ✓  7 [chromium] › media-library.spec.ts:57:1 › a show opens onto its episodes (1.7s)',
        '  ✓  8 [chromium] › notes-review.spec.ts:40:1 › grading a card moves to the next one (1.4s)',
        '  ·  9 [chromium] › forge-issues.spec.ts:88:1 › an issue opens with its comments',
      ]),
    ],
  },
};

export const PULL_DETAIL = {
  '952': {
    headSha: '6380f1d8a4c2e91b07d3f5a8c6e2b9d04f1a7c35',
    baseBranch: 'main',
    additions: 48,
    deletions: 63,
    changedFiles: 12,
    createdAt: HOURS(5),
    commitCount: 4,
    body: [
      '## What',
      '',
      '- Folds `root:test-node`, `lint-all` and `typecheck-node` into the one `gate-node` job.',
      '- Restores `pnpm@9.15.9` in package.json and un-tracks a stray SCRATCHPAD.md.',
      '- media-game tests use `__dirname`, not `import.meta`, under CommonJS.',
      '',
      '## Why',
      '',
      'Three Ubuntu jobs each paid a fresh checkout and install for under a minute of work. One job pays it once.',
      '',
      'Phase 116 Theme A.',
    ].join('\n'),
  },
  '950': {
    headSha: HEAD,
    baseSha: BASE,
    baseBranch: 'main',
    additions: 57,
    deletions: 120,
    changedFiles: 6,
    createdAt: MINS(72),
    updatedAt: MINS(11),
    mergeable: 'MERGEABLE',
    commitCount: 3,
    commits: [
      { sha: 'b1c4e07a', subject: 'feat(ci): fold gate-locale into gate-native and rebalance to 4 e2e shards (Phase 116 Theme D)' },
      { sha: '9d02f3e1', subject: 'fix(ci): raise e2e timeout to 25m for pre-Theme-C suite' },
      { sha: 'e5859cdc', subject: 'chore(tracker): mark Phase 116 Theme D done' },
    ],
    reviewRequests: ['thandi-m'],
    body: [
      '## What',
      '',
      '- Folds the standalone `gate-locale` job into `gate-native`: the hostile-locale pass now runs as one step under `LC_ALL=de_DE.UTF-8`.',
      '- Rebalances `e2e` from 3 shards to **4**, and `gate-node-app-test` from 4 to 2.',
      '- Raises the `e2e` timeout to 25m for the pre-Theme-C suite.',
      '',
      '## Why',
      '',
      'A PR run scheduled 6 macOS jobs against a hard cap of 5 concurrent, so one always queued behind a fresh VM boot. This leaves **exactly 5**: 1 `gate-native` + 4 `e2e` shards.',
      '',
      '| | Before | After |',
      '|---|---|---|',
      '| macOS jobs per PR | 6 | 5 |',
      '| Peak queued | 1 | 0 |',
      '| Wall-clock | ~21m | ~13m 40s |',
      '',
      'Phase 116 Theme D.',
    ].join('\n'),
  },
};

export const forgeFixture: NonNullable<MockFixtures['forge']> = {
  cli: { reason: 'ready' },
  pulls: PULLS,
  pullDetail: PULL_DETAIL,
  pullFiles: { '950': { files: FILES_950 } },
  pullThreads: { '950': THREADS_950 },
  pullComments: { '950': COMMENTS_950 },
  runs: RUNS,
  runDetail: RUN_DETAIL,
  runLogs: RUN_LOGS,
  workflows: [
    { id: '9041', name: 'CI', path: '.github/workflows/ci.yml', state: 'active' },
    { id: '9042', name: 'Installer mirror', path: '.github/workflows/installer-mirror.yml', state: 'active' },
    { id: '9043', name: 'CodeQL', path: '.github/workflows/codeql.yml', state: 'active' },
    { id: '9044', name: 'Website', path: '.github/workflows/website.yml', state: 'active' },
  ],
};
