import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogHost } from '../../components/dialog-host';
import { useUiStore } from '../../store/ui-store';
import { CompanionHeader } from './companion-header';

const mocks = vi.hoisted(() => ({
  windowRole: 'main' as string,
  detach: vi.fn(),
}));

vi.mock('../../services/bridge', () => ({
  bridge: () => ({ windowRole: mocks.windowRole, window: { detach: mocks.detach } }),
}));

describe('CompanionHeader', () => {
  beforeEach(() => {
    mocks.windowRole = 'main';
    mocks.detach.mockClear();
    useUiStore.setState({ companionPanelOpen: true });
  });

  afterEach(cleanup);

  it('detaches through the bridge and closes through the store, docked', () => {
    render(
      <DialogHost>
        <CompanionHeader state="idle" />
      </DialogHost>,
    );

    fireEvent.click(screen.getByLabelText('Detach the Companion into its own window'));
    expect(mocks.detach).toHaveBeenCalledWith({ role: 'companion' });

    fireEvent.click(screen.getByLabelText('Close the Companion'));
    expect(useUiStore.getState().companionPanelOpen).toBe(false);
  });

  /**
   * Both hidden in a popout, and for the same underlying reason: a detached
   * window offering to "detach" is a dead end, and one offering to "close"
   * here would only flip a flag this window's own `DetachedContent` never
   * reads (`detached-root.tsx` mounts `<CompanionPanel>` unconditionally for
   * `role: 'companion'`) — an inert click rather than an actual close. Clear
   * stays, unlike its two neighbours: a detached companion is still a live
   * conversation with a record to clear.
   */
  it('hides detach and close in a popout, but keeps Clear', () => {
    mocks.windowRole = 'companion';
    render(
      <DialogHost>
        <CompanionHeader state="idle" />
      </DialogHost>,
    );

    expect(screen.queryByLabelText('Detach the Companion into its own window')).toBeNull();
    expect(screen.queryByLabelText('Close the Companion')).toBeNull();
    expect(screen.getByLabelText('Clear conversation')).toBeDefined();
  });
});
