/**
 * A commit history shaped like this repo's last few weeks: two releases, phase
 * branches forking off main and merging back, and four branches still open —
 * the same four phases the agent shots have running. Laid out by git-engine's
 * own `layoutGraph`, so lanes and edges are what the real app would draw.
 */
import { createHash } from 'node:crypto';

import { layoutGraph } from '../../../../../../../packages/git-engine/src/layout/lane-layout';

type Op =
  | ['main', string, string?]
  | ['fork', string]
  | ['on', string, string]
  | ['merge', string, string, string?];

const SCRIPT: Op[] = [
  ['main', 'chore(release): v0.0.3', 'v0.0.3'],
  ['main', 'docs: add phase-105 terrain plan (+ index row)'],
  ['fork', 'feature/phase-105-terrain'],
  ['on', 'feature/phase-105-terrain', 'feat(terrain): 16-bit heightmap import (Phase 105 Theme A)'],
  ['fork', 'feature/phase-108-maps'],
  ['on', 'feature/phase-108-maps', 'feat(maps): measure distances and areas (Phase 108 Theme B)'],
  ['on', 'feature/phase-105-terrain', 'feat(terrain): drape the satellite image over the mesh (Phase 105 Theme C)'],
  ['main', 'fix(graph): lane recycling off by one on octopus merges'],
  ['on', 'feature/phase-108-maps', 'feat(maps): capture roads and buildings as masks (Phase 108 Theme D)'],
  ['on', 'feature/phase-105-terrain', 'feat(terrain): export to Godot and Unity (Phase 105 Theme F)'],
  ['merge', 'feature/phase-108-maps', 'Merge pull request #884 from bilo-io/feature/phase-108-maps'],
  ['fork', 'feature/phase-106-2d-assets'],
  ['on', 'feature/phase-105-terrain', 'test(terrain): golden previews for every noise preset'],
  ['merge', 'feature/phase-105-terrain', 'Merge pull request #889 from bilo-io/feature/phase-105-terrain'],
  ['on', 'feature/phase-106-2d-assets', 'feat(sprites): sheet grid with per-frame badges (Phase 106 Theme A)'],
  ['main', 'docs: add phase-113 Midnite Apps split plan (+ index row)'],
  ['fork', 'feature/phase-113-midnite-apps-split'],
  ['on', 'feature/phase-113-midnite-apps-split', 'refactor(runtime): one vault service in packages/runtime (Phase 113 Theme D)'],
  ['on', 'feature/phase-106-2d-assets', 'feat(sprites): re-roll a single bad frame (Phase 106 Theme E)'],
  ['on', 'feature/phase-113-midnite-apps-split', "refactor(forge): move the forge feature's main half (Phase 113 Theme O)"],
  ['fork', 'feature/phase-111-voice-agent'],
  ['on', 'feature/phase-111-voice-agent', 'feat(voice): push-to-talk in the companion panel (Phase 111 Theme A)'],
  ['on', 'feature/phase-106-2d-assets', 'feat(sprites): tilesets and Tiled map export (Phase 106 Theme H)'],
  ['merge', 'feature/phase-106-2d-assets', 'Merge pull request #915 from bilo-io/feature/phase-106-2d-assets'],
  ['on', 'feature/phase-113-midnite-apps-split', 'feat(launcher): list, install and open every midnite app (Phase 113 Theme H)'],
  ['on', 'feature/phase-111-voice-agent', 'feat(voice): voice ports for the companion (Phase 111 Theme B)'],
  ['merge', 'feature/phase-113-midnite-apps-split', 'Merge pull request #931 from bilo-io/feature/phase-113-midnite-apps-split'],
  ['fork', 'release/v0.0.4'],
  ['on', 'release/v0.0.4', 'chore(release): v0.0.4'],
  ['merge', 'release/v0.0.4', 'Merge pull request #949 from bilo-io/release/v0.0.4', 'v0.0.4'],
  ['main', 'docs: add phase-116 test-suite-diet-and-screenshot-purge plan (+ index row)'],
  ['main', 'chore(todo): claim Phase 116 Themes A, B, D (WIP)'],
  ['fork', 'feature/phase-106-parallax'],
  ['on', 'feature/phase-111-voice-agent', 'feat(voice): switch models mid-conversation (Phase 111 Theme C)'],
  ['main', 'chore(e2e): purge 158 shot specs, inline screenshots, and unreferenced PNGs (Phase 116 Theme B) (#951)'],
  ['on', 'feature/phase-106-parallax', 'feat(sprites): parallax backgrounds (Phase 106 Theme L)'],
  ['main', 'feat(ci): consolidate gate-node with root test-node, lint-all, and typecheck-node (Phase 116 Theme A) (#952)'],
  ['fork', 'feature/phase-116-test-suite-diet'],
  ['fork', 'feature/phase-89-knowledge-variants'],
  ['on', 'feature/phase-116-test-suite-diet', 'feat(e2e): visual-baseline ratchet in e2e-budget.mjs (Phase 116 Theme D)'],
  ['on', 'feature/phase-89-knowledge-variants', 'feat(knowledge): radial layout variant (Phase 89 Theme F)'],
  ['on', 'feature/phase-111-voice-agent', 'fix(voice): keep the mic open across a model switch'],
  ['on', 'feature/phase-106-parallax', 'feat(sprites): depth-scaled parallax speeds'],
  ['on', 'feature/phase-116-test-suite-diet', 'test(e2e): cap visual baselines at 100 / 3 MB'],
  ['on', 'feature/phase-89-knowledge-variants', 'perf(knowledge): reuse the force layout between variants'],
];

