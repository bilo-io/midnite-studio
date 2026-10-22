// vitest/jsdom: the view over a mock bridge — filters, grouping, detail and the Sensors tab need no real browser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SecurityFinding } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VanguardPage } from './vanguard-page';
import { useVanguardUi } from './vanguard-ui-store';

const finding = (over: Partial<SecurityFinding>): SecurityFinding => ({
  id: 'f1',
  fingerprint: 'fp1',
  source: 'vanguard',
  severity: 'high',
  category: 'persistence',
  title: 'New LaunchAgent',
  detail: 'A launch agent appeared.',
  evidence: [{ kind: 'path', path: '/Users/x/Library/LaunchAgents/a.plist' }],
  remediation: [{ id: 'mute' }, { id: 'bootout-launch-item', domain: 'gui/501', path: '/a.plist' }],
  firstSeen: 1,
  lastSeen: 2,
  count: 2,
  status: 'open',
  ...over,
});

let onFindingsChanged: (() => void) | null = null;
const list = vi.fn();
const act_ = vi.fn();
const setStatus = vi.fn();
const sensors = vi.fn();
const viewOpened = vi.fn();

beforeEach(() => {
  useVanguardUi.setState({ tab: 'findings' });
  list.mockResolvedValue({ findings: [finding({}), finding({ id: 'f2', severity: 'low', title: 'Odd env', category: 'config' })] });
  act_.mockResolvedValue({ ok: true, value: { actionId: 'mute' } });
  setStatus.mockResolvedValue({ ok: true, value: finding({}) });
  sensors.mockResolvedValue({ active: true, sensors: [{ id: 'integrity', label: 'Integrity', description: 'hashes', state: 'idle', enabled: true, lastRunAt: Date.now() - 5000, lastDurationMs: 12, lastFindings: 1 }] });
  viewOpened.mockResolvedValue({ active: true, sensors: [] });
  window.midniteStudio = {
    vanguard: {
      findings: {
        list,
        act: act_,
        setStatus,
        onChanged: (h: () => void) => {
          onFindingsChanged = h;
          return () => undefined;
        },
      },
      sensors,
      runSensor: vi.fn().mockResolvedValue({ ok: true }),
      viewOpened,
      onChanged: () => () => undefined,
    },
  } as unknown as typeof window.midniteStudio;
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
  vi.clearAllMocks();
});

describe('Vanguard view', () => {
  it('tells main it was opened', async () => {
    render(<VanguardPage />);
    await waitFor(() => expect(viewOpened).toHaveBeenCalledTimes(1));
  });

  it('groups findings by severity, most severe first', async () => {
    render(<VanguardPage />);
    const high = await screen.findByRole('region', { name: 'high findings' });
    expect(high.textContent).toContain('New LaunchAgent');
    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups.indexOf('high findings')).toBeLessThan(groups.indexOf('low findings'));
  });

  it('asks the ledger with the chosen filters', async () => {
    render(<VanguardPage />);
    await screen.findByRole('region', { name: 'high findings' });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'config' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ category: 'config', status: 'open' }));
  });

  it('shows a finding’s evidence and enables only the actions that exist today', async () => {
    render(<VanguardPage />);
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    expect(detail.textContent).toContain('/Users/x/Library/LaunchAgents/a.plist');
    expect((screen.getByRole('button', { name: 'Mute' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: 'Unload launch item' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await waitFor(() => expect(act_).toHaveBeenCalledWith({ findingId: 'f1', action: { id: 'mute' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith({ id: 'f1', status: 'acknowledged' }));
  });

  it('refetches when the ledger reports a change', async () => {
    render(<VanguardPage />);
    await screen.findByRole('region', { name: 'high findings' });
    list.mockClear();
    act(() => onFindingsChanged?.());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });

  it('says so when nothing matches', async () => {
    list.mockResolvedValue({ findings: [] });
    render(<VanguardPage />);
    expect(await screen.findByText(/No findings match/)).toBeDefined();
  });

  it('the Sensors tab lists each registered sensor, and slots no theme has registered yet', async () => {
    render(<VanguardPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sensors' }));
    const sensorList = await screen.findByRole('list', { name: 'Sensors' });
    expect(sensorList.textContent).toContain('Integrity');
    expect(sensorList.textContent).toContain('1 finding');
    // Integrity is registered, so only the others read as planned.
    expect(sensorList.textContent).toContain('Network');
    expect(sensorList.textContent?.match(/not installed yet/g)?.length).toBe(4);
  });

  it('the Network tab asks only for network findings', async () => {
    render(<VanguardPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ category: 'network', status: 'open' }));
  });
});
