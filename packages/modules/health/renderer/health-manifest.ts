/** Health's app manifest — pure data. `accent` matches the launcher catalog's `health` tile. */
export const HEALTH_APP = {
  id: 'health',
  name: 'Midnite Health',
  tagline: 'Body metrics, meals, workouts and trends',
  accent: '#f43f5e',
  home: 'today',
} as const;

export type HealthApp = typeof HEALTH_APP;

/** Where Health keeps its files; the bridge exposes no paths, so the card names it from here. */
export const HEALTH_DATA_HINT = '~/Library/Application Support/Midnite Runtime/apps/health/data';
