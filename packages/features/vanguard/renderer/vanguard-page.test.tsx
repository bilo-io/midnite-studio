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

describe('the malware scan card on the Sensors tab', () => {
  const engines = (yara: boolean) => [
    { id: 'yara', label: 'YARA', installed: yara },
    { id: 'clamscan', label: 'ClamAV', installed: false },
    { id: 'builtin', label: 'Built-in matcher', installed: true },
  ];
  const mountWith = (malware: unknown, repos?: unknown): void => {
    const current = window.midniteStudio as unknown as { vanguard: Record<string, unknown> };
    window.midniteStudio = { ...current, vanguard: { ...current.vanguard, malware }, ...(repos ? { repos } : {}) } as unknown as typeof window.midniteStudio;
  };
  const open = async (): Promise<void> => {
    render(<VanguardPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Sensors' }));
    await screen.findByLabelText('Malware scan');
  };

  it('explains "no engine installed" as a calm state naming the built-in matcher, with no error', async () => {
    mountWith({ status: vi.fn().mockResolvedValue({ engines: engines(false), running: false, queued: 0, last: null }), scan: vi.fn() });
    await open();
    expect(screen.getByRole('status').textContent).toContain('No scan engine is installed, which is fine');
    expect(screen.getByRole('status').textContent).toContain('never fetches anything itself');
    expect(screen.getByLabelText('Scan engines').textContent).toContain('Built-in matcher: active');
    expect(screen.getByText('No scan has run yet.')).toBeDefined();
  });

  it('drops the no-engine note once yara is installed', async () => {
    mountWith({ status: vi.fn().mockResolvedValue({ engines: engines(true), running: false, queued: 0, last: null }), scan: vi.fn() });
    await open();
    expect(screen.queryByText(/No scan engine is installed/)).toBeNull();
    expect(screen.getByLabelText('Scan engines').textContent).toContain('YARA: installed');
  });

  it('scans Downloads and shows the result; a full scan asks first, with its estimate', async () => {
    const scan = vi.fn().mockResolvedValue({ ok: true, value: { target: 'Downloads', at: 1, durationMs: 40, files: 3, detections: 1, engines: ['builtin'], errors: [] } });
    mountWith({ status: vi.fn().mockResolvedValue({ engines: engines(false), running: false, queued: 2, last: null }), scan });
    await open();
    expect(screen.getByText(/2 files waiting for the sensor/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Scan Downloads' }));
    await waitFor(() => expect(scan).toHaveBeenCalledWith({ target: 'downloads' }));
    expect(await screen.findByText(/Downloads: 3 files, 1 detection, 40 ms/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Full scan…' }));
    expect(screen.getByRole('group', { name: 'Confirm full scan' }).textContent).toContain('20 to 60 minutes');
    expect(scan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Start full scan' }));
    await waitFor(() => expect(scan).toHaveBeenLastCalledWith({ target: 'full' }));
  });

  it('offers repo and folder scans only when the bridge has a repo registry and picker', async () => {
    const scan = vi.fn().mockResolvedValue({ ok: false, kind: 'error', message: 'That repo is not open.' });
    mountWith(
      { status: vi.fn().mockResolvedValue({ engines: engines(false), running: false, queued: 0, last: null }), scan },
      { list: vi.fn().mockResolvedValue([{ id: 'r1', name: 'midnite' }]), pickDirectory: vi.fn().mockResolvedValue('/work/dir') },
    );
    await open();
    fireEvent.focus(screen.getByLabelText('Repo to scan'));
    await screen.findByRole('option', { name: 'midnite' });
    fireEvent.change(screen.getByLabelText('Repo to scan'), { target: { value: 'r1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Scan repo' }));
    await waitFor(() => expect(scan).toHaveBeenCalledWith({ target: 'repo', repoId: 'r1' }));
    expect(await screen.findByText('That repo is not open.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Scan a folder…' }));
    await waitFor(() => expect(scan).toHaveBeenCalledWith({ target: 'folder', path: '/work/dir' }));
  });

  it('shows no folder or repo controls without a repo registry', async () => {
    mountWith({ status: vi.fn().mockResolvedValue({ engines: engines(false), running: false, queued: 0, last: null }), scan: vi.fn() });
    await open();
    expect(screen.queryByRole('button', { name: 'Scan a folder…' })).toBeNull();
    expect(screen.queryByLabelText('Repo to scan')).toBeNull();
  });
});
