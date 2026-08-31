import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TitleBarStatus } from './titlebar-status';
import { TitlebarStatusPanel } from './components/titlebar-status-panel';
import { CalendarSection } from './components/calendar-section';
import { TimeSection } from './components/time-section';
import { WeatherSection } from './components/weather-section';
import { WorldClocksSection } from './components/world-clocks-section';
import { describeWeatherCode, deg, temp } from './weather-format';
import { useTitlebarStatusStore } from './titlebar-status-store';

function withQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>;
}

describe('TitleBarStatus component', () => {
  afterEach(cleanup);

  it('renders pill trigger in titlebar center', () => {
    render(withQuery(<TitleBarStatus />));
    const pill = screen.getByTestId('titlebar-status-pill');
    expect(pill).toBeDefined();
  });

  it('renders full status dashboard panel', () => {
    render(withQuery(<TitlebarStatusPanel />));
    expect(screen.getByTestId('titlebar-status-panel')).toBeDefined();
    expect(screen.getByText('Status & Time Dashboard')).toBeDefined();
  });

  it('renders individual dashboard sections', () => {
    render(withQuery(<CalendarSection />));
    expect(screen.getByText('Calendar')).toBeDefined();

    render(withQuery(<TimeSection />));
    expect(screen.getByText('Current Time')).toBeDefined();

    render(withQuery(<WeatherSection />));
    expect(screen.getByText(/Weather/i)).toBeDefined();

    render(withQuery(<WorldClocksSection />));
    expect(screen.getByText('World Clocks')).toBeDefined();
  });

  it('formats weather codes correctly', () => {
    expect(describeWeatherCode(0).bucket).toBe('clear');
    expect(describeWeatherCode(2).bucket).toBe('partlyCloudy');
    expect(describeWeatherCode(3).bucket).toBe('overcast');
    expect(describeWeatherCode(61).bucket).toBe('rain');
    expect(describeWeatherCode(95).bucket).toBe('thunderstorm');
  });

  it('converts temperatures between Celsius and Fahrenheit', () => {
    expect(deg(20, 'c')).toBe('20°');
    expect(deg(20, 'f')).toBe('68°');
    expect(temp(20, 'c')).toBe('20°C');
    expect(temp(20, 'f')).toBe('68°F');
  });

  it('allows toggling pill and section visibility in store', () => {
    const store = useTitlebarStatusStore.getState();
    store.setShowDate(false);
    expect(useTitlebarStatusStore.getState().showDate).toBe(false);
    store.setShowDate(true);
    expect(useTitlebarStatusStore.getState().showDate).toBe(true);

    store.toggleSectionVisibility('calendar');
    expect(useTitlebarStatusStore.getState().visibleSections.calendar).toBe(false);
    store.toggleSectionVisibility('calendar');
    expect(useTitlebarStatusStore.getState().visibleSections.calendar).toBe(true);
  });
});
