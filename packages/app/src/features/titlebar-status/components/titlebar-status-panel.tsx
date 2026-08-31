import { useState } from 'react';
import {
  LuCalendar,
  LuClock,
  LuCloudSun,
  LuGlobe,
  LuSettings,
  LuX,
} from 'react-icons/lu';

import { useTitlebarStatusStore } from '../titlebar-status-store';
import type { PanelView } from '../titlebar-status-types';
import { CalendarSection } from './calendar-section';
import { TimeSection } from './time-section';
import { WeatherSection } from './weather-section';
import { WorldClocksSection } from './world-clocks-section';

const TABS: { view: PanelView; label: string; icon: typeof LuClock }[] = [
  { view: 'time', label: 'Time', icon: LuClock },
  { view: 'date', label: 'Date', icon: LuCalendar },
];

function tabButtonClass(active: boolean) {
  return `flex items-center gap-1.5 rounded px-2 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'bg-accent text-accent-foreground'
      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
  }`;
}

export function TitlebarStatusPanel({ onClose }: { onClose?: () => void }) {
  const showDate = useTitlebarStatusStore((s) => s.showDate);
  const showTime = useTitlebarStatusStore((s) => s.showTime);
  const showWeather = useTitlebarStatusStore((s) => s.showWeather);
  const setShowDate = useTitlebarStatusStore((s) => s.setShowDate);
  const setShowTime = useTitlebarStatusStore((s) => s.setShowTime);
  const setShowWeather = useTitlebarStatusStore((s) => s.setShowWeather);

  const visibleSections = useTitlebarStatusStore((s) => s.visibleSections);
  const toggleSectionVisibility = useTitlebarStatusStore((s) => s.toggleSectionVisibility);

  const [configuring, setConfiguring] = useState(false);
  const [activeView, setActiveView] = useState<PanelView>('time');

  return (
    <div className="flex flex-col w-[360px] sm:w-[420px] max-h-[85vh] p-3 overflow-y-auto" data-testid="titlebar-status-panel">
      {/* Header: tabs, settings, close — all on one line */}
      <div className="flex shrink-0 items-center justify-between border-b border-border pb-2.5 mb-3">
        <div className="flex items-center gap-1" role="tablist" aria-label="Status panel view">
          {TABS.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={activeView === view}
              data-testid={`titlebar-status-tab-${view}`}
              onClick={() => setActiveView(view)}
              className={tabButtonClass(activeView === view)}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setConfiguring(!configuring)}
            title="Configure status bar display & sections"
            className={`rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${
              configuring ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <LuSettings className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <LuX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Configuration drawer, scoped to the active tab */}
      {configuring && (
        <div
          data-testid="titlebar-status-config-drawer"
          className="mb-3 flex flex-col gap-2.5 rounded-lg border border-border/70 bg-card/70 p-3 text-xs"
        >
          {activeView === 'time' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-foreground">Titlebar Pill Items:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTime}
                    onChange={(e) => setShowTime(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>Time</span>
                </label>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
                <span className="font-semibold text-foreground">Visible Sections:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleSections.time}
                      onChange={() => toggleSectionVisibility('time')}
                      className="accent-primary"
                    />
                    <LuClock className="h-3 w-3 text-muted-foreground" />
                    <span>Current Time</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleSections.worldClocks}
                      onChange={() => toggleSectionVisibility('worldClocks')}
                      className="accent-primary"
                    />
                    <LuGlobe className="h-3 w-3 text-muted-foreground" />
                    <span>World Clocks</span>
                  </label>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="font-semibold text-foreground">Titlebar Pill Items:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showDate}
                      onChange={(e) => setShowDate(e.target.checked)}
                      className="accent-primary"
                    />
                    <span>Date</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showWeather}
                      onChange={(e) => setShowWeather(e.target.checked)}
                      className="accent-primary"
                    />
                    <span>Weather</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2">
                <span className="font-semibold text-foreground">Visible Sections:</span>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleSections.calendar}
                      onChange={() => toggleSectionVisibility('calendar')}
                      className="accent-primary"
                    />
                    <LuCalendar className="h-3 w-3 text-muted-foreground" />
                    <span>Calendar</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleSections.weather}
                      onChange={() => toggleSectionVisibility('weather')}
                      className="accent-primary"
                    />
                    <LuCloudSun className="h-3 w-3 text-muted-foreground" />
                    <span>Weather Details</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active tab's sections */}
      <div className="flex flex-col gap-3">
        {activeView === 'time' ? (
          <>
            {visibleSections.time && <TimeSection />}
            {visibleSections.worldClocks && <WorldClocksSection />}
          </>
        ) : (
          <>
            {visibleSections.calendar && <CalendarSection />}
            {visibleSections.weather && <WeatherSection />}
          </>
        )}
      </div>
    </div>
  );
}
