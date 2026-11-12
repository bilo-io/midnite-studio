import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthDay, HealthProfile } from '@midnite/studio-shared';

import { planFromStarter, STARTERS } from '../workouts/starters';
import { renderHealth } from './test-harness';
import { TodayView } from './today-view';

// Wed 2026-11-11, midday. Only Date is faked: timers stay real so waitFor works.
const NOW = new Date(2026, 10, 11, 12, 0, 0);
const profile: HealthProfile = { version: 1, units: 'metric', sex: 'male', activity: 'sedentary', goal: 'maintain', kcalTargetOverride: 2200, updatedAt: '2026-11-01T00:00:00.000Z' };
const getProfile = vi.fn();
const getMonths = vi.fn();
const listPlans = vi.fn();
const putDay = vi.fn();
const getFoods = vi.fn();

const months = (days: Record<string, HealthDay>, quarantined = 0) => ({ ok: true, value: { months: [{ version: 1, id: 'log-2026-11', updatedAt: '2026-11-01T00:00:00.000Z', days }], quarantined } });
const meal = (kcal: number) => ({ id: 'm-aaaaaaaa', slot: 'lunch' as const, name: 'Lunch', kcal, servings: 1 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  getProfile.mockReset().mockResolvedValue({ ok: true, value: { profile } });
  getMonths.mockReset().mockResolvedValue(months({ '2026-11-10': { meals: [], sessions: [], weightKg: 80 } }));
  listPlans.mockReset().mockResolvedValue({ ok: true, value: { plans: [], quarantined: 0 } });
  putDay.mockReset().mockResolvedValue({ ok: true, value: { updatedAt: '2026-11-11T12:00:00.000Z' } });
  getFoods.mockReset().mockResolvedValue({ ok: true, value: { foods: [] } });
  window.midniteStudio = { health: { getProfile, getMonths, listPlans, putDay, getFoods } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

describe('TodayView', () => {
  it('shows the plan day whose weekday is today (Wednesday)', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<TodayView />);
    expect((await screen.findByTestId('training-day')).textContent).toBe('Full body, 3 days · Full body B');
    expect(screen.getByRole('button', { name: 'Log session' })).toBeTruthy();
  });

  it('says rest day when no plan day falls today', async () => {
    renderHealth(<TodayView />);
    expect(await screen.findByTestId('rest-day')).toBeTruthy();
  });

  it('reads 500 kcal left at 1700 eaten of 2200', async () => {
    getMonths.mockResolvedValue(months({ '2026-11-11': { meals: [meal(1700)], sessions: [] } }));
    renderHealth(<TodayView />);
    await waitFor(() => expect(screen.getByTestId('calories-line').textContent).toContain('500 kcal left'));
    expect(screen.getByTestId('calories-line').textContent).toContain('1700 / 2200');
  });

  it('saves a quick weigh-in into today', async () => {
    renderHealth(<TodayView />);
    const input = await screen.findByLabelText(/^Weight/);
    fireEvent.change(input, { target: { value: '81.3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(putDay).toHaveBeenCalledTimes(1));
    expect(putDay.mock.calls[0]![0]).toMatchObject({ date: '2026-11-11', day: { weightKg: 81.3 } });
  });

  it('shows the 7-day average and its change from a week ago with enough weights', async () => {
    const w = (kg: number): HealthDay => ({ weightKg: kg, meals: [], sessions: [] });
    getMonths.mockResolvedValue(months({ '2026-11-01': w(82), '2026-11-02': w(82), '2026-11-03': w(82), '2026-11-06': w(81), '2026-11-08': w(81), '2026-11-10': w(81) }));
    renderHealth(<TodayView />);
    await waitFor(() => expect(screen.getByTestId('weight-average').textContent).toContain('7-day average 81.0 kg'));
    expect(screen.getByTestId('weight-average').textContent).toContain('−1 kg from a week ago');
  });

  it('shows the first-run card on an empty bridge and routes its buttons', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: null } });
    getMonths.mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
    const onView = vi.fn();
    renderHealth(<TodayView onView={onView} />);
    expect(await screen.findByText('Start with whatever you like')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pick a starter plan' }));
    expect(onView).toHaveBeenCalledWith('workouts');
  });

  it('notes damaged files', async () => {
    getMonths.mockResolvedValue(months({ '2026-11-10': { meals: [], sessions: [], weightKg: 80 } }, 2));
    renderHealth(<TodayView />);
    expect((await screen.findByTestId('damaged-notice')).textContent).toBe('2 damaged files were set aside in your Health data folder.');
  });

  it('shows an error with Retry that re-runs the queries', async () => {
    getProfile.mockResolvedValueOnce({ ok: false, kind: 'error', message: 'x' });
    renderHealth(<TodayView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(getProfile.mock.calls.length).toBeGreaterThan(1));
  });

  it('shows skeleton cards while loading', () => {
    getProfile.mockReturnValue(new Promise(() => undefined));
    renderHealth(<TodayView />);
    expect(screen.getByTestId('today-skeleton')).toBeTruthy();
  });
});
