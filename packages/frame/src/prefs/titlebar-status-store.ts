import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  DEFAULT_WORLD_CLOCK_ZONES as SHARED_WORLD_CLOCK_ZONES,
  type TitlebarStatusPrefs,
} from '@midnite/studio-shared';

import { registerSuitePrefsStore, suitePrefsStorage } from './suite-prefs-storage';

// Structural, from the suite-prefs contract — the app's `titlebar-status-types.ts` re-declares the same shapes.
export type ClockMode = TitlebarStatusPrefs['clockMode'];
export type WeatherUnits = TitlebarStatusPrefs['weatherUnits'];
export type WeatherLocation = NonNullable<TitlebarStatusPrefs['weatherLocation']>;
export type WorldClockZone = TitlebarStatusPrefs['worldClockZones'][number];

export type StatusPillItem = 'date' | 'time' | 'weather';

export type TitlebarStatusState = {
  // Pill display toggles
  showDate: boolean;
  showTime: boolean;
  showWeather: boolean;

  // Weather config
  weatherUnits: WeatherUnits;
  weatherLocation: WeatherLocation | null;

  // Clock config
  clockMode: ClockMode;
  showSeconds: boolean;

  // World clocks
  worldClocksMode: ClockMode;
  worldClockZones: WorldClockZone[];

  // Panel active tab or layout preference
  visibleSections: {
    calendar: boolean;
    weather: boolean;
    worldClocks: boolean;
    time: boolean;
  };

  // Actions
  setShowDate: (show: boolean) => void;
  setShowTime: (show: boolean) => void;
  setShowWeather: (show: boolean) => void;
  setWeatherUnits: (units: WeatherUnits) => void;
  setWeatherLocation: (loc: WeatherLocation | null) => void;
  setClockMode: (mode: ClockMode) => void;
  setShowSeconds: (show: boolean) => void;
  setWorldClocksMode: (mode: ClockMode) => void;
  setWorldClockZones: (zones: WorldClockZone[]) => void;
  addWorldClockZone: (zone: WorldClockZone) => void;
  removeWorldClockZone: (index: number) => void;
  toggleSectionVisibility: (section: 'calendar' | 'weather' | 'worldClocks' | 'time') => void;
};

export const DEFAULT_WORLD_CLOCK_ZONES: WorldClockZone[] = SHARED_WORLD_CLOCK_ZONES.map((zone) => ({
  ...zone,
}));

export const useTitlebarStatusStore = create<TitlebarStatusState>()(
  persist(
    (set) => ({
      showDate: true,
      showTime: true,
      showWeather: true,

      weatherUnits: 'c',
      weatherLocation: null,

      clockMode: 'digital',
      showSeconds: false,

      worldClocksMode: 'digital',
      worldClockZones: DEFAULT_WORLD_CLOCK_ZONES,

      visibleSections: {
        calendar: true,
        weather: true,
        worldClocks: true,
        time: true,
      },

      setShowDate: (showDate) => set({ showDate }),
      setShowTime: (showTime) => set({ showTime }),
      setShowWeather: (showWeather) => set({ showWeather }),
      setWeatherUnits: (weatherUnits) => set({ weatherUnits }),
      setWeatherLocation: (weatherLocation) => set({ weatherLocation }),
      setClockMode: (clockMode) => set({ clockMode }),
      setShowSeconds: (showSeconds) => set({ showSeconds }),
      setWorldClocksMode: (worldClocksMode) => set({ worldClocksMode }),
      setWorldClockZones: (worldClockZones) => set({ worldClockZones }),
      addWorldClockZone: (zone) => set((s) => ({ worldClockZones: [...s.worldClockZones, zone] })),
      removeWorldClockZone: (index) =>
        set((s) => ({
          worldClockZones: s.worldClockZones.filter((_, i) => i !== index),
        })),
      toggleSectionVisibility: (section) =>
        set((s) => ({
          visibleSections: {
            ...s.visibleSections,
            [section]: !s.visibleSections[section],
          },
        })),
    }),
    {
      name: 'midnite.titlebar-status',
      version: 1,
      // Phase 123 L.2: the suite-prefs file's `titlebarStatus` group, localStorage as the fallback.
      storage: suitePrefsStorage('titlebarStatus', 1),
      partialize: (s): TitlebarStatusPrefs => ({
        showDate: s.showDate,
        showTime: s.showTime,
        showWeather: s.showWeather,
        weatherUnits: s.weatherUnits,
        weatherLocation: s.weatherLocation,
        clockMode: s.clockMode,
        showSeconds: s.showSeconds,
        worldClocksMode: s.worldClocksMode,
        worldClockZones: s.worldClockZones,
        visibleSections: s.visibleSections,
      }),
    },
  ),
);

registerSuitePrefsStore('titlebarStatus', useTitlebarStatusStore);
