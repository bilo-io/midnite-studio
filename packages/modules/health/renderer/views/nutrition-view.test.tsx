import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthDay, HealthFood, HealthProfile } from '@midnite/studio-shared';

import { todayKey } from '../data/dates';
import { NutritionView } from './nutrition-view';
import { renderHealth } from './test-harness';

const today = todayKey();
const year = new Date().getFullYear();
// BMR 1780 x 1.2 = 2136 -> target 2140 for sedentary maintain.
const profile: HealthProfile = { version: 1, units: 'metric', sex: 'male', heightCm: 180, birthYear: year - 30, activity: 'sedentary', goal: 'maintain', kcalTargetOverride: 2200, updatedAt: '2026-11-01T00:00:00.000Z' };
const food: HealthFood = { id: 'f-aaaaaaaa', name: 'Oats', serving: '100 g', kcal: 250, proteinG: 10, carbsG: 40, fatG: 5 };
const getProfile = vi.fn();
const getMonths = vi.fn();
const putDay = vi.fn();
const getFoods = vi.fn();
const upsertFood = vi.fn();
const removeFood = vi.fn();

const log = (day: HealthDay) => ({ version: 1, id: `log-${today.slice(0, 7)}`, updatedAt: '2026-11-01T00:00:00.000Z', days: { [today]: day } });

beforeEach(() => {
  getProfile.mockReset().mockResolvedValue({ ok: true, value: { profile } });
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
  putDay.mockReset().mockImplementation(async (req: { date: string; day: HealthDay }) => {
    // Behave like main: the saved day is what the next read returns.
    getMonths.mockResolvedValue({ ok: true, value: { months: [{ ...log(req.day) }], quarantined: 0 } });
    return { ok: true, value: { updatedAt: '2026-11-11T00:00:00.000Z' } };
  });
  getFoods.mockReset().mockResolvedValue({ ok: true, value: { foods: [food] } });
  upsertFood.mockReset().mockResolvedValue({ ok: true, value: undefined });
  removeFood.mockReset().mockResolvedValue({ ok: true, value: undefined });
  window.midniteStudio = { health: { getProfile, getMonths, putDay, getFoods, upsertFood, removeFood } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

const addButton = async (slot: string) => {
  const btn = (await screen.findByRole('button', { name: `Add to ${slot}` })) as HTMLButtonElement;
  await waitFor(() => expect(btn.disabled).toBe(false));
  return btn;
};

describe('NutritionView meals', () => {
  it('stores servings-scaled kcal and shows the total against the target', async () => {
    renderHealth(<NutritionView />);
    fireEvent.click(await addButton('Breakfast'));
    fireEvent.click(await screen.findByRole('button', { name: /Oats/ }));
    const servings = screen.getByLabelText(/^Servings/);
    fireEvent.change(servings, { target: { value: '2' } });
    fireEvent.blur(servings);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(putDay).toHaveBeenCalledTimes(1));
    const meal = putDay.mock.calls[0]![0].day.meals[0];
    expect(meal).toMatchObject({ kcal: 500, servings: 2, foodId: 'f-aaaaaaaa', proteinG: 20, slot: 'breakfast' });
    await waitFor(() => expect(screen.getByTestId('day-total').textContent).toContain('500 / 2200 kcal'));
    expect(screen.getByTestId('day-total').textContent).toContain('1700 kcal left');
  });

  it('with no target it links to Biometrics', async () => {
    getProfile.mockResolvedValue({ ok: true, value: { profile: null } });
    const onView = vi.fn();
    renderHealth(<NutritionView onView={onView} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Set up your profile for a target' }));
    expect(onView).toHaveBeenCalledWith('biometrics');
  });

  it('Delete removes the row through putDay', async () => {
    getMonths.mockResolvedValue({ ok: true, value: { months: [log({ meals: [{ id: 'm-bbbbbbbb', slot: 'lunch', name: 'Rice', kcal: 300, servings: 1 }], sessions: [] })], quarantined: 0 } });
    renderHealth(<NutritionView />);
    await screen.findByText(/Rice/);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Rice' }));
    fireEvent.click(await screen.findByText('Delete'));
    await waitFor(() => expect(putDay).toHaveBeenCalled());
    expect(putDay.mock.calls[0]![0].day.meals).toEqual([]);
  });

  it('a custom entry with "Save to my foods" upserts the food once', async () => {
    renderHealth(<NutritionView />);
    fireEvent.click(await addButton('Snacks'));
    fireEvent.click(await screen.findByRole('button', { name: 'Custom entry' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Biltong' } });
    const kcal = screen.getByLabelText(/^Calories/);
    fireEvent.change(kcal, { target: { value: '180' } });
    fireEvent.blur(kcal);
    fireEvent.click(screen.getByLabelText('Save to my foods'));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(putDay).toHaveBeenCalledTimes(1));
    expect(upsertFood).toHaveBeenCalledTimes(1);
    expect(upsertFood.mock.calls[0]![0].food).toMatchObject({ name: 'Biltong', kcal: 180 });
  });
});

describe('NutritionView foods', () => {
  it('deleting a food confirms and leaves logged meals alone', async () => {
    getMonths.mockResolvedValue({ ok: true, value: { months: [log({ meals: [{ id: 'm-bbbbbbbb', slot: 'lunch', name: 'Oats', kcal: 500, servings: 2, foodId: 'f-aaaaaaaa' }], sessions: [] })], quarantined: 0 } });
    renderHealth(<NutritionView />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Foods' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Oats' }));
    const dialog = await screen.findByText("Delete 'Oats'?");
    expect(dialog).toBeTruthy();
    fireEvent.click(within(dialog.closest('[role]') as HTMLElement).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(removeFood).toHaveBeenCalledWith({ id: 'f-aaaaaaaa' }));
    expect(putDay).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Meals' }));
    await waitFor(() => expect(screen.getByTestId('day-total').textContent).toContain('500'));
  });
});
