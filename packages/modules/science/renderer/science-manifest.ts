/** Science's app manifest — pure data. `accent` matches the launcher catalog's `science` tile. */
export const SCIENCE_APP = {
  id: 'science',
  name: 'Midnite Science',
  tagline: 'Notebooks for maths, physics, chemistry and biology',
  accent: '#06b6d4',
  home: 'notebooks',
} as const;

export type ScienceApp = typeof SCIENCE_APP;
