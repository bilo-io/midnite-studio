import type { HealthExercise, HealthSet } from '@midnite/studio-shared';

import { kgToLb } from './units';

export type OverloadReason = 'start' | 'hold' | 'increase' | 'deload';

export type Prescription = {
  kg: number;
  repsTarget: number;
  reason: OverloadReason;
  /** The working weight the change is measured from, for "up from 60". */
  fromKg?: number;
};

export type ExerciseHistory = { date: string; sets: HealthSet[] }[];

/** The most common weight across a session's sets; a tie takes the heavier. */
function workingKg(sets: HealthSet[]): number {
  const counts = new Map<number, number>();
  for (const s of sets) counts.set(s.kg, (counts.get(s.kg) ?? 0) + 1);
  let best = sets[0]!.kg;
  let bestCount = 0;
  for (const [kg, n] of counts) {
    if (n > bestCount || (n === bestCount && kg > best)) [best, bestCount] = [kg, n];
  }
  return best;
}

/** Rounds down to the nearest 0.5 kg, never below 0 (the epsilon absorbs float noise like 107.99999). */
const floorHalf = (kg: number): number => Math.max(0, Math.floor(kg * 2 + 1e-9) / 2);

/**
 * Double progression (Decision 1): weight goes up by the increment once every set reaches the top of the rep
 * range, deloads after two sessions with a set under the floor, and otherwise holds and aims one rep higher.
 * `history` is oldest first and already filtered to this exercise.
 */
export function nextPrescription(ex: HealthExercise, history: ExerciseHistory): Prescription {
  const sessions = history.filter((h) => h.sets.length > 0);
  const last = sessions[sessions.length - 1];
  if (last === undefined) return { kg: ex.startKg, repsTarget: ex.repsMin, reason: 'start' };

  const kg = workingKg(last.sets);
  const atKg = last.sets.filter((s) => s.kg === kg);

  if (atKg.filter((s) => s.reps >= ex.repsMax).length >= ex.sets && ex.incrementKg > 0) {
    return { kg: kg + ex.incrementKg, repsTarget: ex.repsMin, reason: 'increase', fromKg: kg };
  }

  const below = (h: { sets: HealthSet[] }) => h.sets.some((s) => s.kg === kg && s.reps < ex.repsMin);
  const prev = sessions[sessions.length - 2];
  if (prev !== undefined && workingKg(prev.sets) === kg && below(prev) && below(last)) {
    return { kg: floorHalf(kg * (1 - ex.deloadPct / 100)), repsTarget: ex.repsMin, reason: 'deload', fromKg: kg };
  }

  const weakest = Math.min(...atKg.map((s) => s.reps));
  const repsTarget = Math.max(ex.repsMin, Math.min(ex.repsMax, weakest + 1));
  return { kg, repsTarget, reason: 'hold', fromKg: kg };
}

const trim = (n: number): string => String(Math.round(n * 100) / 100);

/** A kg value as the profile's units show it (one decimal for lb), as a bare number. */
export const displayWeight = (kg: number, units: 'metric' | 'imperial'): number => (units === 'imperial' ? Math.round(kgToLb(kg) * 10) / 10 : kg);

/** The prescription line: `3 × 8–12 @ 62.5 kg · up from 60`, in the profile's units. */
export function prescriptionLine(ex: HealthExercise, p: Prescription, units: 'metric' | 'imperial' = 'metric'): string {
  const unit = units === 'imperial' ? 'lb' : 'kg';
  const w = (kg: number) => trim(displayWeight(kg, units));
  const reps = p.reason === 'hold' ? `${ex.repsMin}–${ex.repsMax}, aim ${p.repsTarget}` : `${ex.repsMin}–${ex.repsMax}`;
  const head = `${ex.sets} × ${reps} @ ${w(p.kg)} ${unit}`;
  if (p.reason === 'increase') return `${head} · up from ${w(p.fromKg!)}`;
  if (p.reason === 'deload') return `${head} · deload from ${w(p.fromKg!)}`;
  if (p.reason === 'hold') return `${head} · same weight`;
  return `${head} · starting weight`;
}
