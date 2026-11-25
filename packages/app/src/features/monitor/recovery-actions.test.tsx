import { useOptimizerStore } from '@midnite/studio-feature-optimizer/renderer/testing';
import { StatusBarChromeProvider } from '@midnite/studio-frame';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { STUDIO_STATUS_BAR_CHROME } from '../../compose/status-bar-chrome';
import * as handoff from '../../services/handoff';
import { useMetricsStore } from '../../store/metrics-store';
import { useTerminalStore } from '../terminal/terminal-store';
import { MonitorCluster } from './monitor-cluster';
import { buildRecoveryActions } from './recovery-actions';

describe('buildRecoveryActions', () => {
  it('lists the four actions in order, disabling those with no entry point yet', () => {
    const actions = buildRecoveryActions();
    expect(actions.map((a) => a.label)).toEqual(['Clean system', 'Manage resources', 'Free RAM', 'Full recovery']);
    expect(actions.map((a) => a.disabled === true)).toEqual([false, false, true, true]);
  });

  it('enables an action once its seam is supplied', () => {
    const fullRecovery = vi.fn();
    const recover = buildRecoveryActions({ fullRecovery }).find((a) => a.id === 'full-recovery')!;
    expect(recover.disabled).toBeUndefined();
    recover.run();
    expect(fullRecovery).toHaveBeenCalledTimes(1);
  });

  it('runs the cleanSystem seam for Clean system', () => {
    const cleanSystem = vi.fn();
    buildRecoveryActions({ cleanSystem }).find((a) => a.id === 'clean-system')!.run();
    expect(cleanSystem).toHaveBeenCalledTimes(1);
  });

  it('opens the Optimizer on Memory ▸ Lost for Manage resources', () => {
    useOptimizerStore.setState({ tab: 'smartScan', memoryFilter: 'all' });
    const spy = vi.spyOn(handoff, 'requestHandoff').mockResolvedValue({ ok: true, via: 'in-process' } as never);
    buildRecoveryActions().find((a) => a.id === 'manage-resources')!.run();
    expect(useOptimizerStore.getState()).toMatchObject({ tab: 'memory', memoryFilter: 'lost' });
    expect(spy).toHaveBeenCalledWith({ app: 'cleaner', view: 'optimizer' });
    spy.mockRestore();
  });
});

describe('Studio monitor cluster recovery wiring', () => {
  beforeEach(() => {
    useMetricsStore.getState().reset();
    useMetricsStore.getState().push({ at: Date.now(), cpu: 25 });
    useTerminalStore.setState({ sessions: [], legacy: {} });
  });
  afterEach(cleanup);

  const mount = () =>
    render(
      <StatusBarChromeProvider chrome={STUDIO_STATUS_BAR_CHROME}>
        <MonitorCluster />
      </StatusBarChromeProvider>,
    );

  it('shows four actions in the flyout', async () => {
    mount();
    fireEvent.click(screen.getByTestId('monitor-cluster'));
    const group = await screen.findByRole('group', { name: 'Recovery actions' });
    expect(group.querySelectorAll('button')).toHaveLength(4);
  });

  it('enables Free RAM and Full recovery in the Studio flyout', async () => {
    mount();
    fireEvent.click(screen.getByTestId('monitor-cluster'));
    const group = await screen.findByRole('group', { name: 'Recovery actions' });
    const freeRam = within(group).getByRole('button', { name: /Free RAM/ }) as HTMLButtonElement;
    expect(freeRam.disabled).toBe(false);
  });

  it('shows the amber dot while a previous-build session exists and clears when it ends', async () => {
    useTerminalStore.setState({
      sessions: [{ id: 's1' }] as never,
      legacy: { s1: true },
      states: { s1: 'open' },
    });
    mount();
    expect(screen.getByTestId('monitor-attention').getAttribute('aria-label')).toBe('1 session from a previous build');
    useTerminalStore.setState({ sessions: [] });
    await waitFor(() => expect(screen.queryByTestId('monitor-attention')).toBeNull());
  });
});
