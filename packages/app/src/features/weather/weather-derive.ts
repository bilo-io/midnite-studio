import {
  LuCloud,
  LuCloudDrizzle,
  LuCloudFog,
  LuCloudHail,
  LuCloudLightning,
  LuCloudRain,
  LuCloudSnow,
  LuCloudSun,
  LuSun,
} from 'react-icons/lu';

import type { IconComponent } from '../../components/icon-button';
import type { WeatherLocation, WeatherUnit } from './weather-types';

export function fmtTemperature(temperature: number, unit: WeatherUnit): string {
  return `${Math.round(temperature)}°${unit === 'celsius' ? 'C' : 'F'}`;
}

export function fmtLocationName(location: WeatherLocation): string {
  const region = location.admin1 && location.admin1 !== location.name ? `, ${location.admin1}` : '';
  const country = location.country ? `, ${location.country}` : '';
  return `${location.name}${region}${country}`;
}

/**
 * WMO weather-interpretation codes (the shape Open-Meteo's `weather_code`
 * returns) mapped to one of the icons `react-icons/lu` already ships — no new
 * dependency, since `react-icons` is the app's only icon family (CLAUDE.md).
 * Code ranges per Open-Meteo's own published table: https://open-meteo.com/en/docs
 */
const WEATHER_CODE_RANGES: { max: number; label: string; icon: IconComponent }[] = [
  { max: 0, label: 'Clear sky', icon: LuSun },
  { max: 3, label: 'Partly cloudy', icon: LuCloudSun },
  { max: 48, label: 'Fog', icon: LuCloudFog },
  { max: 57, label: 'Drizzle', icon: LuCloudDrizzle },
  { max: 67, label: 'Rain', icon: LuCloudRain },
  { max: 77, label: 'Snow', icon: LuCloudSnow },
  { max: 82, label: 'Rain showers', icon: LuCloudRain },
  { max: 86, label: 'Snow showers', icon: LuCloudSnow },
  { max: 94, label: 'Overcast', icon: LuCloud },
  { max: 96, label: 'Thunderstorm', icon: LuCloudLightning },
  { max: 99, label: 'Thunderstorm with hail', icon: LuCloudHail },
];

export function weatherCondition(code: number): { label: string; icon: IconComponent } {
  const match = WEATHER_CODE_RANGES.find((range) => code <= range.max);
  return match ?? { label: 'Unknown', icon: LuCloud };
}
