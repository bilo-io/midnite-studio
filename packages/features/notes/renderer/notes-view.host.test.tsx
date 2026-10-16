/**
 * Vitest/jsdom — the Notes view rendered with no app around it, over the
 * frame kit's chrome and an in-memory host (Phase 113 Theme M). Studio's
 * richer view suite lives in `packages/app/src/compose/notes/`.
 */
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { NotesHostProvider } from './host';
import { useNotesStore } from './notes-store';
import { NotesView } from './notes-view';
import { createTestNotesHost } from './test-host';

function wrap(ui: ReactNode, options: Parameters<typeof createTestNotesHost>[0]) {
  const { chrome, DialogHost } = createFrameChrome();
  return (
    <FrameChromeProvider chrome={chrome}>
      <DialogHost />
      <NotesHostProvider host={createTestNotesHost(options)}>{ui}</NotesHostProvider>
    </FrameChromeProvider>
  );
}

describe('NotesView over a test host', () => {
  beforeEach(() => useNotesStore.setState({ notes: {}, hydrated: true, selectedNoteId: null }));
  afterEach(cleanup);

  it('shows the no-repository state when the host has none selected', () => {
    const { getByText } = render(wrap(<NotesView />, { selectedRepoId: null }));
    expect(getByText(/no repository open/i)).not.toBeNull();
  });

  it('shows the host\'s own empty hint for an empty notebook', () => {
    const host = { ...createTestNotesHost({ selectedRepoId: 'nb' }), emptyHint: 'Nothing here yet — by design.' };
    const { chrome, DialogHost } = createFrameChrome();
    const { getByText } = render(
      <FrameChromeProvider chrome={chrome}>
        <DialogHost />
        <NotesHostProvider host={host}>
          <NotesView />
        </NotesHostProvider>
      </FrameChromeProvider>,
    );
    expect(getByText('Nothing here yet — by design.')).not.toBeNull();
  });

  it('captures a note with Enter and opens it in the host editor, without agents', () => {
    const { getByTestId, getAllByLabelText } = render(wrap(<NotesView />, { selectedRepoId: 'nb' }));
    const composer = getByTestId('notes-composer');
    fireEvent.change(composer, { target: { value: 'Remember this' } });
    fireEvent.keyDown(composer, { key: 'Enter' });
    expect((getByTestId('test-editor') as HTMLTextAreaElement).value).toBe('Remember this');
    // No handoff in this host: the agent actions are disabled.
    for (const button of getAllByLabelText('Draft plan')) expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(Object.values(useNotesStore.getState().notes)).toHaveLength(1);
  });
});
