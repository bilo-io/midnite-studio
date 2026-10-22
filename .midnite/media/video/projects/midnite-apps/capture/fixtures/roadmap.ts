/**
 * A realistic "Midnite Studio roadmap" task board for the Tasks ▸ Graph view:
 * 16 phases from the real `.midnite/tasks/_INDEX.md`, wired with dependency
 * edges, mixed Status (Done / In progress / In review / Todo) and a "Themes"
 * text field showing partial completion (e.g. "2/5 themes").
 */
import { fixtures } from '../../../../../../../packages/app/test-support/fixtures';
import type { MockFixtures } from '../../../../../../../packages/app/test-support/mock-bridge';

export const MAIN = '/tmp/midnite-studio';
export const REPO_ID = 'repo-1';

export const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' as const },
  },
];

export const BOARD = {
  id: 'PVT_roadmap',
  number: 7,
  title: 'Midnite Studio roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [
    { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
    { id: 'OPT_prog', name: 'In progress', color: 'YELLOW' },
    { id: 'OPT_review', name: 'In review', color: 'BLUE' },
    { id: 'OPT_done', name: 'Done', color: 'GREEN' },
  ],
};

type Status = 'Todo' | 'In progress' | 'In review' | 'Done';
const OPT: Record<Status, string> = {
  Todo: 'OPT_todo',
  'In progress': 'OPT_prog',
  'In review': 'OPT_review',
  Done: 'OPT_done',
};

type PhaseRow = {
  n: number; // issue number
  phase: number;
  title: string;
  status: Status;
  done: number;
  total: number;
  blockedBy?: number[]; // issue numbers
  assignee?: boolean;
};

/** Issue numbers are plausible for this repo (PRs are in the 900s). */
export const PHASES: PhaseRow[] = [
  { n: 842, phase: 87, title: 'Knowledge graph', status: 'Done', done: 7, total: 7 },
  { n: 870, phase: 92, title: 'Agentic Projects', status: 'Done', done: 6, total: 6 },
  { n: 881, phase: 108, title: 'Maps', status: 'Done', done: 7, total: 7 },
  { n: 860, phase: 89, title: 'Knowledge variants', status: 'In progress', done: 5, total: 11, blockedBy: [842] },
  { n: 895, phase: 95, title: 'Agentic improvements', status: 'Done', done: 7, total: 7, blockedBy: [870] },
  { n: 880, phase: 94, title: 'AI engineering', status: 'In progress', done: 1, total: 8, blockedBy: [870] },
  { n: 905, phase: 105, title: 'Terrain', status: 'Done', done: 11, total: 11, blockedBy: [881] },
  { n: 910, phase: 106, title: '2D Assets & sprites', status: 'In progress', done: 9, total: 12, blockedBy: [905] },
  { n: 912, phase: 107, title: 'Games', status: 'In progress', done: 14, total: 17, blockedBy: [905] },
  { n: 925, phase: 111, title: 'Voice agent', status: 'In progress', done: 3, total: 5, blockedBy: [895] },
  { n: 930, phase: 113, title: 'Midnite Apps split', status: 'In review', done: 14, total: 15, blockedBy: [895] },
  { n: 938, phase: 110, title: 'Prompt & Context Lab', status: 'Todo', done: 0, total: 6, blockedBy: [880] },
  { n: 941, phase: 114, title: 'Settings by voice', status: 'Todo', done: 0, total: 6, blockedBy: [925] },
  { n: 950, phase: 116, title: 'Test suite diet', status: 'In progress', done: 2, total: 5, blockedBy: [895] },
  { n: 948, phase: 115, title: 'Privacy at rest', status: 'Todo', done: 0, total: 7, blockedBy: [930] },
  { n: 955, phase: 117, title: 'Launcher auto-update', status: 'Todo', done: 0, total: 4, blockedBy: [930, 948] },
];

const BILO = 'bilo-io';

export function itemId(n: number): string {
  return `PVTI_${n}`;
}

function titleOf(row: PhaseRow): string {
  return `Phase ${row.phase} · ${row.title}`;
}

export function buildItems() {
  const byNumber = new Map(PHASES.map((p) => [p.n, p]));
  return PHASES.map((row) => {
    const closed = row.status === 'Done';
    return {
      id: itemId(row.n),
      content: {
        type: 'issue' as const,
        id: `I_${row.n}`,
        number: row.n,
        title: titleOf(row),
        url: `https://github.com/bilo-io/midnite-studio/issues/${row.n}`,
        state: closed ? ('closed' as const) : ('open' as const),
        assignees: row.status === 'Todo' ? [] : [BILO],
        body: `Tracks .midnite/tasks/phases/phase-${row.phase}.`,
        // Theme progress rides as a label so it sits in the node's pill row.
        labels: [`${row.done}/${row.total} themes`],
        linkedPrs: [],
        repo: '',
        dependencies: {
          blockedBy: (row.blockedBy ?? []).map((b) => {
            const dep = byNumber.get(b)!;
            return { number: b, title: titleOf(dep), state: dep.status === 'Done' ? 'closed' : 'open', repo: '' };
          }),
          parent: null,
          subIssues: [],
          blockedByTruncated: false,
          subIssuesTruncated: false,
        },
      },
      fieldValues: {
        FIELD_status: {
          fieldId: 'FIELD_status',
          dataType: 'single_select' as const,
          optionId: OPT[row.status],
          // Empty name: the stroke resolves the option by id (colour + dash on the
          // border and edges) while the chip row stays empty, so the node fits.
          name: '',
        },
      },
    };
  });
}

export function roadmapFixtures(extra: Partial<MockFixtures> = {}): MockFixtures {
  return {
    ...fixtures,
    remotes: REMOTES,
    refs: [],
    statusEntries: [],
    statusByWorktree: { [MAIN]: [] },
    forge: { cli: { reason: 'ready' } },
    forgeProject: {
      projects: [BOARD],
      fields: { [BOARD.id]: [STATUS_FIELD] },
      items: { [BOARD.id]: buildItems() },
    },
    ...extra,
  } as MockFixtures;
}
