import { StatusBarChromeProvider } from '@midnite/studio-frame';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STUDIO_STATUS_BAR_CHROME } from '../../compose/status-bar-chrome';
import * as handoff from '../../services/handoff';
import { useMetricsStore } from '../../store/metrics-store';
import { MonitorCluster } from './monitor-cluster';

/** Studio's composition of the frame's cluster: its own chrome, flyout and hand-off. */
function mount() {
  return render(
    <StatusBarChromeProvider chrome={STUDIO_STATUS_BAR_CHROME}>
      <MonitorCluster />
    </StatusBarChromeProvider>,
  );
}

describe('MonitorCluster (Studio)', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows Studio tooltips on focus, disk as HDD', async () => {
    useMetricsStore.getState().push({ at: Date.now(), cpu: 25, memory: 50, gpu: 15, disk: 80 });
    mount();
    fireEvent.focus(screen.getByTestId('metric-cpu'));
    expect((await screen.findByRole('tooltip')).textContent).toBe('CPU');
    cleanup();
    mount();
    fireEvent.focus(screen.getByTestId('metric-disk'));
    expect((await screen.findByRole('tooltip')).textContent).toBe('HDD');
  });

  it('hands off to the Monitor app from the flyout', async () => {
    const spy = vi.spyOn(handoff, 'requestHandoff').mockResolvedValue({ ok: true, via: 'local' });
    useMetricsStore.getState().push({ at: Date.now(), cpu: 25, memory: 50, gpu: 15, disk: 80 });
    mount();
    fireEvent.click(screen.getByTestId('monitor-cluster'));
    fireEvent.click(await screen.findByRole('button', { name: 'Open Monitor' }));
    expect(spy).toHaveBeenCalledWith({ app: 'monitor', view: 'monitor' });
    spy.mockRestore();
  });
});
