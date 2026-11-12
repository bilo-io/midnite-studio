import type { HealthProfile } from '@midnite/studio-shared';

export const kgToLb = (kg: number): number => kg * 2.20462;
export const lbToKg = (lb: number): number => lb / 2.20462;

const roundHalf = (n: number): number => Math.round(n * 2) / 2;

/** Centimetres as feet and inches, inches rounded to 0.5 (a 12 carries into the feet). */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const total = roundHalf(cm / 2.54);
  const ft = Math.floor(total / 12);
  return { ft, in: total - ft * 12 };
}

export const ftInToCm = (ft: number, inches: number): number => (ft * 12 + inches) * 2.54;

const one = (n: number): string => n.toFixed(1);

/** A weight for display in the profile's units, one decimal: `81.3 kg` or `179.2 lb`. */
export function formatWeight(kg: number, units: HealthProfile['units']): string {
  return units === 'imperial' ? `${one(kgToLb(kg))} lb` : `${one(kg)} kg`;
}

export function formatHeight(cm: number, units: HealthProfile['units']): string {
  if (units === 'metric') return `${Math.round(cm)} cm`;
  const { ft, in: inches } = cmToFtIn(cm);
  return `${ft} ft ${inches} in`;
}
