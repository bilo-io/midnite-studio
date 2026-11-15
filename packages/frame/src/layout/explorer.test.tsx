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

  it('attaches wrapperRef, headerAttributes, headerListeners, and opacity-80 when isDragging', () => {
    let capturedNode: HTMLElement | null = null;
    let toggleCount = 0;

    const { rerender } = render(
      <ExplorerGroup
        title="midnite-studio"
        count={1}
        open={true}
        onToggle={() => {
          toggleCount += 1;
        }}
        bodyId="g2"
        wrapperRef={(node) => {
          capturedNode = node;
        }}
        headerAttributes={{ 'data-header-attr': 'yes' }}
        headerListeners={{ 'data-header-listener': 'yes' }}
        isDragging={false}
      >
        <div data-testid="child-row">row-1</div>
      </ExplorerGroup>,
    );

    expect(capturedNode).not.toBeNull();
    expect(capturedNode!.className).not.toContain('opacity-80');

    const header = screen.getByRole('button', { name: 'Collapse midnite-studio' }).parentElement!;
    expect(header.getAttribute('data-header-attr')).toBe('yes');
    expect(header.getAttribute('data-header-listener')).toBe('yes');

    const child = screen.getByTestId('child-row');
    expect(child.getAttribute('data-header-attr')).toBeNull();
    expect(child.getAttribute('data-header-listener')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse midnite-studio' }));
    expect(toggleCount).toBe(1);

    rerender(
      <ExplorerGroup
        title="midnite-studio"
        count={1}
        open={true}
        onToggle={() => {
          toggleCount += 1;
        }}
        bodyId="g2"
        wrapperRef={(node) => {
          capturedNode = node;
        }}
        headerAttributes={{ 'data-header-attr': 'yes' }}
        headerListeners={{ 'data-header-listener': 'yes' }}
        isDragging={true}
      >
        <div data-testid="child-row">row-1</div>
      </ExplorerGroup>,
    );

    expect(capturedNode!.className).toContain('opacity-80');
  });

  it('renders an aligned guide line with shimmer only when guideLine is active', () => {
    const { rerender } = render(
      <ExplorerGroup title="active-repo" count={1} open={true} onToggle={() => {}} bodyId="g-guide">
        <div>row</div>
      </ExplorerGroup>,
    );
    expect(screen.queryByTestId('explorer-group-guide')).toBeNull();

    rerender(
      <ExplorerGroup
        title="active-repo"
        count={1}
        open={true}
        onToggle={() => {}}
        bodyId="g-guide"
        guideLine="active"
      >
        <div>row</div>
      </ExplorerGroup>,
    );
    expect(screen.getByTestId('explorer-group-guide')).toBeTruthy();
    expect(screen.getByTestId('explorer-group-guide-shimmer')).toBeTruthy();

    rerender(
      <ExplorerGroup
        title="other-repo"
        count={1}
        open={true}
        onToggle={() => {}}
        bodyId="g-guide"
        guideLine="muted"
      >
        <div>row</div>
      </ExplorerGroup>,
    );
    expect(screen.getByTestId('explorer-group-guide')).toBeTruthy();
    expect(screen.queryByTestId('explorer-group-guide-shimmer')).toBeNull();
  });
  it('gives every header a chevron orb and pulses only the active group, phase-locked', () => {
    const { container, rerender } = render(
      <ExplorerGroup title="repo" count={1} open={true} onToggle={() => {}} bodyId="g-orb" guideLine="muted">
        <div>row</div>
      </ExplorerGroup>,
    );
    expect(screen.getByTestId('explorer-group-orb')).toBeTruthy();
    expect(container.querySelector('.explorer-orb-ring')).toBeNull();
    expect(container.querySelector('.explorer-title-stroke')).toBeNull();

    rerender(
      <ExplorerGroup title="repo" count={1} open={true} onToggle={() => {}} bodyId="g-orb" guideLine="active">
        <div>row</div>
      </ExplorerGroup>,
    );
    for (const cls of ['explorer-orb-halo', 'explorer-orb-ring', 'explorer-header-sweep', 'explorer-title-stroke']) {
      const el = container.querySelector<HTMLElement>(`.${cls}`);
      expect(el, cls).not.toBeNull();
      expect(el!.style.animationDelay).toMatch(/^-?[\d.]+ms$/);
    }
    expect(screen.getByTestId('explorer-group-guide-shimmer').style.animationDelay).toMatch(/ms$/);
  });
  it('puts the logo inside the orb and wraps trailing controls for the active sweep', () => {
    const { container } = render(
      <ExplorerGroup
        title="repo"
        count={1}
        open={true}
        onToggle={() => {}}
        bodyId="g-logo"
        guideLine="active"
        leading={<img alt="" data-testid="logo" />}
        trailing={<button type="button">add</button>}
      >
        <div>row</div>
      </ExplorerGroup>,
    );
    expect(screen.getByTestId('explorer-group-orb').contains(screen.getByTestId('logo'))).toBe(true);
    // Logo shows by default; the chevron is hidden until the header is hovered or focused.
    expect(screen.getByTestId('explorer-group-chevron').getAttribute('class')).toContain('opacity-0');
    expect(screen.getByTestId('explorer-group-orb-logo').className).toContain('group-hover/explorer-header:opacity-0');
    const trailing = container.querySelector<HTMLElement>('.explorer-trailing-shimmer');
    expect(trailing?.contains(screen.getByText('add'))).toBe(true);
    expect(trailing?.style.getPropertyValue('--pulse-delay')).toMatch(/ms$/);
  });
});
