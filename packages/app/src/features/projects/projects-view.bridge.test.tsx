import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ProjectsView } from './projects-view';

/**
 * Migrated from `e2e/projects.spec.ts` (Phase 82 Theme C wave 5) — the board
 * picker gating the item fetch, the single-select field's "not optimistic"
 * commit round trip, a refused write restoring the prior value, and the
 * missing-`project`-scope state's exact fix. 4 of the original 4 tests moved
 * here — no straggler needed a real browser.
 *
 * The parser, the flattener and the command-construction rules each have
 * their own vitest suite against recorded fixtures (`gh-project.test.ts`,
 * `gh-project-write.test.ts`) — this file is only the assembled view.
 * `forgeWritesEnabled` is set via `renderView`'s `uiState`, the same seam
 * `field-editor.test.tsx`/`projects-view.test.tsx` already flip by hand.
 *
 * `baseFixtures()` is a function, not a shared constant — a successful
 * `setField` mutates the mock's seeded item's `fieldValues` IN PLACE (see
 * `mock-bridge.ts`'s own comment on `forgeProject.setField`), and jsdom hands
 * `buildMockBridge` the fixture object directly rather than structurally
 * cloning it across an IPC boundary the way Playwright does — so a shared
 * object here would carry one test's committed edit into the next (the same
 * hazard `makeFixtures` exists to fix for `fsDirs`/`fsFiles`, applied by hand
 * here since this fixture shape is local to this file).
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
    FIELD_status: {
      fieldId: 'FIELD_status',
      dataType: 'single_select' as const,
      optionId: 'OPT_todo',
      name: 'Todo',
    },
  },
};

function baseFixtures(): MockFixtures {
  return {
    commitDetails: {},
    revisions: {},
    diffs: {},
    graphRows: [],
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
}

type WriteCall = { channel: string; request: Record<string, unknown> };

const writes = (): WriteCall[] =>
  (window as unknown as { __mstudioWrites?: WriteCall[] }).__mstudioWrites ?? [];

/** Land on the Projects view and pick the one seeded board. */
async function openBoard(
  data: MockFixtures = baseFixtures(),
  options: { writes?: boolean } = {},
): Promise<void> {
  renderView(<ProjectsView />, {
    fixtures: data,
    uiState: {
      selectedRepoId: 'repo-1',
      selectedWorktreePath: MAIN,
      ...(options.writes === true ? { forgeWritesEnabled: true } : {}),
    },
  });
  await screen.findByRole('combobox', { name: 'Project board' });

  fireEvent.change(screen.getByRole('combobox', { name: 'Project board' }), {
    target: { value: BOARD.id },
  });
  await screen.findByText('Wire the write path');
}

afterEach(cleanup);

describe('ProjectsView, assembled through the real bridge', () => {
  it('picking a board loads its items, and not before', async () => {
    renderView(<ProjectsView />, {
      fixtures: baseFixtures(),
      uiState: { selectedRepoId: 'repo-1', selectedWorktreePath: MAIN },
    });
    await screen.findByRole('combobox', { name: 'Project board' });

    // Nothing loads until a board is picked — the phase doc's own acceptance
    // test at the query layer, proved here at the assembled-view level too.
    expect(screen.getByText('Pick a board…')).toBeTruthy();
    expect(screen.queryByText('Wire the write path')).toBeNull();

    fireEvent.change(screen.getByRole('combobox', { name: 'Project board' }), {
      target: { value: BOARD.id },
    });
    expect(await screen.findByText('Wire the write path')).toBeTruthy();
    // forgeWritesEnabled defaults off, so the cell renders but cannot be edited.
    expect((screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement).disabled).toBe(
      true,
    );
  });

  it('editing a single-select field persists the new value', async () => {
    await openBoard(baseFixtures(), { writes: true });

    const status = screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;
    expect(status.disabled).toBe(false);
    expect(status.value).toBe('OPT_todo');

    fireEvent.change(status, { target: { value: 'OPT_done' } });

    await waitFor(() =>
      expect(writes().map((call) => call.channel)).toContain('forgeProjectSetField'),
    );
    const call = writes().find((entry) => entry.channel === 'forgeProjectSetField');
    expect(call?.request).toMatchObject({
      projectId: BOARD.id,
      itemId: ITEM.id,
      fieldId: STATUS_FIELD.id,
      value: { fieldId: STATUS_FIELD.id, dataType: 'single_select', optionId: 'OPT_done', name: 'Done' },
    });

    // Not optimistic: the value shown is the one the invalidated refetch came
    // back with, not one painted the instant the option was picked.
    await waitFor(() => expect(status.value).toBe('OPT_done'));
  });

  it('a refused write restores the prior value and names the reason', async () => {
    const fixtures = baseFixtures();
    await openBoard(
      {
        ...fixtures,
        forgeProject: {
          ...fixtures.forgeProject,
          writeResult: { ok: false, kind: 'error', message: 'Field is read-only for this item type' },
        },
      },
      { writes: true },
    );

    const status = screen.getByRole('combobox', { name: 'Status' }) as HTMLSelectElement;
    fireEvent.change(status, { target: { value: 'OPT_done' } });

    await waitFor(() =>
      expect(writes().map((call) => call.channel)).toContain('forgeProjectSetField'),
    );
    await waitFor(() =>
      expect(status.getAttribute('title')).toBe('Field is read-only for this item type'),
    );
    // The seeded item was never mutated, so the value the select renders is
    // unchanged — a refusal must not leave the cell showing what was rejected.
    expect(status.value).toBe('OPT_todo');
  });

  it('a missing project scope renders the exact fix, verbatim and copyable', async () => {
    const fixtures = baseFixtures();
    renderView(<ProjectsView />, {
      fixtures: {
        ...fixtures,
        forgeProject: { ...fixtures.forgeProject, readKind: 'insufficient-scope', error: 'insufficient scope' },
      },
      uiState: { selectedRepoId: 'repo-1', selectedWorktreePath: MAIN },
    });

    expect(await screen.findByText('GitHub Projects needs one more permission')).toBeTruthy();
    expect(screen.getByText('gh auth refresh -s project')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy command' }));

    await waitFor(() =>
      expect(
        (window as unknown as { __mstudioClipboard: string[] }).__mstudioClipboard,
      ).toContain('gh auth refresh -s project'),
    );
  });
});
