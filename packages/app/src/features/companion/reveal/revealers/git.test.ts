import type { ResourceRef } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActionsStore } from '../../../../store/actions-store';
import { useIssueModalStore } from '../../../../store/issue-modal-store';
import { useReviewsStore } from '../../../../store/reviews-store';
import { useUiStore } from '../../../../store/ui-store';
import { useCommitFileRequest } from '../../../commit/commit-file-request';
import { useFilesStore } from '../../../files/files-store';
import type { RevealContext } from '../types';
import { GIT_REVEALERS } from './git';

const mocks = vi.hoisted(() => ({ revealCommit: vi.fn(), refs: vi.fn(), stashList: vi.fn() }));

vi.mock('../../../graph/reveal-commit', () => ({ revealCommit: mocks.revealCommit }));
vi.mock('../../../../services/bridge', () => ({
  bridge: () => ({ repos: { refs: mocks.refs }, stash: { list: mocks.stashList } }),
}));

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const ctx: RevealContext = { caller: 'companion', focusedWindow: false };

// Revealers are typed per kind; the table is indexed by the ref's own kind.
const run = (ref: ResourceRef) =>
  (GIT_REVEALERS[ref.kind as keyof typeof GIT_REVEALERS].reveal as (r: ResourceRef, c: RevealContext) => ReturnType<typeof GIT_REVEALERS.commit.reveal>)(ref, ctx);

describe('git revealers (store fakes)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.revealCommit.mockResolvedValue({ ok: true, sha: SHA, clearedFilter: false });
    useUiStore.setState({ graphSelection: null });
    useFilesStore.setState({ selectedPath: null, revealLine: null, nav: { entries: [], index: -1 }, expanded: {} });
    useCommitFileRequest.setState({ request: null });
    useIssueModalStore.setState({ target: null } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  it('commit: lands through revealCommit and labels with the short sha', async () => {
    const out = await run({ kind: 'commit', repoId: 'r1', sha: 'a1b2c3d' });
    expect(mocks.revealCommit).toHaveBeenCalledWith('r1', 'a1b2c3d', { refFullName: null });
    expect(out).toEqual({ ok: true, did: 'revealed', label: 'commit a1b2c3d' });
  });

  it('commit: a filter that was cleared is said out loud', async () => {
    mocks.revealCommit.mockResolvedValue({ ok: true, sha: SHA, clearedFilter: true });
    const out = await run({ kind: 'commit', repoId: 'r1', sha: SHA });
    expect(out).toMatchObject({ ok: true, say: expect.stringContaining('cleared') });
  });

  it('commit: a failed landing is not-found with its own sentence', async () => {
    mocks.revealCommit.mockResolvedValue({ ok: false, say: 'older than loaded' });
    expect(await run({ kind: 'commit', repoId: 'r1', sha: SHA })).toEqual({
      ok: false,
      reason: 'not-found',
      say: 'older than loaded',
    });
  });

  it('ref: reveals the tip commit and names the badge to pulse', async () => {
    mocks.refs.mockResolvedValue([{ fullName: 'refs/heads/main', sha: SHA }]);
    const out = await run({ kind: 'ref', repoId: 'r1', fullName: 'refs/heads/main' });
    expect(mocks.revealCommit).toHaveBeenCalledWith('r1', SHA, { refFullName: 'refs/heads/main' });
    expect(out).toMatchObject({ ok: true, label: 'branch main' });
  });

  it('ref: an unknown ref is not-found', async () => {
    mocks.refs.mockResolvedValue([]);
    expect(await run({ kind: 'ref', repoId: 'r1', fullName: 'refs/heads/gone' })).toMatchObject({
      ok: false,
      reason: 'not-found',
    });
  });

  it('stash: selects the stash in the graph, or not-found when the index is past the list', async () => {
    mocks.stashList.mockResolvedValue([{ selector: 'stash@{0}' }]);
    expect(await run({ kind: 'stash', repoId: 'r1', index: 0 })).toMatchObject({ ok: true });
    expect(useUiStore.getState().graphSelection).toEqual({ kind: 'stash', selector: 'stash@{0}' });
    expect(await run({ kind: 'stash', repoId: 'r1', index: 3 })).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('file: reveals the path with its line', async () => {
    await run({ kind: 'file', repoId: 'r1', path: 'src/a/b.ts', line: 42 });
    const files = useFilesStore.getState();
    expect(files.selectedPath).toBe('src/a/b.ts');
    expect(files.revealLine).toBe(42);
    expect(files.expanded).toEqual({ src: true, 'src/a': true });
  });

  it('file: any other way of selecting a file drops the line', async () => {
    await run({ kind: 'file', repoId: 'r1', path: 'src/a.ts', line: 7 });
    useFilesStore.getState().selectFile('src/b.ts');
    expect(useFilesStore.getState().revealLine).toBeNull();
  });

  it('commitFile: reveals the commit then asks the inspector for that file by full sha', async () => {
    const out = await run({ kind: 'commitFile', repoId: 'r1', sha: 'a1b2c3d', path: 'src/x.ts' });
    expect(out).toMatchObject({ ok: true });
    expect(useCommitFileRequest.getState().request).toMatchObject({ sha: SHA, path: 'src/x.ts' });
  });

  it('commitFile: no file request when the commit could not be landed', async () => {
    mocks.revealCommit.mockResolvedValue({ ok: false, say: 'nope' });
    await run({ kind: 'commitFile', repoId: 'r1', sha: SHA, path: 'src/x.ts' });
    expect(useCommitFileRequest.getState().request).toBeNull();
  });

  it('pull: selects the pull request for its repo', async () => {
    await run({ kind: 'pull', repoId: 'r1', number: 812 });
    expect(useReviewsStore.getState().selectedPull).toMatchObject({ r1: 812 });
  });

  it('issue: opens the issue modal', async () => {
    const out = await run({ kind: 'issue', repoId: 'r1', number: 212 });
    expect(useIssueModalStore.getState().target).toEqual({ repoId: 'r1', number: 212 });
    expect(out).toMatchObject({ ok: true, label: 'issue 212' });
  });

  it('ciRun: selects the run, then the job when given', async () => {
    await run({ kind: 'ciRun', repoId: 'r1', runId: '99' });
    expect(useActionsStore.getState().selectedRun).toMatchObject({ r1: '99' });
    expect(useActionsStore.getState().selectedJob).toEqual({});
    await run({ kind: 'ciRun', repoId: 'r1', runId: '99', jobId: 'build' });
    expect(useActionsStore.getState().selectedJob).toMatchObject({ r1: 'build' });
  });
});
