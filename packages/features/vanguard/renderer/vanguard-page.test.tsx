// vitest/jsdom: the view over a mock bridge — filters, grouping, detail and the Sensors tab need no real browser.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createFrameChrome, FrameChromeProvider } from '@midnite/studio-frame';
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

function renderPage(): void {
  const kit = createFrameChrome();
  render(
    <FrameChromeProvider chrome={kit.chrome}>
      <VanguardPage />
      <kit.DialogHost />
    </FrameChromeProvider>,
  );
}

let onFindingsChanged: (() => void) | null = null;
const preview = vi.fn();
const responseState = vi.fn();
const openUrl = vi.fn();
const list = vi.fn();
const act_ = vi.fn();
const setStatus = vi.fn();
const sensors = vi.fn();
const viewOpened = vi.fn();
const connections = vi.fn();

beforeEach(() => {
  useVanguardUi.setState({ tab: 'findings' });
  list.mockResolvedValue({ findings: [finding({}), finding({ id: 'f2', severity: 'low', title: 'Odd env', category: 'config' })] });
  act_.mockResolvedValue({ ok: true, value: { actionId: 'mute' } });
  setStatus.mockResolvedValue({ ok: true, value: finding({}) });
  sensors.mockResolvedValue({ active: true, sensors: [{ id: 'integrity', label: 'Integrity', description: 'hashes', state: 'idle', enabled: true, lastRunAt: Date.now() - 5000, lastDurationMs: 12, lastFindings: 1 }] });
  viewOpened.mockResolvedValue({ active: true, sensors: [] });
  connections.mockResolvedValue({ at: null, active: false, connections: [] });
  responseState.mockResolvedValue({ quarantineDir: '/q', quarantine: [], unavailable: {} });
  openUrl.mockResolvedValue({ ok: true });
  window.midniteStudio = {
    report: { openUrl },
    vanguard: {
      responseState,
      findings: {
        list,
        act: act_,
        preview,
        setStatus,
        onChanged: (h: () => void) => {
          onFindingsChanged = h;
          return () => undefined;
        },
      },
      sensors,
      runSensor: vi.fn().mockResolvedValue({ ok: true }),
      viewOpened,
      connections,
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
    renderPage();
    await waitFor(() => expect(viewOpened).toHaveBeenCalledTimes(1));
  });

  it('groups findings by severity, most severe first', async () => {
    renderPage();
    const high = await screen.findByRole('region', { name: 'high findings' });
    expect(high.textContent).toContain('New LaunchAgent');
    const groups = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(groups.indexOf('high findings')).toBeLessThan(groups.indexOf('low findings'));
  });

  it('asks the ledger with the chosen filters', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'high findings' });
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'config' } });
    await waitFor(() => expect(list).toHaveBeenLastCalledWith({ category: 'config', status: 'open' }));
  });

  it('shows a finding’s evidence; Mute acts at once, a destructive action only from its blast-radius confirm', async () => {
    preview.mockResolvedValue({
      ok: true,
      value: {
        actionId: 'bootout-launch-item',
        confirm: true,
        title: 'Unload the launch item?',
        confirmLabel: 'Unload',
        summary: 'Runs launchctl bootout gui/501 on it.',
        dies: ['com.example.helper — runs /tmp/x'],
        moves: [],
        pauses: [],
        warnings: ['The plist stays.'],
        digest: 'd1',
      },
    });
    act_.mockResolvedValue({ ok: true, value: { actionId: 'bootout-launch-item', detail: 'Unloaded com.example.helper.' } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    const detail = await screen.findByRole('region', { name: 'Finding detail' });
    expect(detail.textContent).toContain('/Users/x/Library/LaunchAgents/a.plist');
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    await waitFor(() => expect(act_).toHaveBeenCalledWith({ findingId: 'f1', action: { id: 'mute' } }));
    expect(preview).not.toHaveBeenCalled();
    act_.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Unload launch item' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unload the launch item?' });
    expect(preview).toHaveBeenCalledWith({ findingId: 'f1', action: { id: 'bootout-launch-item', domain: 'gui/501', path: '/a.plist' } });
    expect(dialog.textContent).toContain('Stops: com.example.helper — runs /tmp/x');
    expect(dialog.textContent).toContain('The plist stays.');
    expect(act_).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Unload' }));
    await waitFor(() =>
      // With the digest of the radius the dialog showed: main runs it only if its fresh plan matches.
      expect(act_).toHaveBeenCalledWith({ findingId: 'f1', action: { id: 'bootout-launch-item', domain: 'gui/501', path: '/a.plist' }, confirmed: 'd1' }),
    );
    expect(await screen.findByText('Unloaded com.example.helper.')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith({ id: 'f1', status: 'acknowledged' }));
  });

  it('a refused preview shows its reason and opens no confirm', async () => {
    preview.mockResolvedValue({ ok: false, kind: 'error', message: '/a.plist has changed since the finding (its hash differs).' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Unload launch item' }));
    expect(await screen.findByText(/has changed since the finding/)).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(act_).not.toHaveBeenCalled();
  });

  it('shows Phase 121 A’s pending action disabled with the reason, and Theme C’s revoke enabled', async () => {
    list.mockResolvedValue({
      findings: [
        finding({
          remediation: [
            { id: 'revoke-mcp-server', serverName: 'fs' },
            { id: 'open-in-agents', findingId: 'f1' },
            { id: 'mute' },
          ],
        }),
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    const revoke = (await screen.findByRole('button', { name: 'Revoke MCP server' })) as HTMLButtonElement;
    const agents = screen.getByRole('button', { name: 'Open in Agents' }) as HTMLButtonElement;
    // Theme C landed the MCP allowlist, so revoke is a real action now; open-in-agents still waits on Theme A.
    expect(revoke.disabled).toBe(false);
    expect(agents.disabled).toBe(true);
    expect(agents.title).toContain('Phase 121 Theme A');
    expect(screen.getByRole('list', { name: 'Unavailable actions' }).textContent).toContain('Available once Phase 121 lands');
  });

  it('disables an action main says this app lacks, with main’s reason', async () => {
    list.mockResolvedValue({ findings: [finding({ remediation: [{ id: 'pause-session', sessionId: 's1' }, { id: 'mute' }] })] });
    responseState.mockResolvedValue({
      quarantineDir: '/q',
      quarantine: [],
      unavailable: { 'pause-session': { reason: 'This app has no terminal sessions it can reach, so it cannot pause one.' } },
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Pause session' }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('Report issue opens the prefilled form main built, with no confirm', async () => {
    list.mockResolvedValue({ findings: [finding({ remediation: [{ id: 'report-issue', title: 'Odd host' }, { id: 'mute' }] })] });
    act_.mockResolvedValue({ ok: true, value: { actionId: 'report-issue', issueUrl: 'https://github.com/x/y/issues/new?title=Odd' } });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Report issue' }));
    await waitFor(() => expect(openUrl).toHaveBeenCalledWith({ url: 'https://github.com/x/y/issues/new?title=Odd' }));
    expect(preview).not.toHaveBeenCalled();
  });

  it('offers Restore for a quarantined finding and lists what was done on the row', async () => {
    list.mockResolvedValue({
      findings: [finding({ status: 'resolved', actions: [{ id: 'quarantine-file', at: Date.now() - 5000, ok: true }, { id: 'bootout-launch-item', at: Date.now(), ok: false, error: 'launchctl bootout failed: 5' }] })],
    });
    responseState.mockResolvedValue({
      quarantineDir: '/q',
      quarantine: [{ findingId: 'f1', findingTitle: 'New LaunchAgent', originalPath: '/tmp/x', fileName: 'x', sha256: 'a'.repeat(64), size: 10, quarantinedAt: 1, expiresAt: Date.now() + 86_400_000 * 3 }],
      unavailable: {},
    });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Status'), { target: { value: '' } });
    fireEvent.click(await screen.findByRole('button', { name: /New LaunchAgent/ }));
    expect(await screen.findByRole('button', { name: 'Restore file' })).toBeDefined();
    const done = screen.getByRole('list', { name: 'Actions taken' }).textContent ?? '';
    expect(done).toContain('Quarantine file · done');
    expect(done).toContain('Unload launch item · failed: launchctl bootout failed: 5');
  });

  it('refetches when the ledger reports a change', async () => {
    renderPage();
    await screen.findByRole('region', { name: 'high findings' });
    list.mockClear();
    act(() => onFindingsChanged?.());
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
  });

  it('says so when nothing matches', async () => {
    list.mockResolvedValue({ findings: [] });
    renderPage();
    expect(await screen.findByText(/No findings match/)).toBeDefined();
  });

  it('the Sensors tab lists each registered sensor, and slots no theme has registered yet', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Sensors' }));
    const sensorList = await screen.findByRole('list', { name: 'Sensors' });
    expect(sensorList.textContent).toContain('Integrity');
    expect(sensorList.textContent).toContain('1 finding');
    // Integrity is registered, so only the others read as planned.
    expect(sensorList.textContent).toContain('Network');
    expect(sensorList.textContent?.match(/not installed yet/g)?.length).toBe(4);
  });

  it('the Network tab asks only for network findings', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    await waitFor(() => expect(list).toHaveBeenCalledWith({ category: 'network', status: 'open' }));
  });

  it('the Network tab groups live connections by process, suite first, with the registry entry or the flag on each row', async () => {
    connections.mockResolvedValue({
      at: Date.now() - 4000,
      active: true,
      connections: [
        { pid: 100, command: 'Midnite', role: 'suite', label: 'app', protocol: 'TCP', state: 'ESTABLISHED', remoteHost: '104.16.0.1', remotePort: 443, allowedBy: 'api.pwnedpasswords.com' },
        { pid: 100, command: 'Midnite', role: 'suite', label: 'app', protocol: 'TCP', state: 'ESTABLISHED', remoteHost: '203.0.113.7', remotePort: 443, flagged: { severity: 'info', reason: 'The app connected to a host the egress registry does not list.' } },
        { pid: 202, command: 'node', role: 'agent', protocol: 'TCP', remoteHost: '140.82.112.3', remotePort: 443, sessionId: 's1', repoId: 'r1' },
        { pid: 300, command: 'ssh', role: 'other', protocol: 'TCP', remoteHost: '198.51.100.9', remotePort: 22 },
      ],
    });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    const processes = await screen.findByRole('list', { name: 'Processes' });
    const headings = [...processes.querySelectorAll(':scope > li > p')].map((p) => p.textContent ?? '');
    expect(headings[0]).toContain('Midnite (pid 100)');
    expect(headings[0]).toContain('2 connections');
    expect(headings[1]).toContain('Agent session');
    expect(headings[2]).toContain('ssh');
    expect(processes.textContent).toContain('allowed by api.pwnedpasswords.com');
    expect(processes.textContent).toContain('egress registry does not list');
    expect(processes.textContent).toContain('140.82.112.3:443');
    await waitFor(() => expect(list).toHaveBeenCalledWith({ category: 'network', status: 'open' }));
  });

  it('the Network tab says why it is empty when the sensor has not run, and shows the gate note when it is paused', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    expect(await screen.findByText(/network sensor has not run/)).toBeDefined();
    cleanup();
    connections.mockResolvedValue({ at: Date.now(), active: true, connections: [], note: 'Paused: the window is not focused and no agent session is running.' });
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));
    expect(await screen.findByText(/Paused: the window is not focused/)).toBeDefined();
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
    renderPage();
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
    expect(screen.getByRole('group', { name: 'Confirm full scan' }).textContent).toContain('often tens of minutes');
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

  it('offers Cancel scan while a scan runs, calls the cancel channel, and reports the cancelled scan calmly', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const scan = vi.fn().mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const cancel = vi.fn().mockImplementation(async () => {
      finish({ ok: true, value: { target: 'your home folder', at: 1, durationMs: 90, files: 7, detections: 2, engines: ['builtin'], errors: [], cancelled: true } });
      return { ok: true };
    });
    mountWith({ status: vi.fn().mockResolvedValue({ engines: engines(false), running: false, queued: 0, last: null }), scan, cancel });
    await open();
    expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Scan Downloads' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel scan' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Scan cancelled\. Before it stopped, your home folder: 7 files, 2 detections/)).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cancel scan' })).toBeNull();
  });
});

