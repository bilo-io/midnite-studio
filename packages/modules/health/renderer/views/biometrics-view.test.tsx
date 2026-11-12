import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthDay, HealthProfile } from '@midnite/studio-shared';

import { todayKey } from '../data/dates';
import { BiometricsView } from './biometrics-view';
import { renderHealth } from './test-harness';

const profile: HealthProfile = { version: 1, units: 'metric', sex: 'male', heightCm: 180, activity: 'sedentary', goal: 'maintain', updatedAt: '2026-11-01T00:00:00.000Z' };
const getProfile = vi.fn();
const putProfile = vi.fn();
const getMonths = vi.fn();
const putDay = vi.fn();
const today = todayKey();
const existing: HealthDay = { meals: [{ id: 'm-aaaaaaaa', slot: 'lunch', name: 'Rice', kcal: 300, servings: 1 }], sessions: [] };

const monthLog = (days: Record<string, HealthDay>) => ({ version: 1, id: `log-${today.slice(0, 7)}`, updatedAt: '2026-11-01T00:00:00.000Z', days });

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue({ ok: true, value: { profile } });
  putProfile.mockReset().mockResolvedValue({ ok: true, value: undefined });
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [monthLog({ [today]: existing })], quarantined: 0 } });
  putDay.mockReset().mockResolvedValue({ ok: true, value: { updatedAt: '2026-11-11T00:00:00.000Z' } });
  window.midniteStudio = { health: { getProfile, putProfile, getMonths, putDay } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

describe('BiometricsView profile', () => {
  it('switching to Imperial re-renders 180 cm as 5 ft 11 in', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: { ...profile, units: 'imperial' } } });
    renderHealth(<BiometricsView />);
    await waitFor(() => expect((screen.getByLabelText(/^Height/) as HTMLInputElement).value).toBe('5'));
    expect((screen.getByLabelText(/^Inches/) as HTMLInputElement).value).toBe('11');
  });

  it('flipping the units segment saves the profile only once, with the new units', async () => {
    renderHealth(<BiometricsView />);
    await screen.findByDisplayValue('180');
    fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }));
    await waitFor(() => expect(putProfile).toHaveBeenCalledTimes(1));
    expect(putProfile.mock.calls[0]![0].profile.units).toBe('imperial');
  });

  it('a height of 300 shows the range and sends nothing', async () => {
    renderHealth(<BiometricsView />);
    const input = await screen.findByDisplayValue('180');
    fireEvent.change(input, { target: { value: '300' } });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Between 50 and 272');
    expect(putProfile).not.toHaveBeenCalled();
  });

  it('renders the target once weight, height and birth year are known', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: { ...profile, birthYear: new Date().getFullYear() - 30, activity: 'moderate' } } });
    getMonths.mockResolvedValue({ ok: true, value: { months: [monthLog({ [today]: { ...existing, weightKg: 80 } })], quarantined: 0 } });
    renderHealth(<BiometricsView />);
    await waitFor(() => expect(screen.getByTestId('target').textContent).toContain('2760 kcal'));
    expect(screen.getByTestId('derived').textContent).toContain('Not medical advice');
  });

  it('names what is missing when there is no weight', async () => {
    renderHealth(<BiometricsView />);
    await waitFor(() => expect(screen.getByTestId('target-missing').textContent).toContain('weight'));
  });
});

describe('BiometricsView measurements', () => {
  it('saves a weight with the day\'s meals intact', async () => {
    renderHealth(<BiometricsView />);
    const weight = await screen.findByLabelText(/^Weight/);
    await waitFor(() => expect((weight.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
    fireEvent.change(weight, { target: { value: '81.3' } });
    fireEvent.blur(weight);
    await waitFor(() => expect(putDay).toHaveBeenCalledTimes(1));
    const req = putDay.mock.calls[0]![0];
    expect(req.date).toBe(today);
    expect(req.day.weightKg).toBe(81.3);
    expect(req.day.meals).toEqual(existing.meals);
  });

  it('converts imperial input back to kilograms', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: { ...profile, units: 'imperial' } } });
    renderHealth(<BiometricsView />);
    const weight = await screen.findByLabelText(/^Weight/);
    await waitFor(() => expect((weight.closest('fieldset') as HTMLFieldSetElement).disabled).toBe(false));
    fireEvent.change(weight, { target: { value: '180' } });
    fireEvent.blur(weight);
    await waitFor(() => expect(putDay).toHaveBeenCalled());
    expect(putDay.mock.calls[0]![0].day.weightKg).toBeCloseTo(81.65, 2);
  });

  it('disables the next-day button on today', async () => {
    renderHealth(<BiometricsView />);
    await screen.findByLabelText(/^Weight/);
    expect((screen.getByRole('button', { name: /Next day/ }) as HTMLButtonElement).disabled || screen.getByRole('button', { name: /Next day/ }).getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('shows the empty state with no measurements', async () => {
    getMonths.mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
    renderHealth(<BiometricsView />);
    expect((await screen.findByTestId('measurements-empty')).textContent).toContain('Weigh in to start your trend');
  });

  it('lists logged days and selects one on click', async () => {
    const earlier = '2026-01-05';
    getMonths.mockImplementation(async (req: { from: string }) => ({
      ok: true,
      value: { months: req.from === earlier.slice(0, 7) ? [{ ...monthLog({}), id: 'log-2026-01', days: { [earlier]: { weightKg: 90, meals: [], sessions: [] } } }] : [monthLog({ [earlier]: { weightKg: 90, meals: [], sessions: [] } })], quarantined: 0 },
    }));
    renderHealth(<BiometricsView />);
    const row = await screen.findByText('90.0 kg');
    fireEvent.click(row.closest('tr')!);
    await waitFor(() => expect(screen.getByTestId('date-row').textContent).toContain(earlier));
  });
});
