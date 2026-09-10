import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Projects view, assembled (Phase 40 Theme G).
 *
 * The parser, the flattener and the command-construction rules each have
 * their own vitest suite against recorded fixtures (`gh-project.test.ts`,
 * `gh-project-write.test.ts`).
 *
 * Phase 82 Theme C wave 5 moved every other test here to
 * `src/features/projects/projects-view.bridge.test.tsx`, mounting
 * `ProjectsView` directly: the board-picker gate, the single-select field's
 * "not optimistic" round trip, a refused write, and the missing-scope state.
 * One smoke test stays here, proving the rail actually reaches this view
 * through a real page load.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const BOARD = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const STATUS_FIELD = {
  id: 'FIELD_status',
  name: 'Status',
  dataType: 'single_select' as const,
  options: [
    { id: 'OPT_todo', name: 'Todo', color: 'GRAY' },
    { id: 'OPT_done', name: 'Done', color: 'GREEN' },
  ],
};

const ITEM = {
  id: 'PVTI_1',
  content: {
    type: 'issue' as const,
    id: 'I_1',
    number: 42,
    title: 'Wire the write path',
    url: 'https://github.com/bilo-io/midnite-studio/issues/42',
    state: 'OPEN' as const,
    assignees: [],
    body: '',
    labels: [],
  },
  fieldValues: {
    FIELD_status: { fieldId: 'FIELD_status', dataType: 'single_select' as const, optionId: 'OPT_todo', name: 'Todo' },
  },
};

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' } },
  forgeProject: {
    projects: [BOARD],
    fields: { [BOARD.id]: [STATUS_FIELD] },
    items: { [BOARD.id]: [structuredClone(ITEM)] },
  },
};

test('picking a board loads its items, and not before', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');

  // Nothing loads until a board is picked — the phase doc's own acceptance
  // test at the query layer, proved here at the assembled-app level too.
  await expect(page.getByText('Pick a board', { exact: true })).toBeVisible();
  await expect(page.getByText('Wire the write path')).toHaveCount(0);

  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await expect(page.getByText('Wire the write path')).toBeVisible();
  // forgeWritesEnabled defaults off, so the cell renders but cannot be edited.
  await expect(page.getByRole('combobox', { name: 'Status' })).toBeDisabled();
});
