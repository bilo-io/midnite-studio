/**
 * Vitest/jsdom — the Review view over a test host and a stubbed bridge (Phase 113 Theme M).
 * No browser capability needed: it is DOM text, roles and clicks.
 */
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotesHostProvider } from './host';
import { NotesWorkspace } from './notes-workspace';
import { useNotesStore } from './notes-store';
import { ReviewView } from './review-view';
import { createTestNotesHost } from './test-host';

const cards = [
  { id: 'n#1', noteId: 'n', front: 'Capital of France?', back: 'Paris', isNew: true },
  { id: 'n#2', noteId: 'n', front: '2+2?', back: '4', isNew: true },
];

function mount(ui = <ReviewView />, repo: string | null = 'nb') {
  const { chrome, DialogHost } = createFrameChrome();
  return render(
    <FrameChromeProvider chrome={chrome}>
      <DialogHost />
      <NotesHostProvider host={createTestNotesHost({ selectedRepoId: repo })}>{ui}</NotesHostProvider>
    </FrameChromeProvider>,
  );
}

describe('ReviewView', () => {
  const reviewDue = vi.fn();
  const reviewGrade = vi.fn();
  const original = window.midniteStudio;
  beforeEach(() => {
    reviewDue.mockReset().mockResolvedValue({ cards, total: 2 });
    reviewGrade.mockReset().mockResolvedValue({ ok: true, nextDue: 1 });
    useNotesStore.setState({ notes: {}, hydrated: true, selectedNoteId: null });
    Object.defineProperty(window, 'midniteStudio', {
      configurable: true,
      value: { notes: { reviewDue, reviewGrade, list: async () => ({ notes: [] }), save: vi.fn(), delete: vi.fn(), reorder: vi.fn() } },
    });
  });
  afterEach(() => {
    cleanup();
    Object.defineProperty(window, 'midniteStudio', { configurable: true, value: original });
  });

  it('shows the due count, hides the answer until revealed, then grades and advances', async () => {
    const { findByTestId, getByTestId, queryByTestId } = mount();
    expect((await findByTestId('review-due-count')).textContent).toContain('2 due');
    expect(getByTestId('review-front').textContent).toBe('Capital of France?');
    expect(queryByTestId('review-back')).toBeNull();
    fireEvent.click(getByTestId('review-reveal'));
    expect(getByTestId('review-back').textContent).toBe('Paris');
    fireEvent.click(getByTestId('review-grade-good'));
    await waitFor(() => expect(getByTestId('review-front').textContent).toBe('2+2?'));
    expect(reviewGrade).toHaveBeenCalledWith({ repoId: 'nb', cardId: 'n#1', grade: 'good' });
    expect(queryByTestId('review-back')).toBeNull();
  });

  it('says how to make cards when there are none, and when all are done', async () => {
    reviewDue.mockResolvedValue({ cards: [], total: 0 });
    const first = mount();
    expect((await first.findByTestId('review-empty')).textContent).toContain('No cards yet');
    cleanup();
    reviewDue.mockResolvedValue({ cards: [], total: 5 });
    const second = mount();
    expect((await second.findByTestId('review-empty')).textContent).toContain('All caught up');
  });

  it('switches between Notes and Review from the workspace tabs', async () => {
    const { getByTestId, findByTestId } = mount(<NotesWorkspace />);
    fireEvent.click(getByTestId('notes-tab-review'));
    expect(await findByTestId('review-view')).not.toBeNull();
  });
});
