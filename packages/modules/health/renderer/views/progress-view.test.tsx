import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthDay } from '@midnite/studio-shared';

import { createHealthUiStore } from '../health-ui-store';
import { renderHealth } from './test-harness';
import { ProgressView } from './progress-view';

const NOW = new Date(2026, 10, 11, 12, 0, 0);
const getProfile = vi.fn();
const getMonths = vi.fn();

const series = (): Record<string, HealthDay> =>
  Object.fromEntries(Array.from({ length: 10 }, (_, i): [string, HealthDay] => [`2026-11-${String(i + 1).padStart(2, '0')}`, { weightKg: 80 - i * 0.1, meals: [{ id: 'm-aaaaaaaa', slot: 'lunch', name: 'x', kcal: 2000, servings: 1 }], sessions: [] }]));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  localStorage.clear();
  getProfile.mockReset().mockResolvedValue({ ok: true, value: { profile: null } });
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
  window.midniteStudio = { health: { getProfile, getMonths } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

describe('ProgressView', () => {
  it('shows "Nothing to plot yet" in all four charts when the range is empty', async () => {
    renderHealth(<ProgressView />);
    await waitFor(() => expect(screen.getAllByTestId('chart-empty')).toHaveLength(4));
  });

  it('switching to 1 year asks for a 13-month span', async () => {
    renderHealth(<ProgressView />);
    await screen.findAllByTestId('chart-empty');
    fireEvent.click(screen.getByRole('tab', { name: '1 year' }));
    await waitFor(() => expect(getMonths).toHaveBeenCalledWith({ from: '2025-11', to: '2026-11' }));
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }));
  });

  it('puts the weekly rate in the weight header', async () => {
    getMonths.mockResolvedValue({ ok: true, value: { months: [{ version: 1, id: 'log-2026-11', updatedAt: '2026-11-01T00:00:00.000Z', days: series() }], quarantined: 0 } });
    renderHealth(<ProgressView />);
    await waitFor(() => expect(screen.getByText('−0.7 kg/week')).toBeTruthy());
    expect(screen.getByTestId('report-card').textContent).toContain('This week');
  });
});

describe('ProgressView imperial', () => {
  it('converts the weekly rate once (-0.7 kg is about -1.5 lb a week)', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: { version: 1, units: 'imperial', sex: 'male', activity: 'sedentary', goal: 'maintain', updatedAt: '2026-11-01T00:00:00.000Z' } } });
    getMonths.mockResolvedValue({ ok: true, value: { months: [{ version: 1, id: 'log-2026-11', updatedAt: '2026-11-01T00:00:00.000Z', days: series() }], quarantined: 0 } });
    renderHealth(<ProgressView />);
    await waitFor(() => expect(screen.getByText(/lb\/week/).textContent).toMatch(/^−1\.[45] lb\/week$/));
  });
});

describe('the persisted range', () => {
  it('reads a mismatched version as the defaults', () => {
    const storage = window.localStorage;
    storage.setItem('midnite-health.ui', JSON.stringify({ state: { v: 2, range: '1y' }, version: 0 }));
    expect(createHealthUiStore(storage).getState().range).toBe('90d');
  });
  it('remembers a chosen range', () => {
    const store = createHealthUiStore(window.localStorage);
    store.getState().setRange('30d');
    expect(createHealthUiStore(window.localStorage).getState().range).toBe('30d');
  });
});
