import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { WeatherLocation, WeatherUnit } from './weather-types';

export type WeatherState = {
  /**
   * Unset by default, and the widget renders nothing until it is set — the
   * phase's own rule: an unset widget must be invisible, not an error.
   */
  location: WeatherLocation | null;
  unit: WeatherUnit;

  setLocation: (location: WeatherLocation | null) => void;
  setUnit: (unit: WeatherUnit) => void;
};

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({
      location: null,
      unit: 'celsius',

      setLocation: (location) => set({ location }),
      setUnit: (unit) => set({ unit }),
    }),
    { name: 'midnite.weather', version: 1 },
  ),
);
