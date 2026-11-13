import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthPlan } from '@midnite/studio-shared';

import { planFromStarter, STARTERS } from '../workouts/starters';
import { SessionSheet, historyFor } from './session-sheet';
import { renderHealth } from './test-harness';

const plan: HealthPlan = planFromStarter(STARTERS[0]!);
const day = plan.days[0]!;
const squat = day.exercises[0]!;
const getMonths = vi.fn();
const putDay = vi.fn();

const withHistory = () =>
  getMonths.mockResolvedValue({
    ok: true,
    value: {
      months: [
        {
          version: 1,
          id: 'log-2026-11',
          updatedAt: '2026-11-01T00:00:00.000Z',
          days: { '2026-11-02': { meals: [], sessions: [{ id: 'w-aaaaaaaa', planId: plan.id, planDayId: day.id, exercises: [{ exerciseId: squat.id, name: 'Squat', sets: [12, 12, 12].map((reps) => ({ reps, kg: 60 })) }] }] } },
        },
      ],
      quarantined: 0,
    },
  });

beforeEach(() => {
  getMonths.mockReset().mockResolvedValue({ ok: true, value: { months: [], quarantined: 0 } });
  putDay.mockReset().mockResolvedValue({ ok: true, value: { updatedAt: '2026-11-11T00:00:00.000Z' } });
  window.midniteStudio = { health: { getMonths, putDay } } as unknown as typeof window.midniteStudio;
});
afterEach(() => {
  cleanup();
  window.midniteStudio = undefined;
});

const open = (units: 'metric' | 'imperial' = 'metric', onClose = vi.fn()) => renderHealth(<SessionSheet plan={plan} dayId={day.id} date="2026-11-11" units={units} onClose={onClose} />);
const saveButton = async () => {
  const b = (await screen.findByRole('button', { name: 'Save session' })) as HTMLButtonElement;
  await waitFor(() => expect(b.disabled).toBe(false));
  return b;
};

describe('SessionSheet', () => {
  it('prefills from the overload rule and says where the weight came from', async () => {
    withHistory();
    open();
    await waitFor(() => expect(screen.getAllByTestId('prescription')[0]!.textContent).toBe('3 × 8–12 @ 62.5 kg · up from 60'));
    expect((screen.getByLabelText('Squat set 1 weight') as HTMLInputElement).value).toBe('62.5');
    expect((screen.getByLabelText('Squat set 1 reps') as HTMLInputElement).value).toBe('8');
  });

  it('Save appends one session through putDay', async () => {
    open();
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putDay).toHaveBeenCalledTimes(1));
    const req = putDay.mock.calls[0]![0];
    expect(req.date).toBe('2026-11-11');
    expect(req.day.sessions).toHaveLength(1);
    expect(req.day.sessions[0]).toMatchObject({ planId: plan.id, planDayId: day.id });
    expect(req.day.sessions[0].exercises[0].sets).toHaveLength(3);
  });

  it('stores an imperial 135 lb input as 61.24 kg', async () => {
    open('imperial');
    const w = await screen.findByLabelText('Squat set 1 weight');
    fireEvent.change(w, { target: { value: '135' } });
    fireEvent.click(await saveButton());
    await waitFor(() => expect(putDay).toHaveBeenCalled());
    expect(putDay.mock.calls[0]![0].day.sessions[0].exercises[0].sets[0].kg).toBe(61.24);
  });

  it('asks before discarding edits', async () => {
    const onClose = vi.fn();
    open('metric', onClose);
    fireEvent.change(await screen.findByLabelText('Squat set 1 reps'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText('Discard this session?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without a prompt when nothing changed', async () => {
    const onClose = vi.fn();
    open('metric', onClose);
    await screen.findByLabelText('Squat set 1 reps');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('historyFor', () => {
  it('flattens sessions by exercise id, oldest first', () => {
    const mk = (date: string, kg: number) => ({ days: { [date]: { sessions: [{ id: 'w-aaaaaaaa', planId: 'p', planDayId: 'd', exercises: [{ exerciseId: 'x-1', name: 'a', sets: [{ reps: 5, kg }] }, { exerciseId: 'x-2', name: 'b', sets: [{ reps: 5, kg: 1 }] }] }] } } });
    const h = historyFor('x-1', [mk('2026-11-05', 50), mk('2026-11-01', 40)] as never);
    expect(h.map((e) => e.date)).toEqual(['2026-11-01', '2026-11-05']);
  });
});
