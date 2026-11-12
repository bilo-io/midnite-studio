import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { planFromStarter, STARTERS } from '../workouts/starters';
import { renderHealth } from './test-harness';
import { WorkoutsView } from './workouts-view';

const listPlans = vi.fn();
const writePlan = vi.fn();
const removePlan = vi.fn();
const getProfile = vi.fn();
const getMonths = vi.fn();

beforeEach(() => {
  listPlans.mockReset().mockResolvedValue({ ok: true, value: { plans: [], quarantined: 0 } });
  writePlan.mockReset().mockResolvedValue({ ok: true, value: undefined });
  removePlan.mockReset().mockResolvedValue({ ok: true, value: undefined });
  getProfile.mockReset().mockResolvedValue({ ok: true, value: { profile: null } });
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
  window.midniteStudio = { health: { listPlans, writePlan, removePlan, getProfile, getMonths } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.midniteStudio = undefined;
});

describe('WorkoutsView', () => {
  it('shows an empty state and the starters', async () => {
    renderHealth(<WorkoutsView />);
    expect(await screen.findByTestId('plans-empty')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Use / })).toHaveLength(STARTERS.length);
  });

  it('Use on "Full body, 3 days" writes 3 days on weekdays 1/3/5', async () => {
    renderHealth(<WorkoutsView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use Full body, 3 days' }));
    await waitFor(() => expect(writePlan).toHaveBeenCalledTimes(1));
    const plan = writePlan.mock.calls[0]![0].plan;
    expect(plan.days.map((d: { weekday: number }) => d.weekday)).toEqual([1, 3, 5]);
  });

  it('refuses a weekday another day already uses and does not save', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<WorkoutsView />);
    fireEvent.click((await screen.findByTestId('plan-card')).querySelector('button')!);
    const select = await screen.findByLabelText('Day 2 weekday');
    fireEvent.change(select, { target: { value: '1' } });
    expect(screen.getByRole('alert').textContent).toBe('Already on Monday');
    await new Promise((r) => setTimeout(r, 750));
    expect(writePlan).not.toHaveBeenCalled();
  });

  it('saves an edit 600 ms after the last change, once', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<WorkoutsView />);
    fireEvent.click((await screen.findByTestId('plan-card')).querySelector('button')!);
    const name = await screen.findByLabelText('Plan name');
    fireEvent.change(name, { target: { value: 'Mine' } });
    fireEvent.change(name, { target: { value: 'Mine 2' } });
    expect(writePlan).not.toHaveBeenCalled();
    await waitFor(() => expect(writePlan).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(writePlan.mock.calls[0]![0].plan.name).toBe('Mine 2');
  });

  it('flushes a pending edit when the editor closes', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<WorkoutsView />);
    fireEvent.click((await screen.findByTestId('plan-card')).querySelector('button')!);
    fireEvent.change(await screen.findByLabelText('Plan name'), { target: { value: 'Quick' } });
    fireEvent.click(screen.getByRole('button', { name: '← Plans' }));
    await waitFor(() => expect(writePlan).toHaveBeenCalledTimes(1));
    expect(writePlan.mock.calls[0]![0].plan.name).toBe('Quick');
  });

  it('reorders exercises with the move buttons', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<WorkoutsView />);
    fireEvent.click((await screen.findByTestId('plan-card')).querySelector('button')!);
    const first = plan.days[0]!.exercises[0]!.name;
    fireEvent.click((await screen.findAllByRole('button', { name: `Move ${first} down` }))[0]!);
    fireEvent.click(screen.getByRole('button', { name: '← Plans' }));
    await waitFor(() => expect(writePlan).toHaveBeenCalled());
    expect(writePlan.mock.calls[0]![0].plan.days[0].exercises[1].name).toBe(first);
  });
});

describe('WorkoutsView log session', () => {
  it('logs against the edited plan, not the last saved copy', async () => {
    const plan = planFromStarter(STARTERS[0]!);
    listPlans.mockResolvedValue({ ok: true, value: { plans: [plan], quarantined: 0 } });
    renderHealth(<WorkoutsView />);
    fireEvent.click((await screen.findByTestId('plan-card')).querySelector('button')!);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Add exercise' }))[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Log session' })[0]!);
    expect(await screen.findByLabelText('New exercise set 1 reps')).toBeTruthy();
  });
});
