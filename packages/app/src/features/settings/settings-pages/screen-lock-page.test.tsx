import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWeatherStore } from '../../weather/weather-store';
import { ScreenLockPage } from './screen-lock-page';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  useWeatherStore.setState({ location: null, unit: 'celsius' });
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ScreenLockPage weather section (Phase 46 Theme A)', () => {
  it('searches, picks a result, and stores the location', async () => {
    // Real timers for this one: the debounce and react-query's own fetch
    // resolution both need to actually elapse for `findByText` to see the
    // result — fake timers just wedge `waitFor`'s internal polling.
    vi.useRealTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [{ name: 'London', latitude: 51.5, longitude: -0.13, country: 'United Kingdom' }],
        }),
      ),
    );

    render(<ScreenLockPage />, { wrapper: createWrapper() });

    fireEvent.change(screen.getByPlaceholderText('Search a city…'), { target: { value: 'Lon' } });

    const result = await screen.findByText('London, United Kingdom', {}, { timeout: 3000 });
    fireEvent.click(result);

    expect(useWeatherStore.getState().location).toEqual({
      name: 'London',
      latitude: 51.5,
      longitude: -0.13,
      country: 'United Kingdom',
    });
  });

  it('removing the stored location brings the search box back', () => {
    useWeatherStore.setState({
      location: { name: 'Paris', latitude: 48.85, longitude: 2.35, country: 'France' },
      unit: 'celsius',
    });
    render(<ScreenLockPage />, { wrapper: createWrapper() });

    expect(screen.getByText('Paris, France')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove weather location' }));

    expect(useWeatherStore.getState().location).toBeNull();
    expect(screen.getByPlaceholderText('Search a city…')).toBeTruthy();
  });

  it('the unit toggle stores the chosen unit', () => {
    render(<ScreenLockPage />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('radio', { name: '°F' }));
    expect(useWeatherStore.getState().unit).toBe('fahrenheit');
  });
});
