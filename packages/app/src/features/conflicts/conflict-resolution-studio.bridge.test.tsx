import { useState } from 'react';

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeFixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { ToastHost } from '../../components/toast-host';
import { useRepoStatus } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { ConflictBanner } from '../status/conflict-banner';
import { ConflictResolutionStudio } from './conflict-resolution-studio';

/**
 * Migrated from `e2e/conflict-resolution-studio.spec.ts` (Phase 82 Theme C
 * wave 5) — the whole chain `conflict-resolution-studio.test.tsx`'s own
 * hand-mocked-bridge suite does not reach: `ConflictBanner`'s path list is
 * genuinely clickable, it genuinely opens the Studio, accepting a region
 * genuinely reaches `ops.conflictApplyHunk` with the payload the git-engine
 * side expects, and "Suggest a resolution" genuinely round-trips through
 * `council.run.start`/`get`. 7 of the original 7 tests moved here — no
 * straggler needed a real browser, since nothing under test depends on
 * layout, painting, or a native picker.
 *
 * `Harness` mirrors exactly the slice of `graph-view.tsx` that wires these
 * two components together (`ConflictBanner` above, `ConflictResolutionStudio`
 * in the side panel once `graphSelection.kind === 'conflict'`) — the same
 * "small harness, not the whole heavy view" shape `diff-view.bridge.test.tsx`
 * uses for `CommitDetail`, chosen over mounting the virtualised `GraphView`
 * itself, which this flow does not need.
 */

const CONFLICTED_ENTRY = {
  path: 'src/f.txt',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'conflicted',
  conflicted: true,
  similarity: null,
};

const TWO_REGIONS = [
  {
    segments: [
      { kind: 'context', lines: ['shared line'] },
      { kind: 'conflict', region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null } },
      { kind: 'context', lines: ['middle'] },
      { kind: 'conflict', region: { ours: ['MAIN2'], theirs: ['FEAT2'], base: null } },
    ],
  },
];

function baseFixtures(): MockFixtures {
  return makeFixtures({
    statusEntries: [CONFLICTED_ENTRY],
    inProgress: 'merge',
    conflictRegions: { 'src/f.txt': TWO_REGIONS },
  });
}

function Harness({ repoId }: { repoId: string }) {
  const { data: status } = useRepoStatus({ repoId });
  const graphSelection = useUiStore((s) => s.graphSelection);
  const selectConflict = useUiStore((s) => s.selectConflict);
  const [opError, setOpError] = useState('');
  return (
    <div>
      {status ? (
        <ConflictBanner status={status} onError={setOpError} onOpenConflict={selectConflict} />
      ) : null}
      {opError ? <p>{opError}</p> : null}
      {graphSelection?.kind === 'conflict' ? (
        <ConflictResolutionStudio
          repoId={repoId}
          path={graphSelection.path}
          onClose={() => selectConflict(null)}
          onError={setOpError}
        />
      ) : null}
    </div>
  );
}

async function open(data: MockFixtures = baseFixtures()): Promise<void> {
  renderView(
    <ToastHost>
      <Harness repoId="repo-1" />
    </ToastHost>,
    { fixtures: data, uiState: { graphSelection: null } },
  );
  await screen.findByText('Merge in progress', { exact: false });
}

const studio = () => screen.getByTestId('conflict-resolution-studio');

/** Clicks the banner's path row and waits for the Studio's own (separately
 *  fetched) region query to resolve — otherwise its body still reads
 *  "loading…" the instant the testid appears. */
async function openStudio(path = 'src/f.txt'): Promise<void> {
  fireEvent.click(within(screen.getByTestId('conflict-banner')).getByRole('button', { name: path }));
  await screen.findByTestId('conflict-resolution-studio');
  await within(studio()).findByText('shared line');
}

beforeEach(() => {
  useUiStore.setState({ graphSelection: null });
});

afterEach(cleanup);