describe('the quarantine card on the Sensors tab', () => {
  it('lists what is held, restores through the confirm, and opens the folder', async () => {
    responseState.mockResolvedValue({
      quarantineDir: '/q',
      quarantine: [{ findingId: 'f9', findingTitle: 'Malware rule matched: x', originalPath: '~/Downloads/a.bin', fileName: 'a.bin', sha256: 'b'.repeat(64), size: 2048, quarantinedAt: 1, expiresAt: Date.now() + 86_400_000 * 10 }],
      unavailable: {},
    });
    preview.mockResolvedValue({
      ok: true,
      value: { actionId: 'restore-file', confirm: true, title: 'Restore the file?', confirmLabel: 'Restore', summary: 'Re-scans it first.', dies: [], moves: ['quarantine to ~/Downloads/a.bin (2.0 KB)'], pauses: [], warnings: [] },
    });
    const openQuarantine = vi.fn().mockResolvedValue({ ok: true });
    const current = window.midniteStudio as unknown as { vanguard: Record<string, unknown> };
    window.midniteStudio = { ...current, vanguard: { ...current.vanguard, openQuarantine } } as unknown as typeof window.midniteStudio;
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: 'Sensors' }));
    const card = await screen.findByRole('region', { name: 'Quarantine' });
    await waitFor(() => expect(card.textContent).toContain('~/Downloads/a.bin'));
    expect(card.textContent).toContain('deleted in 10 days');
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore the file?' });
    expect(dialog.textContent).toContain('Moves: quarantine to ~/Downloads/a.bin (2.0 KB)');
    expect(preview).toHaveBeenCalledWith({ findingId: 'f9', action: { id: 'restore-file', findingId: 'f9', path: '~/Downloads/a.bin' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' }).at(-1)!);
    await waitFor(() => expect(act_).toHaveBeenCalledWith({ findingId: 'f9', action: { id: 'restore-file', findingId: 'f9', path: '~/Downloads/a.bin' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Open quarantine folder' }));
    await waitFor(() => expect(openQuarantine).toHaveBeenCalledTimes(1));
  });
});
