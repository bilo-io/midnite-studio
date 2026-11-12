/** Health's app manifest — pure data. `accent` matches the launcher catalog's `health` tile. */
export const HEALTH_APP = {
  id: 'health',
  name: 'Midnite Health',
  tagline: 'Body metrics, meals, workouts and trends',
  accent: '#f43f5e',
  home: 'today',
} as const;

export type HealthApp = typeof HEALTH_APP;
