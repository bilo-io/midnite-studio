// vitest/jsdom: shared ExplorerGroup accordion, repo grouping, and collapse state hook.
import { cleanup, fireEvent, render, renderHook, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ExplorerGroup, groupItemsByRepo, useCollapsedGroups } from './explorer';

afterEach(() => {
  cleanup();
});

describe('groupItemsByRepo', () => {
  it('groups items by repoId preserving first-seen repo and item order', () => {
    const grouped = groupItemsByRepo([
      { id: '1', repoId: 'repo:a', title: 'alpha' },
      { id: '2', repoId: 'repo:b', title: 'beta' },
      { id: '3', repoId: 'repo:a', title: 'alpha' },
    ]);

    expect(grouped).toEqual([
      {
        repoId: 'repo:a',
        title: 'alpha',
        items: [
          { id: '1', repoId: 'repo:a', title: 'alpha' },
          { id: '3', repoId: 'repo:a', title: 'alpha' },
        ],
      },
      {
        repoId: 'repo:b',
        title: 'beta',
        items: [{ id: '2', repoId: 'repo:b', title: 'beta' }],
      },
    ]);
  });

  it('falls back to repoId when title is empty', () => {
    const grouped = groupItemsByRepo([{ id: '1', repoId: 'repo:fallback', title: '' }]);
    expect(grouped[0]?.title).toBe('repo:fallback');
  });
});

describe('useCollapsedGroups', () => {
  it('starts all groups open and toggles each key independently', () => {
    const { result } = renderHook(() => useCollapsedGroups());

    expect(result.current.isOpen('repo:a')).toBe(true);
    expect(result.current.isOpen('repo:b')).toBe(true);

    act(() => result.current.toggle('repo:a'));
    expect(result.current.isOpen('repo:a')).toBe(false);
    expect(result.current.isOpen('repo:b')).toBe(true);

    act(() => result.current.toggle('repo:a'));
    expect(result.current.isOpen('repo:a')).toBe(true);
  });
});

describe('ExplorerGroup', () => {
  it('renders title, count, and toggles aria-expanded on header click', () => {
    const onToggle = () => {
      open = !open;
      rerender(
        <ExplorerGroup title="midnite-studio" count={2} open={open} onToggle={onToggle} bodyId="g1">
          <div>row-1</div>
        </ExplorerGroup>,
      );
    };
    let open = true;
    const { rerender } = render(
      <ExplorerGroup title="midnite-studio" count={2} open={open} onToggle={onToggle} bodyId="g1">
        <div>row-1</div>
      </ExplorerGroup>,
    );

    const button = screen.getByRole('button', { name: 'Collapse midnite-studio' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('2')).toBeTruthy();

    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Expand midnite-studio' }).getAttribute('aria-expanded')).toBe('false');
  });
});