/** Branches still open at the top of the graph — each one an agent's worktree. */
export const OPEN_BRANCHES = [
  'feature/phase-116-test-suite-diet',
  'feature/phase-89-knowledge-variants',
  'feature/phase-106-parallax',
  'feature/phase-111-voice-agent',
];

/** Each open branch's worktree — the same directories the agent sessions run in. */
const WORKTREE: Record<string, string> = {
  'feature/phase-116-test-suite-diet': 'phase-116-test-suite-diet',
  'feature/phase-89-knowledge-variants': 'phase-89-knowledge-variants',
  'feature/phase-106-parallax': 'phase-106-2d-assets',
  'feature/phase-111-voice-agent': 'phase-111-voice-agent',
};

const sha = (seed: string) => createHash('sha1').update(seed).digest('hex');

export function buildHistory(nowSec = Math.floor(Date.now() / 1000)) {
  type C = { sha: string; parents: string[]; subject: string; tag?: string };
  const out: C[] = [];
  let main = '';
  const tips: Record<string, string> = {};
  const push = (subject: string, parents: string[], tag?: string): string => {
    const s = sha(`${out.length}:${subject}`);
    out.push({ sha: s, parents, subject, ...(tag ? { tag } : {}) });
    return s;
  };
  for (const op of SCRIPT) {
    if (op[0] === 'main') main = push(op[1], main ? [main] : [], op[2]);
    else if (op[0] === 'fork') tips[op[1]] = main;
    else if (op[0] === 'on') tips[op[1]] = push(op[2], [tips[op[1]]!]);
    else {
      main = push(op[2], [main, tips[op[1]]!], op[3]);
      delete tips[op[1]];
    }
  }
  // Newest first. Recent commits minutes apart (so the top rows show the
  // "just landed" recency tint), older ones hours apart.
  const n = out.length;
  let t = nowSec - 70;
  const dated = out
    .slice()
    .reverse()
    .map((c, i) => {
      const d = t;
      t -= i < 3 ? 240 : i < 8 ? 1500 : 3 * 3600 + (i % 5) * 1700;
      return { ...c, date: d };
    });

  const refFor: Record<string, string[]> = {};
  const add = (s: string, r: string) => (refFor[s] ??= []).push(r);
  add(main, 'refs/heads/main');
  add(main, 'refs/remotes/origin/main');
  for (const b of OPEN_BRANCHES) {
    add(tips[b]!, `refs/heads/${b}`);
    add(tips[b]!, `refs/remotes/origin/${b}`);
  }
  for (const c of out) if (c.tag) add(c.sha, `refs/tags/${c.tag}`);

  const commits = dated.map((c) => ({
    sha: c.sha,
    parents: c.parents,
    authorName: 'Bilo Lwabona',
    authorEmail: 'bilo.lwabona@gmail.com',
    authorDate: c.date,
    committerDate: c.date,
    subject: c.subject,
    refs: refFor[c.sha] ?? [],
    coAuthors: [],
    sessionTrailers: [],
  }));
  const graphRows = layoutGraph(commits as never);

  const MAIN = '/tmp/midnite-studio';
  const refs = [
    { name: 'main', fullName: 'refs/heads/main', kind: 'localBranch', sha: main, upstream: { name: 'origin/main', ahead: 0, behind: 0, gone: false }, isHead: true, worktreePath: MAIN },
    { name: 'origin/main', fullName: 'refs/remotes/origin/main', kind: 'remoteBranch', sha: main, upstream: null, isHead: false, worktreePath: null },
    ...OPEN_BRANCHES.flatMap((b) => [
      {
        name: b,
        fullName: `refs/heads/${b}`,
        kind: 'localBranch',
        sha: tips[b]!,
        upstream: { name: `origin/${b}`, ahead: 0, behind: 0, gone: false },
        isHead: false,
        worktreePath: `${MAIN}/.worktrees/${WORKTREE[b]}`,
      },
      { name: `origin/${b}`, fullName: `refs/remotes/origin/${b}`, kind: 'remoteBranch', sha: tips[b]!, upstream: null, isHead: false, worktreePath: null },
    ]),
    ...out
      .filter((c) => c.tag)
      .map((c) => ({ name: c.tag!, fullName: `refs/tags/${c.tag}`, kind: 'tag', sha: c.sha, upstream: null, isHead: false, worktreePath: null })),
  ];
  // The commit the clip opens: a real message, files and one diff.
  const target = commits.find((c) => c.subject.startsWith('feat(e2e): visual-baseline ratchet'))!;
  const who = { name: 'Bilo Lwabona', email: 'bilo.lwabona@gmail.com', date: target.authorDate };
  const L = (kind: 'add' | 'del' | 'ctx', oldNo: number | null, newNo: number | null, text: string) => ({
    kind, oldNo, newNo, text, ranges: [], noNewline: false,
  });
  const commitDetails = {
    [target.sha]: {
      sha: target.sha,
      parents: target.parents,
      subject: target.subject,
      body: [
        target.subject,
        '',
        'Visual baselines now count against the same ratchet as e2e specs: at most',
        '100 PNGs and 3 MB in total, checked in CI by scripts/e2e-budget.mjs.',
        '',
        'Refs #950',
      ].join('\n'),
      author: who,
      committer: who,
      files: [
        { path: 'scripts/e2e-budget.mjs', oldPath: null, insertions: 38, deletions: 6 },
        { path: 'packages/app/playwright.visual.config.ts', oldPath: null, insertions: 4, deletions: 1 },
        { path: 'docs/TESTING.md', oldPath: null, insertions: 12, deletions: 2 },
        { path: '.github/workflows/ci.yml', oldPath: null, insertions: 3, deletions: 0 },
      ],
    },
  };
  const diffs = {
    [`${target.sha}:scripts/e2e-budget.mjs`]: {
      path: 'scripts/e2e-budget.mjs', oldPath: 'scripts/e2e-budget.mjs', change: 'modified', binary: false,
      oldMode: null, newMode: null, contextLines: 3, combined: false, truncated: false, droppedLines: 0,
      insertions: 7, deletions: 2,
      hunks: [{
        oldStart: 14, oldLines: 8, newStart: 14, newLines: 13, heading: 'function readBudget() {',
        lines: [
          L('ctx', 14, 14, "import { readdirSync, statSync } from 'node:fs';"),
          L('ctx', 15, 15, ''),
          L('del', 16, null, 'const budget = { specs: 160 };'),
          L('add', null, 16, 'export const BUDGET = { specs: 120, baselines: 100, megabytes: 3 };'),
          L('ctx', 17, 17, ''),
          L('del', 18, null, "const specs = countSpecs('e2e');"),
          L('add', null, 18, "const specs = countSpecs('packages/app/e2e');"),
          L('add', null, 19, "const pngs = listBaselines('packages/app/e2e/visual');"),
          L('add', null, 20, 'const bytes = pngs.reduce((n, f) => n + statSync(f).size, 0);'),
          L('add', null, 21, 'if (pngs.length > BUDGET.baselines) fail(`${pngs.length} baselines > ${BUDGET.baselines}`);'),
          L('add', null, 22, 'if (bytes > BUDGET.megabytes * 2 ** 20) fail(`${mb(bytes)} MB of baselines > ${BUDGET.megabytes} MB`);'),
          L('ctx', 19, 23, 'if (specs > BUDGET.specs) fail(`${specs} e2e specs > ${BUDGET.specs}`);'),
          L('ctx', 20, 24, ''),
        ],
      }],
    },
  };
  const worktrees = OPEN_BRANCHES.map((b) => ({ path: `${MAIN}/.worktrees/${WORKTREE[b]}`, branch: b }));
  return { graphRows, refs, commits, commitDetails, diffs, worktrees, count: n };
}
