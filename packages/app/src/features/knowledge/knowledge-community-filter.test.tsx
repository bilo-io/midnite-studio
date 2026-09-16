// vitest/jsdom: DOM text/roles and a virtualized list under the app's global
// ResizeObserver stub (vitest-setup.ts) — no canvas involved.
//
// `FiringResizeObserver` (`vitest-setup.ts`) fires its callback from a
// `queueMicrotask`, not synchronously — `palette.bridge.test.tsx` names this
// same trap for `@tanstack/react-virtual`. A synchronous `getByText` right
// after `render`/`fireEvent` races that microtask and finds nothing, so every
// assertion here that reads a rendered row uses `findByText`/`waitFor`.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KnowledgeCommunityFilter } from './knowledge-community-filter';

describe('KnowledgeCommunityFilter', () => {
  afterEach(cleanup);

  const names = ['core', 'graph', 'zzz-rare'];

  it('renders every community as a checked-by-default row', async () => {
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        hidden={new Set()}
        onToggle={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );
    for (const name of names) {
      const checkbox = (await screen.findByText(name)).closest('label')?.querySelector('input');
      expect(checkbox).not.toBeNull();
      expect((checkbox as HTMLInputElement).checked).toBe(true);
    }
  });

  it('unchecks a hidden community', async () => {
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        hidden={new Set(['graph'])}
        onToggle={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );
    const checkbox = (await screen.findByText('graph')).closest('label')?.querySelector('input');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('filters the list by the search box', async () => {
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        hidden={new Set()}
        onToggle={vi.fn()}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );
    await screen.findByText('core'); // let the initial virtualized render settle
    fireEvent.change(screen.getByLabelText('Search communities'), { target: { value: 'zzz' } });
    await waitFor(() => expect(screen.getByText('zzz-rare')).toBeDefined());
    expect(screen.queryByText('core')).toBeNull();
  });

  it('calls onToggle with the clicked community name', async () => {
    const onToggle = vi.fn();
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        hidden={new Set()}
        onToggle={onToggle}
        onShowAll={vi.fn()}
        onHideAll={vi.fn()}
      />,
    );
    const row = (await screen.findByText('core')).closest('label');
    const checkbox = row?.querySelector('input');
    expect(checkbox).not.toBeNull();
    fireEvent.click(checkbox as HTMLInputElement);
    expect(onToggle).toHaveBeenCalledWith('core');
  });

  it('"Hide all" passes the full name list, "Show all" needs no argument', () => {
    const onHideAll = vi.fn();
    const onShowAll = vi.fn();
    render(
      <KnowledgeCommunityFilter
        communityNames={names}
        hidden={new Set()}
        onToggle={vi.fn()}
        onShowAll={onShowAll}
        onHideAll={onHideAll}
      />,
    );
    fireEvent.click(screen.getByText('Hide all'));
    expect(onHideAll).toHaveBeenCalledWith(names);
    fireEvent.click(screen.getByText('Show all'));
    expect(onShowAll).toHaveBeenCalled();
  });
});
