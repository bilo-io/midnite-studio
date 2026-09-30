import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fixtures } from '../../../../test-support/fixtures';
import { renderView } from '../../../../test-support/render';
import { useUiStore } from '../../../store/ui-store';
import { MediaView } from '../media-view';

/**
 * Phase 99 Theme B — Docs through the mock bridge: open a doc into the lazy
 * editor, ask for an edit, and check the diff card writes nothing until
 * Accept (then writes through `media:file-write`), while Reject only marks
 * the thread.
 */
const DOC = '# Intro\n\nHello.\n';

const read = async (path: string) => {
  const result = await window.midniteStudio!.media.file.read({ repoId: 'repo-1', tab: 'doc', project: 'handbook', path });
  return result.ok ? result.value : null;
};

const open = () =>
  renderView(<MediaView />, {
    fixtures: { ...fixtures, media: { files: { 'doc:handbook': { 'intro.md': DOC } } } },
    uiState: { selectedRepoId: 'repo-1' },
  });

const ask = async (prompt: string) => {
  const input = screen.getByRole('textbox', { name: 'Ask AI' });
  fireEvent.change(input, { target: { value: prompt } });
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
  });
};

beforeEach(() => {
  useUiStore.setState({ mediaTab: 'doc', mediaPaneCollapsed: {}, collapsedAccordionSections: [] });
});
afterEach(cleanup);

describe('Docs tab', () => {
  it('opens a doc in the editor and filters the explorer', async () => {
    open();
    fireEvent.click(await screen.findByText('intro'));
    expect(await screen.findByTestId('doc-editor', {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('doc-editor').textContent).toContain('Hello.');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Filter docs' }), { target: { value: 'nope' } });
    expect(screen.getByText(/No docs match/)).toBeTruthy();
  });

  it('shows an AI edit as a diff card, writing only on Accept', async () => {
    open();
    fireEvent.click(await screen.findByText('intro'));
    await screen.findByTestId('doc-editor', {}, { timeout: 5000 });

    await ask('add a note');
    const card = await screen.findByTestId('doc-diff-card');
    expect(card.textContent).toContain('+ _Edited: add a note_');
    expect(await read('intro.md')).toBe(DOC);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Accept/ }));
    });
    await waitFor(async () => expect(await read('intro.md')).toBe('# Intro\n\nHello.\n\n_Edited: add a note_\n'));
    await waitFor(async () => expect(await read('intro.thread.json')).toContain('"status": "accepted"'));
  });

  it('Reject leaves the doc untouched and marks the proposal', async () => {
    open();
    fireEvent.click(await screen.findByText('intro'));
    await screen.findByTestId('doc-editor', {}, { timeout: 5000 });

    await ask('rewrite');
    await screen.findByTestId('doc-diff-card');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reject/ }));
    });
    await waitFor(() => expect(screen.getByTestId('doc-diff-card').getAttribute('data-status')).toBe('rejected'));
    expect(await read('intro.md')).toBe(DOC);
    expect(await read('intro.thread.json')).toContain('"status": "rejected"');
  });
});
