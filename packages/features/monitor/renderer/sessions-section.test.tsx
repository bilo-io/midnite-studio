// vitest/jsdom: DOM text over a mock bridge.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { brokerLine, formatUptime, SessionsSection } from './sessions-section';

const row = (id: string, live: boolean, extra: object = {}) => ({
  session: { id, kind: 'agent', agentId: 'claude', title: `t-${id}`, cwd: `/work/${id}`, repoId: 'r', createdAt: 1_000, ...extra },
  scrollback: new Uint8Array(),
  live: live ? { ptyId: `p${id}`, pid: 1, cols: 80, rows: 24 } : null,
});

afterEach(() => {
  cleanup();
  delete (window as { midniteStudio?: unknown }).midniteStudio;
});

describe('formatUptime', () => {
  it('scales units', () => {
    expect(formatUptime(5_000)).toBe('5s');
    expect(formatUptime(125_000)).toBe('2m');
    expect(formatUptime(3_900_000)).toBe('1h 05m');
    expect(formatUptime(100_000_000)).toBe('1d 3h');
    expect(formatUptime(-5)).toBe('0s');
  });
});

describe('SessionsSection', () => {
  it('lists only live sessions with cwd and uptime, and the broker line', async () => {
    const list = vi.fn().mockResolvedValue({
      sessions: [row('a', true), row('b', false), { ...row('c', true), legacy: true }],
      broker: { mode: 'broker' },
    });
    window.midniteStudio = { terminal: { list } } as unknown as typeof window.midniteStudio;
    render(<SessionsSection now={() => 61_000} />);
    expect(await screen.findByText('t-a')).toBeTruthy();
    expect(screen.queryByText('t-b')).toBeNull();
    expect(screen.getByText('/work/a')).toBeTruthy();
    expect(screen.getAllByText('1m').length).toBe(2);
    expect(screen.getByText(/1 on a legacy peer/)).toBeTruthy();
  });

  it('shows the empty state without a terminal bridge', async () => {
    window.midniteStudio = {} as unknown as typeof window.midniteStudio;
    render(<SessionsSection />);
    expect(await screen.findByText('No live sessions.')).toBeTruthy();
  });

  it('names an in-process broker', () => {
    expect(brokerLine({ sessions: [], broker: { mode: 'inproc', reason: 'spawn failed' } })).toBe(
      'In-process (no broker) — spawn failed',
    );
  });
});
