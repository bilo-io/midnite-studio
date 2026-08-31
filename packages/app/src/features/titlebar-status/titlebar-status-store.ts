import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type {
  ClockMode,
  WeatherLocation,
  WeatherUnits,
  WorldClockZone,
} from './titlebar-status-types';

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

export const DEFAULT_WORLD_CLOCK_ZONES: WorldClockZone[] = [
  { label: 'London', tz: 'Europe/London' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'San Francisco', tz: 'America/Los_Angeles' },
];

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
      addWorldClockZone: (zone) =>
        set((s) => ({ worldClockZones: [...s.worldClockZones, zone] })),
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
    },
  ),
);
