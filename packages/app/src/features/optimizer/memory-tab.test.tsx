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
  owner: null,
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
  Array.from(document.querySelectorAll('tbody tr'))
    .map((row) => row.querySelectorAll('td')[1]?.textContent ?? '');

afterEach(() => {
  cleanup();
  delete (window as unknown as { midniteStudio?: unknown }).midniteStudio;
  useOptimizerStore.setState({ processes: [], memory: null, processesError: null });
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

describe('MemoryTab — a row that cannot be half-read (Phase 85 Theme B)', () => {
  it('renders — with aria-label="unknown" for a null CPU/RSS reading, and sorts it last either way', () => {
    installBridge();
    const rows = [
      proc({ pid: 5, name: 'known', cpuPercent: 3, rssBytes: 500 }),
      proc({ pid: 6, name: 'unreadable', cpuPercent: null, rssBytes: null }),
    ];
    useOptimizerStore.setState({ processes: rows, memory: null, processesError: null });
    render(<MemoryTab />);

    const unknownCells = screen.getAllByLabelText('unknown');
    expect(unknownCells).toHaveLength(2); // CPU cell + Memory cell
    unknownCells.forEach((cell) => expect(cell.textContent).toBe('—'));

    // Memory column opens descending — the null row sorts last, not first.
    expect(pidOrder()).toEqual(['5', '6']);

    fireEvent.click(screen.getByRole('button', { name: /Memory/ }));
    // Reversed to ascending — the null row still sorts last.
    expect(pidOrder()).toEqual(['5', '6']);
  });

  it("renders the process-table error in place of 'No processes reported.'", () => {
    installBridge();
    useOptimizerStore.setState({
      processes: [],
      memory: null,
      processesError: 'Could not parse the process table (679 lines, 0 rows).',
    });
    render(<MemoryTab />);

    expect(screen.getByText('Could not parse the process table (679 lines, 0 rows).')).toBeTruthy();
    expect(screen.queryByText('No processes reported.')).toBeNull();
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

describe('MemoryTab — Theme E additions (header note, Owner column, Own processes only)', () => {
  it('renders the header note explaining RSS vs Activity Monitor memory', () => {
    renderTab();
    expect(
      screen.getByText(/RSS counts shared pages, so this total reads above Activity Monitor's Memory column/),
    ).toBeTruthy();
  });

  it('renders Owner column in header and cells with attribution or dash', () => {
    installBridge();
    const rows = [
      proc({ pid: 10, name: 'alpha', owner: 'Main window' }),
      proc({ pid: 11, name: 'beta', owner: null }),
    ];
    useOptimizerStore.setState({ processes: rows, memory: null });
    render(<MemoryTab />);

    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeTruthy();
    expect(screen.getByText('Main window')).toBeTruthy();
    expect(screen.getByLabelText('none')).toBeTruthy(); // The — dash
  });

  it('filters to own processes when "Own processes only" checkbox is checked', () => {
    renderTab();
    // Initially all 3 processes are visible
    expect(pidOrder()).toEqual(['1', '2', '3']);

    const checkbox = screen.getByRole('checkbox', { name: /Own processes only/ }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    // Only pid 1 has ours: true
    expect(pidOrder()).toEqual(['1']);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(pidOrder()).toEqual(['1', '2', '3']);
  });
});

describe('MemoryTab — footer totals', () => {
  it('displays the total process count and formatted RAM total for displayed processes', () => {
    renderTab();
    // Default PROCESSES: 3 processes, RAM: 300 + 900 + 600 = 1800 B -> 2 KB
    const footer = document.querySelector('tfoot');
    expect(footer).not.toBeNull();
    const cells = footer!.querySelectorAll('td');
    expect(cells[0]?.textContent?.trim()).toBe('Total (3 processes)');
    expect(cells[1]?.textContent?.trim()).toBe('—');
    expect(cells[2]?.textContent?.trim()).toBe('—');
    expect(cells[3]?.textContent?.trim()).toBe('—');
    expect(cells[4]?.textContent?.trim()).toBe('15.0%');
    expect(cells[5]?.textContent?.trim()).toBe('2 KB');
  });

  it('updates totals when processes are filtered', () => {
    renderTab();
    const checkbox = screen.getByRole('checkbox', { name: /Own processes only/ });
    fireEvent.click(checkbox);

    // Only pid 1 (ours: true, 900 B, 1.0% CPU)
    const footer = document.querySelector('tfoot');
    expect(footer).not.toBeNull();
    const cells = footer!.querySelectorAll('td');
    expect(cells[0]?.textContent?.trim()).toBe('Total (1 process)');
    expect(cells[4]?.textContent?.trim()).toBe('1.0%');
    expect(cells[5]?.textContent?.trim()).toBe('900 B');
  });

  it('handles empty filtered results gracefully', () => {
    renderTab();
    const input = screen.getByPlaceholderText('Filter processes or PID…');
    fireEvent.change(input, { target: { value: 'nonexistent-process-query' } });

    const footer = document.querySelector('tfoot');
    expect(footer).not.toBeNull();
    const cells = footer!.querySelectorAll('td');
    expect(cells[0]?.textContent?.trim()).toBe('Total (0 processes)');
    expect(cells[4]?.textContent?.trim()).toBe('—');
    expect(cells[5]?.textContent?.trim()).toBe('0 B');
  });
});

