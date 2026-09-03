/** One Open-Meteo geocoding result — a candidate location a search picks between. */
export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

export type WeatherUnit = 'celsius' | 'fahrenheit';

/** The one number the lock screen widget needs, plus the WMO code that picks its icon. */
export type WeatherReading = {
  temperature: number;
  weatherCode: number;
};

/** A stable key for a location — used to key the store and the current-weather query. */
export function locationKey(location: WeatherLocation): string {
  return `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
}
