import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCurrentWeather, searchLocations } from './weather-api';

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchLocations', () => {
  it('maps geocoding results to WeatherLocation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          results: [
            { name: 'London', latitude: 51.5, longitude: -0.13, country: 'United Kingdom', admin1: 'England' },
          ],
        }),
      ),
    );
    const results = await searchLocations('London');
    expect(results).toEqual([
      { name: 'London', latitude: 51.5, longitude: -0.13, country: 'United Kingdom', admin1: 'England' },
    ]);
  });

  it('returns an empty list when the endpoint finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    const results = await searchLocations('zzzzzz');
    expect(results).toEqual([]);
  });
});

describe('getCurrentWeather', () => {
  const london = { name: 'London', latitude: 51.5, longitude: -0.13 };

  it('reads temperature and weather code off the current block', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ current: { temperature_2m: 18.4, weather_code: 3 } }),
      ),
    );
    const reading = await getCurrentWeather(london, 'celsius');
    expect(reading).toEqual({ temperature: 18.4, weatherCode: 3 });
  });

  it('throws when the current block is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    await expect(getCurrentWeather(london, 'celsius')).rejects.toThrow('weather data unavailable');
  });

  it('passes the requested unit through to the query string', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ current: { temperature_2m: 65, weather_code: 0 } }));
    vi.stubGlobal('fetch', fetchMock);
    await getCurrentWeather(london, 'fahrenheit');
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('temperature_unit=fahrenheit');
  });
});