describe('the Conflict Resolution Studio, assembled through the real bridge', () => {
  it('the conflicted path in the banner opens the Studio, showing every region', async () => {
    await open();
    await openStudio();

    expect(within(studio()).getByText('2 regions left')).toBeTruthy();
    expect(within(studio()).getByText('shared line')).toBeTruthy();
    expect(within(studio()).getByText('MAIN1')).toBeTruthy();
    expect(within(studio()).getByText('FEAT1')).toBeTruthy();
    expect(within(studio()).getByText('MAIN2')).toBeTruthy();
  });

  it('accepting one region calls conflictApplyHunk with that exact region and side', async () => {
    await open();
    await openStudio();

    fireEvent.click(within(studio()).getAllByRole('button', { name: 'Accept mine' })[0]!);

    await waitFor(() => {
      const ops = (window as unknown as { __mstudioOps: { op: string; args: unknown }[] })
        .__mstudioOps;
      const applyHunkCalls = ops.filter((c) => c.op === 'conflictApplyHunk');
      expect(applyHunkCalls).toHaveLength(1);
      expect(applyHunkCalls[0]?.args).toMatchObject({
        path: 'src/f.txt',
        regionIndex: 0,
        side: 'ours',
      });
    });
  });

  it('Accept all mine closes the Studio and calls the whole-file op', async () => {
    await open();
    await openStudio();

    fireEvent.click(within(studio()).getByRole('button', { name: 'Accept all mine' }));

    await waitFor(() => expect(screen.queryByTestId('conflict-resolution-studio')).toBeNull());
    const ops = (window as unknown as { __mstudioOps: { op: string }[] }).__mstudioOps;
    expect(ops.filter((c) => c.op === 'conflictResolveWholeFile')).toHaveLength(1);
  });

  it('closing the Studio returns to no side panel at all', async () => {
    await open();
    await openStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByTestId('conflict-resolution-studio')).toBeNull();
  });

  it('a plain (non-conflicted) status entry never renders as a clickable banner row', async () => {
    await open(
      makeFixtures({
        statusEntries: [{ ...CONFLICTED_ENTRY, path: 'clean.txt', conflicted: false, unstaged: 'modified' }],
        inProgress: 'merge',
      }),
    );

    const banner = screen.getByTestId('conflict-banner');
    expect(within(banner).getByText('conflicts resolved — ready to continue')).toBeTruthy();
    expect(within(banner).queryByRole('button', { name: 'clean.txt' })).toBeNull();
  });

  /**
   * "Suggest a resolution" (Phase 47 Theme E). The mock's own `council.run.start`
   * answers with an already-`completed` run synchronously (real member/synthesis
   * orchestration is main-only, covered by `council-runner.test.ts`) — exactly
   * what lets this assert the advisory text renders without choreographing a
   * fake multi-process race.
   */
  const REVIEWERS_COUNCIL = {
    id: 'c1',
    name: 'Reviewers',
    members: [{ id: 'm1', name: 'Reviewer', provider: 'agy', role: 'Review the conflict.' }],
    synthProvider: 'agy',
  };

  it('with a council available, "Suggest a resolution" runs it and shows the advisory text', async () => {
    await open({ ...baseFixtures(), councils: [REVIEWERS_COUNCIL] });
    await openStudio();

    expect(await within(studio()).findByLabelText('Suggestions from')).toBeTruthy();
    fireEvent.click(within(studio()).getAllByRole('button', { name: 'Suggest a resolution' })[0]!);

    expect(await within(studio()).findByText(/Synthesis of the panel's views/)).toBeTruthy();

    // Purely advisory — Accept mine is still there, unaffected, still a click away.
    expect(
      (within(studio()).getAllByRole('button', { name: 'Accept mine' })[0] as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('with no council yet, the Studio shows no picker and no suggest button', async () => {
    await open();
    await openStudio();

    expect(within(studio()).queryByLabelText('Suggestions from')).toBeNull();
    expect(within(studio()).queryByRole('button', { name: 'Suggest a resolution' })).toBeNull();
  });
});
