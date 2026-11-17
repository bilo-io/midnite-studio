// vitest/jsdom: the Send-to-Runway dialog, link status and Stale pill, over a mock bridge.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlanLine } from '@midnite/studio-shared';

import { isStale, nextMonth, oldestSync } from './runway-link';
import { SendToRunway } from './send-to-runway';
import { fleetNode, fleetProjection, u } from './test-fixtures';
import { renderWithChrome } from './test-harness';

const projection = fleetProjection({ updatedAt: '2026-11-18T10:00:00.000Z' }, 1);
const line = (syncedAt: string): PlanLine => ({
  id: u(500), kind: 'cost', name: 'x', category: 'other', minor: 1, cadence: 'monthly', start: '2026-12', growthBpPerMonth: 0,
  source: { kind: 'fleetProjection', projectionId: projection.id, part: 'opex', syncedAt },
});

afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('link helpers', () => {
  it('finds the oldest sync and compares against updatedAt', () => {
    const lines = [line('2026-11-18T09:00:00.000Z'), line('2026-11-18T11:00:00.000Z')];
    expect(oldestSync(lines)).toBe('2026-11-18T09:00:00.000Z');
    expect(isStale(projection, lines)).toBe(true);
    expect(isStale(projection, [line('2026-11-18T10:00:00.000Z')])).toBe(false);
    expect(isStale(projection, [])).toBe(false);
  });
  it('next month rolls the year', () => {
    expect(nextMonth(new Date('2026-12-15T00:00:00Z'))).toBe('2027-01');
  });
});

describe('SendToRunway', () => {
  const p = { ...projection, nodes: [fleetNode(1)] };
  it('previews the lines and sends with the chosen start', async () => {
    const send = vi.fn(async () => ({ ok: true, value: {} }));
    window.midniteStudio = { startup: { sendFleetProjectionToRunway: send, onChanged: () => () => undefined } } as unknown as typeof window.midniteStudio;
    renderWithChrome(<SendToRunway projection={p} lines={[]} hasCompany readOnly={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Send to Runway/ }));
    expect(screen.getByRole('list', { name: 'Lines to write' }).textContent).toContain('hardware');
    fireEvent.change(screen.getByLabelText('Start month'), { target: { value: '2027-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send lines' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ projectionId: p.id, start: '2027-02' }));
  });
  it('reads Update Runway with a status once linked, and Stale when the projection moved on', () => {
    const { rerender } = renderWithChrome(<SendToRunway projection={p} lines={[line('2026-11-18T10:00:00.000Z')]} hasCompany readOnly={false} />);
    expect(screen.getByRole('button', { name: /Update Runway/ })).toBeTruthy();
    expect(screen.getByText(/Linked to Runway · synced 2026-11-18/)).toBeTruthy();
    expect(screen.queryByText('Stale')).toBeNull();
    cleanup();
    renderWithChrome(<SendToRunway projection={p} lines={[line('2026-11-17T10:00:00.000Z')]} hasCompany readOnly={false} />);
    expect(screen.getByText('Stale')).toBeTruthy();
    void rerender;
  });
  it('is disabled with a reason when there is no company', () => {
    renderWithChrome(<SendToRunway projection={p} lines={[]} hasCompany={false} readOnly={false} />);
    const button = screen.getByRole('button', { name: /Send to Runway/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.title).toBe('Set up your company first');
  });
});
