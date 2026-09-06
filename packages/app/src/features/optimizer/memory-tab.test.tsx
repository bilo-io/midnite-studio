import type { MidniteStudioBridge, ProcessInfo } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOptimizerStore } from '../../store/optimizer-store';
import { MemoryTab } from './memory-tab';

/**
 * The process table's sorting and its Terminate button (adhoc: optimizer
 * polish).
 *
 * Sorting is asserted through the rendered row order rather than through
 * `compareProcesses`, because the part that can actually break is the wiring
 * — a header that flips the wrong column, or a second click that re-sorts
 * instead of reversing.
 */

const proc = (over: Partial<ProcessInfo>): ProcessInfo => ({
  pid: 100,
  ppid: 1,
  name: 'node',
  argv: 'node index.js',
  rssBytes: 1_000,
  cpuPercent: 1,
  ours: false,
  ...over,
});

const PROCESSES: ProcessInfo[] = [
  proc({ pid: 3, name: 'beta', rssBytes: 300, cpuPercent: 9, ours: false }),
  proc({ pid: 1, name: 'alpha', rssBytes: 900, cpuPercent: 1, ours: true }),
  proc({ pid: 2, name: 'gamma', rssBytes: 600, cpuPercent: 5, ours: false }),
];

function installBridge() {
  (window as unknown as { midniteStudio: Partial<MidniteStudioBridge> }).midniteStudio = {
    optimizer: {
      processes: vi.fn().mockResolvedValue({
        ok: true,
        value: { processes: PROCESSES, memory: null },
      }),
      kill: vi.fn(),
    },
    metrics: { onSample: vi.fn(() => () => {}), start: vi.fn(), stop: vi.fn() },
  } as unknown as Partial<MidniteStudioBridge>;
}

function renderTab() {
  installBridge();
  useOptimizerStore.setState({ processes: PROCESSES, memory: null });
  render(<MemoryTab />);
}

/** The PID column, top to bottom — the cheapest stable read of row order. */
const pidOrder = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelectorAll('td')[1]?.textContent ?? '');

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useOptimizerStore.setState({ processes: [], memory: null });
});

describe('MemoryTab — sorting', () => {
  it('opens on memory, largest first', () => {
    renderTab();
    expect(pidOrder()).toEqual(['1', '2', '3']);
  });

  it('clicking Memory reverses it rather than re-sorting', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Memory/ }));
    expect(pidOrder()).toEqual(['3', '2', '1']);
  });

  it('sorts by CPU in both directions', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(pidOrder()).toEqual(['3', '2', '1']);

    fireEvent.click(screen.getByRole('button', { name: /CPU/ }));
    expect(pidOrder()).toEqual(['1', '2', '3']);
  });

  it('sorts by type, putting the terminable Agent rows first', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: /Type/ }));
    // pid 1 is the only `ours` row.
    expect(pidOrder()[0]).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: /Type/ }));
    expect(pidOrder().at(-1)).toBe('1');
  });

  it('reports the active column and direction to assistive tech', () => {
    renderTab();
    const memoryHeader = screen.getByRole('columnheader', { name: /Memory/ });
    expect(memoryHeader.getAttribute('aria-sort')).toBe('descending');
    expect(screen.getByRole('columnheader', { name: /CPU/ }).getAttribute('aria-sort')).toBe('none');

    fireEvent.click(screen.getByRole('button', { name: /Memory/ }));
    expect(memoryHeader.getAttribute('aria-sort')).toBe('ascending');
  });

  it('breaks ties on pid so a poll cannot swap two idle rows', () => {
    installBridge();
    const tied = [
      proc({ pid: 9, name: 'z', cpuPercent: 0, rssBytes: 10 }),
      proc({ pid: 4, name: 'a', cpuPercent: 0, rssBytes: 10 }),
    ];
    useOptimizerStore.setState({ processes: tied, memory: null });
    render(<MemoryTab />);

    expect(pidOrder()).toEqual(['4', '9']);
  });
});

describe('MemoryTab — the Terminate button', () => {
  it('only an "ours" row gets one; everything else reads as protected', () => {
    renderTab();
    expect(screen.getAllByRole('button', { name: 'Terminate' })).toHaveLength(1);
    expect(screen.getAllByText('Protected')).toHaveLength(2);
  });

  it('carries the glow class and a trash icon that is hidden until hover', () => {
    renderTab();
    const terminate = screen.getByRole('button', { name: 'Terminate' });

    expect(terminate.className).toContain('optimizer-terminate');
    const icon = terminate.querySelector('span');
    // Resting width zero and transparent; the hover variants widen it.
    expect(icon?.className).toContain('w-0');
    expect(icon?.className).toContain('opacity-0');
    expect(icon?.className).toContain('group-hover/term:w-3');
    expect(icon?.querySelector('svg')).toBeTruthy();
  });

  it('asks before it signals anything', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Terminate' }));
    expect(screen.getByText(/Send SIGTERM to stop alpha/)).toBeTruthy();
  });
});
