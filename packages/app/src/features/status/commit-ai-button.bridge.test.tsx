import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fixtures } from '../../../test-support/fixtures';
import type { MockFixtures } from '../../../test-support/mock-bridge';
import { renderView } from '../../../test-support/render';
import { useCommitBoxStore } from '../../store/commit-box-store';
import { WorkingTreeInlinePanel } from '../graph/graph-inline-panels';

/** "Write with AI" on the commit box. jsdom + the mock bridge; the `ai`
 *  namespace the mock bridge does not carry is stubbed per test. */

const entry = (path: string) => ({
  path,
  origPath: null,
  staged: 'unmodified',
  unstaged: 'modified',
  conflicted: false,
  similarity: null,
});

const WITH_CHANGES: MockFixtures = { ...fixtures, statusEntries: [entry('src/a.ts')] };
const NO_CHANGES: MockFixtures = { ...fixtures, statusEntries: [] };
const UI = {
  selectedRepoId: 'repo-1',
  selectedWorktreePath: '/tmp/midnite-studio',
  activeView: 'graph' as const,
};

type Reply = { ok: true; value: { text: string; source: 'staged' | 'working' } } | { ok: false; kind: 'error'; message: string };

function open(data: MockFixtures, commitMessage: (req: unknown) => Promise<Reply>) {
  const view = renderView(<WorkingTreeInlinePanel active onClose={() => {}} />, {
    fixtures: data,
    uiState: UI,
  });
  const bridge = (window as unknown as { midniteStudio: Record<string, unknown> }).midniteStudio;
  bridge.ai = { commitMessage };
  return view;
}

afterEach(() => {
  cleanup();
  useCommitBoxStore.setState({ drafts: {} });
});

describe('Write with AI on the commit box', () => {
  it('is a sparkles button labelled "Write with AI"', async () => {
    open(WITH_CHANGES, vi.fn());
    const button = await screen.findByRole('button', { name: 'Write with AI' });
    expect(button).toBeTruthy();
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('is disabled when there are no changes', async () => {
    const call = vi.fn();
    open(NO_CHANGES, call);
    const button = await screen.findByRole('button', { name: /Write with AI/ });
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(call).not.toHaveBeenCalled();
  });

  it('shows pending state, then fills the textarea', async () => {
    let resolve!: (reply: Reply) => void;
    const call = vi.fn(() => new Promise<Reply>((r) => (resolve = r)));
    open(WITH_CHANGES, call);
    const textarea = (await screen.findByPlaceholderText('Commit message')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'wip' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));
    await waitFor(() => expect(call).toHaveBeenCalledTimes(1));
    // Not wiped while the model thinks, and a second click does nothing.
    expect(textarea.value).toBe('wip');
    fireEvent.click(screen.getByRole('button', { name: /Write with AI/ }));
    expect(call).toHaveBeenCalledTimes(1);

    resolve({ ok: true, value: { text: 'feat(ui): add a thing\n\nBody.', source: 'working' } });
    await waitFor(() => expect(textarea.value).toBe('feat(ui): add a thing\n\nBody.'));
  });

  it('keeps the replaced text and restores it on Undo', async () => {
    const call = vi.fn(async (): Promise<Reply> => ({ ok: true, value: { text: 'fix: x', source: 'staged' } }));
    open(WITH_CHANGES, call);
    const textarea = (await screen.findByPlaceholderText('Commit message')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'my own words' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));
    await waitFor(() => expect(textarea.value).toBe('fix: x'));

    fireEvent.click(screen.getByTestId('commit-ai-undo'));
    expect(textarea.value).toBe('my own words');
    expect(screen.queryByTestId('commit-ai-undo')).toBeNull();
  });

  it('shows the failure inline and leaves the draft alone', async () => {
    const call = vi.fn(async (): Promise<Reply> => ({ ok: false, kind: 'error', message: 'No agent CLI installed.' }));
    open(WITH_CHANGES, call);
    const textarea = (await screen.findByPlaceholderText('Commit message')) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'keep me' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Write with AI' }));
    expect((await screen.findByRole('alert')).textContent).toContain('No agent CLI installed.');
    expect(textarea.value).toBe('keep me');
  });
});
