import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Projects view, assembled (Phase 40 Theme G).
 *
 * The parser, the flattener and the command-construction rules each have
 * their own vitest suite against recorded fixtures (`gh-project.test.ts`,
 * `gh-project-write.test.ts`) — what only the assembled app can show is that
 * picking a board actually gates the item fetch, that an edited cell's new
 * value survives the "not optimistic" round trip (disable → mutate → refetch,
 * never a value painted before `gh` answers), and that a missing `project`
 * scope renders the one sentence that fixes it rather than a generic error.
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
    /*
      Neither optional nor decoration — see `kanban.spec.ts`'s own note on
      this exact fixture shape. `ForgeProjectItemContentSchema` gives `body`
      and `labels` a `.default([])`/`.default('')`, so a real (zod-parsed)
      payload always carries both; the mock bridge hands fixtures back
      verbatim, with no parse, so omitting either throws the moment something
      reads it unguarded. Phase 52 Theme A's filter toolbar is that something
      here — `deriveLabelCounts` iterates `content.labels` on every render.
    */
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

type WriteCall = { channel: string; request: Record<string, unknown> };

const recorded = (page: Page): Promise<WriteCall[]> =>
  page.evaluate(() => (window as unknown as { __mstudioWrites?: WriteCall[] }).__mstudioWrites ?? []);

/** Land on the Projects view and pick the one seeded board. */
async function openBoard(
  page: Page,
  data: MockFixtures = base,
  options: { writes?: boolean } = {},
): Promise<void> {
  if (options.writes === true) {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'midnite-studio.ui',
        JSON.stringify({ state: { forgeWritesEnabled: true }, version: 6 }),
      );
    });
  }
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');
  await expect(page.getByRole('combobox', { name: 'Project board' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Project board' }).selectOption(BOARD.id);
  await expect(page.getByText('Wire the write path')).toBeVisible();
}

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

test('editing a single-select field persists the new value', async ({ page }) => {
  await openBoard(page, base, { writes: true });

  const status = page.getByRole('combobox', { name: 'Status' });
  await expect(status).toBeEnabled();
  await expect(status).toHaveValue('OPT_todo');

  await status.selectOption('OPT_done');

  await expect
    .poll(async () => (await recorded(page)).map((call) => call.channel))
    .toContain('forgeProjectSetField');
  const call = (await recorded(page)).find((entry) => entry.channel === 'forgeProjectSetField');
  expect(call?.request).toMatchObject({
    projectId: BOARD.id,
    itemId: ITEM.id,
    fieldId: STATUS_FIELD.id,
    value: { fieldId: STATUS_FIELD.id, dataType: 'single_select', optionId: 'OPT_done', name: 'Done' },
  });

  // Not optimistic: the value shown is the one the invalidated refetch came
  // back with, not one painted the instant the option was picked.
  await expect(status).toHaveValue('OPT_done');
});

test('a refused write restores the prior value and names the reason', async ({ page }) => {
  await openBoard(
    page,
    {
      ...base,
      forgeProject: {
        ...base.forgeProject,
        writeResult: { ok: false, kind: 'error', message: 'Field is read-only for this item type' },
      },
    },
    { writes: true },
  );

  const status = page.getByRole('combobox', { name: 'Status' });
  await status.selectOption('OPT_done');

  await expect
    .poll(async () => (await recorded(page)).map((call) => call.channel))
    .toContain('forgeProjectSetField');
  await expect(status).toHaveAttribute('title', 'Field is read-only for this item type');
  // The seeded item was never mutated, so the value the select renders is
  // unchanged — a refusal must not leave the cell showing what was rejected.
  await expect(status).toHaveValue('OPT_todo');
});

test('a missing project scope renders the exact fix, verbatim and copyable', async ({ page }) => {
  await installMockBridge(page, {
    ...base,
    forgeProject: { ...base.forgeProject, readKind: 'insufficient-scope', error: 'insufficient scope' },
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Projects');

  await expect(page.getByText('GitHub Projects needs one more permission')).toBeVisible();
  await expect(page.getByText('gh auth refresh -s project')).toBeVisible();
  await page.getByRole('button', { name: 'Copy command' }).click();
});
