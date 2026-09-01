import { useState } from 'react';
import { LuCalendar, LuClock, LuCloudSun } from 'react-icons/lu';

import { useNow } from '../../lib/use-now';
import { Popover } from '../../components/popover';
import { TitlebarStatusPanel } from './components/titlebar-status-panel';
import { useTitlebarStatusStore } from './titlebar-status-store';
import { useWeather } from './use-weather';
import { describeWeatherCode, temp } from './weather-format';

export function TitleBarStatus() {
  const [open, setOpen] = useState(false);
  const now = useNow();

  const showDate = useTitlebarStatusStore((s) => s.showDate);
  const showTime = useTitlebarStatusStore((s) => s.showTime);
  const showWeather = useTitlebarStatusStore((s) => s.showWeather);
  const showSeconds = useTitlebarStatusStore((s) => s.showSeconds);
  const weatherUnits = useTitlebarStatusStore((s) => s.weatherUnits);
  const weatherLocation = useTitlebarStatusStore((s) => s.weatherLocation);

  const { data: weatherData } = useWeather(weatherLocation);

  const timeStr = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12: false,
  });

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  const weather = weatherData?.current;
  const { icon: WeatherIcon, label: weatherLabel } = describeWeatherCode(
    weather?.weatherCode ?? 0,
  );
  const temperatureStr = weather ? temp(weather.temperatureC, weatherUnits) : null;

  // If all items are hidden in config, render a minimal fallback clock icon
  const hasItems = showDate || showTime || showWeather;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="center"
      label={`Status and time dashboard: ${dateStr}, ${timeStr}${temperatureStr ? `, ${temperatureStr}` : ''}`}
      testId="titlebar-status-popover"
      panelClassName="p-0 border border-border shadow-2xl rounded-xl"
      trigger={
        <div
          data-testid="titlebar-status-pill"
          className="flex items-center gap-2 rounded-full border border-border/60 bg-muted/30 hover:bg-muted/60 px-2.5 py-0.5 text-xs text-foreground/90 transition-colors cursor-pointer select-none"
        >
          {showDate && (
            <div className="flex items-center gap-1">
              <LuCalendar className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-medium">{dateStr}</span>
            </div>
          )}

          {showDate && showTime && (
            <span aria-hidden className="h-3 w-px bg-border/80 shrink-0" />
          )}

          {showTime && (
            <div className="flex items-center gap-1">
              <LuClock className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono font-semibold tabular-nums">{timeStr}</span>
            </div>
          )}

          {(showDate || showTime) && showWeather && (
            <span aria-hidden className="h-3 w-px bg-border/80 shrink-0" />
          )}

          {showWeather && (
            <div className="flex items-center gap-1" title={weatherLabel}>
              {weather ? (
                <>
                  <WeatherIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {temperatureStr}
                  </span>
                </>
              ) : (
                <>
                  <LuCloudSun className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
                  <span className="text-[11px] text-muted-foreground">--°</span>
                </>
              )}
            </div>
          )}

          {!hasItems && (
            <div className="flex items-center gap-1 py-0.5">
              <LuClock className="h-3.5 w-3.5 text-primary shrink-0" />
            </div>
          )}
        </div>
      }
    >
      <TitlebarStatusPanel onClose={() => setOpen(false)} />
    </Popover>
  );
}
