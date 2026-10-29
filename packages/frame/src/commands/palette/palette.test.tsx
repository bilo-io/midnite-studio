import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CommandRuntime } from '../command-runtime';
import { PaletteHost } from './palette-host';
import { usePaletteStore } from './palette-store';

/**
 * The frame's palette lists exactly the commands the app has handlers for (Phase 123 Theme D), so
 * `Mod+k` in a suite app shows only what works there. Rows are virtualized: `findAllByRole` gives
 * the frame's firing `ResizeObserver` (vitest-setup.ts) its microtask before the read.
 */
beforeEach(() => {
  usePaletteStore.setState({ isOpen: false, mode: 'all', query: '', selectedIndex: 0 });
});

afterEach(cleanup);

describe('PaletteHost', () => {
  it('lists exactly the commands with handlers', async () => {
    const runtime: CommandRuntime = {
      'terminal.toggle': { enabled: true, run: vi.fn() },
      'view.settings': { enabled: true, run: vi.fn() },
      'app.reload': { enabled: false, disabledReason: 'Not now', run: vi.fn() },
    };
    render(
      <PaletteHost runtime={runtime}>
        <main />
      </PaletteHost>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => usePaletteStore.getState().open());

    const options = await screen.findAllByRole('option');
    const labels = options.map((o) => o.querySelector('span.truncate')?.textContent);
    expect(labels.sort()).toEqual(['Open Settings', 'Reload', 'Toggle Terminal']);
  });

  it('runs a row and closes', async () => {
    const run = vi.fn();
    render(
      <PaletteHost runtime={{ 'view.settings': { enabled: true, run } }}>
        <main />
      </PaletteHost>,
    );
    act(() => usePaletteStore.getState().open());

    const [row] = await screen.findAllByRole('option');
    act(() => row!.click());

    expect(run).toHaveBeenCalledTimes(1);
    expect(usePaletteStore.getState().isOpen).toBe(false);
  });

  it('mounts an app palette component in place of the default', () => {
    const Own = () => <div>own palette</div>;
    render(
      <PaletteHost palette={Own}>
        <main />
      </PaletteHost>,
    );
    act(() => usePaletteStore.getState().open());
    expect(screen.getByText('own palette')).toBeTruthy();
  });
});
