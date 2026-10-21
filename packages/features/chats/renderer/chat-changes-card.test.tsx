/**
 * Vitest/jsdom: the card's state matrix and the pure decision helpers. The card
 * talks to nothing — props in, callbacks out.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deriveChangeSetStatus, deriveFileStatus, type ChatChangedFile, type ChatChangeSet } from '@midnite/studio-shared';

import { decisionsFor, fileDecision, fileNeedsDecision } from './chat-changes';
import { CHANGE_STATUS_LABEL, ChatChangesCard } from './chat-changes-card';

const file = (path: string, hunkStatuses: ('pending' | 'accepted' | 'rejected')[] = ['pending'], over: Partial<ChatChangedFile> = {}): ChatChangedFile => {
  const base = {
    path,
    oldPath: null,
    change: 'modified' as const,
    binary: false,
    insertions: 3,
    deletions: 1,
    preview: ['+one', '-two'],
    hunks: hunkStatuses.map((status) => ({ header: '@@', insertions: 1, deletions: 0, status })),
    fileStatus: 'pending' as const,
    ...over,
  };
  return { ...base, status: deriveFileStatus(base) } as ChatChangedFile;
};

const set = (...files: ChatChangedFile[]): ChatChangeSet => ({ id: 'cs', createdAt: 1, files, status: deriveChangeSetStatus(files) });

afterEach(cleanup);

describe('ChatChangesCard', () => {
  it('summarises the files, the +/- totals and a few diff lines', () => {
    render(<ChatChangesCard changeSet={set(file('a.ts'), file('b.ts'))} onOpen={() => {}} onResolveAll={() => {}} />);
    const card = screen.getByTestId('chat-changes-card');
    expect(within(card).getByText('2 files changed')).toBeTruthy();
    expect(card.textContent).toContain('+6');
    expect(card.textContent).toContain('−2');
    expect(within(card).getAllByTestId('chat-changes-file')).toHaveLength(2);
    expect(within(card).getAllByTestId('chat-changes-preview')).toHaveLength(2);
  });

  it('says "1 file changed" for one, and shows a rename as old → new', () => {
    render(<ChatChangesCard changeSet={set(file('new.ts', ['pending'], { oldPath: 'old.ts', change: 'renamed' }))} onOpen={() => {}} onResolveAll={() => {}} />);
    expect(screen.getByText('1 file changed')).toBeTruthy();
    expect(screen.getByText('old.ts → new.ts')).toBeTruthy();
  });

  it('previews only the first two files, lists four, and counts the rest', () => {
    const many = set(...['a', 'b', 'c', 'd', 'e', 'f'].map((n) => file(`${n}.ts`)));
    render(<ChatChangesCard changeSet={many} onOpen={() => {}} onResolveAll={() => {}} />);
    expect(screen.getAllByTestId('chat-changes-file')).toHaveLength(4);
    expect(screen.getAllByTestId('chat-changes-preview')).toHaveLength(2);
    expect(screen.getByText('+ 2 more files')).toBeTruthy();
  });

  it('the whole summary is one button that opens the review', () => {
    const onOpen = vi.fn();
    render(<ChatChangesCard changeSet={set(file('a.ts'))} onOpen={onOpen} onResolveAll={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 file changed' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Review changes' }));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('pending: shows Accept all / Reject all, which do not open the review', () => {
    const onOpen = vi.fn();
    const onResolveAll = vi.fn();
    render(<ChatChangesCard changeSet={set(file('a.ts'))} onOpen={onOpen} onResolveAll={onResolveAll} />);
    expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('pending');
    fireEvent.click(screen.getByTestId('chat-changes-accept-all'));
    fireEvent.click(screen.getByTestId('chat-changes-reject-all'));
    expect(onResolveAll.mock.calls).toEqual([['accept'], ['reject']]);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each([
    ['accepted', set(file('a.ts', ['accepted']))],
    ['rejected', set(file('a.ts', ['rejected']))],
    ['partial', set(file('a.ts', ['accepted', 'rejected']))],
  ] as const)('%s: states it, and offers no more bulk actions once everything is decided', (status, changeSet) => {
    render(<ChatChangesCard changeSet={changeSet} onOpen={() => {}} onResolveAll={() => {}} />);
    expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe(status);
    expect(screen.getByTestId('chat-changes-status').textContent).toBe(CHANGE_STATUS_LABEL[status]);
    expect(screen.queryByTestId('chat-changes-accept-all')).toBeNull();
    expect(screen.getByRole('button', { name: 'View changes' })).toBeTruthy();
  });

  it('partial with something still undecided keeps the bulk actions', () => {
    render(<ChatChangesCard changeSet={set(file('a.ts', ['accepted', 'pending']))} onOpen={() => {}} onResolveAll={() => {}} />);
    expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('partial');
    expect(screen.getByTestId('chat-changes-accept-all')).toBeTruthy();
  });

  it('conflict: flagged on the card and keeps the bulk actions to retry or reject', () => {
    const conflicted = file('a.ts', ['pending'], { conflict: 'no longer applies' });
    render(<ChatChangesCard changeSet={set(conflicted)} onOpen={() => {}} onResolveAll={() => {}} />);
    expect(screen.getByTestId('chat-changes-card').dataset['status']).toBe('conflict');
    expect(screen.getByTestId('chat-changes-status').textContent).toBe('Conflict');
    expect(screen.getByTestId('chat-changes-accept-all')).toBeTruthy();
  });

  it('disables the bulk actions while a decision is being applied', () => {
    render(<ChatChangesCard changeSet={set(file('a.ts'))} busy onOpen={() => {}} onResolveAll={() => {}} />);
    expect((screen.getByTestId('chat-changes-accept-all') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a decided file\'s own status chip beside it', () => {
    render(<ChatChangesCard changeSet={set(file('a.ts', ['accepted']), file('b.ts'))} onOpen={() => {}} onResolveAll={() => {}} />);
    const [first, second] = screen.getAllByTestId('chat-changes-file');
    expect(within(first!).getByText('Accepted')).toBeTruthy();
    expect(within(second!).queryByText('Accepted')).toBeNull();
  });
});

describe('decision helpers', () => {
  it('accept/reject all decide exactly the files that still need it', () => {
    const cs = set(file('done.ts', ['accepted']), file('open.ts'), file('half.ts', ['accepted', 'pending']), file('c.ts', ['pending'], { conflict: 'x' }));
    expect(decisionsFor(cs, 'accept')).toEqual([
      { path: 'open.ts', action: 'accept' },
      { path: 'half.ts', action: 'accept' },
      { path: 'c.ts', action: 'accept' },
    ]);
    expect(decisionsFor(cs, 'reject').map((d) => d.path)).toEqual(['open.ts', 'half.ts', 'c.ts']);
  });

  it('nothing left means no decisions', () => {
    expect(decisionsFor(set(file('a.ts', ['accepted']), file('b.ts', ['rejected'])), 'accept')).toEqual([]);
  });

  it('a hunkless file needs a decision until its own status moves', () => {
    expect(fileNeedsDecision(file('img.png', [], { fileStatus: 'pending' }))).toBe(true);
    expect(fileNeedsDecision(file('img.png', [], { fileStatus: 'accepted' }))).toBe(false);
  });

  it('builds a whole-file or a single-hunk decision', () => {
    const f = file('a.ts', ['pending', 'pending']);
    expect(fileDecision(f, 'accept')).toEqual({ path: 'a.ts', action: 'accept' });
    expect(fileDecision(f, 'reject', 1)).toEqual({ path: 'a.ts', action: 'reject', hunks: [1] });
  });
});
