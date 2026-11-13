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

  // Vitest twins of the readout tests in `e2e/footer-monitor.spec.ts`.
  const sample = (i: number, over: Record<string, number | undefined> = {}) => ({
    at: 1_700_000_000_000 + i * 2_000,
    cpu: 20 + i * 5,
    memory: 55,
    gpu: 30,
    disk: 72,
    ...over,
  });
  const pushSix = (over: Record<string, number | undefined> = {}) => {
    for (let i = 0; i < 6; i++) useMetricsStore.getState().push(sample(i, over) as never);
  };

  it('renders a readout per metric the machine can report', () => {
    pushSix();
    mount();
    for (const id of ['cpu', 'memory', 'gpu', 'disk']) {
      expect(screen.getByTestId(`metric-${id}`)).toBeTruthy();
    }
    expect(screen.getByTestId('metric-cpu').textContent).toMatch(/45%/);
    expect(screen.getByTestId('metric-disk').textContent).toMatch(/72%/);
    expect(screen.getByTestId('metric-disk').getAttribute('aria-label')).toMatch(/(?:Disk|HDD) 72 percent/);
  });

  it('an unreadable GPU renders three readouts, not a zero', () => {
    pushSix({ gpu: undefined });
    mount();
    expect(screen.getByTestId('metric-cpu')).toBeTruthy();
    expect(screen.queryByTestId('metric-gpu')).toBeNull();
    expect(screen.getByTestId('monitor-cluster').textContent).not.toContain('GPU');
  });

  it('a genuinely idle GPU still renders, because 0 is a reading', () => {
    pushSix({ gpu: 0 });
    mount();
    expect(screen.getByTestId('metric-gpu').textContent).toMatch(/0%/);
  });

  it('nothing is drawn before the first sample arrives', () => {
    mount();
    expect(screen.queryByTestId('monitor-cluster')).toBeNull();
  });
});
