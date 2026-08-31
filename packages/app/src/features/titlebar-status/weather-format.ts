import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react';
import type { IconType } from 'react-icons';
import {
  LuCloud,
  LuCloudDrizzle,
  LuCloudFog,
  LuCloudLightning,
  LuCloudRain,
  LuCloudSnow,
  LuCloudSun,
  LuSun,
} from 'react-icons/lu';

import type { WeatherUnits } from './titlebar-status-types';

export type WeatherCodeBucket =
  | 'clear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'rainShowers'
  | 'snowShowers'
  | 'thunderstorm';

const BUCKET_LABELS: Record<WeatherCodeBucket, string> = {
  clear: 'Clear',
  partlyCloudy: 'Partly cloudy',
  overcast: 'Overcast',
  fog: 'Fog',
  drizzle: 'Drizzle',
  rain: 'Rain',
  snow: 'Snow',
  rainShowers: 'Rain showers',
  snowShowers: 'Snow showers',
  thunderstorm: 'Thunderstorm',
};

export function describeWeatherCode(code: number): {
  icon: IconType;
  lucideIcon: typeof Sun;
  bucket: WeatherCodeBucket;
  label: string;
} {
  if (code === 0) return { icon: LuSun, lucideIcon: Sun, bucket: 'clear', label: BUCKET_LABELS.clear };
  if (code <= 2) return { icon: LuCloudSun, lucideIcon: CloudSun, bucket: 'partlyCloudy', label: BUCKET_LABELS.partlyCloudy };
  if (code === 3) return { icon: LuCloud, lucideIcon: Cloud, bucket: 'overcast', label: BUCKET_LABELS.overcast };
  if (code <= 48) return { icon: LuCloudFog, lucideIcon: CloudFog, bucket: 'fog', label: BUCKET_LABELS.fog };
  if (code <= 57) return { icon: LuCloudDrizzle, lucideIcon: CloudDrizzle, bucket: 'drizzle', label: BUCKET_LABELS.drizzle };
  if (code <= 67) return { icon: LuCloudRain, lucideIcon: CloudRain, bucket: 'rain', label: BUCKET_LABELS.rain };
  if (code <= 77) return { icon: LuCloudSnow, lucideIcon: CloudSnow, bucket: 'snow', label: BUCKET_LABELS.snow };
  if (code <= 82) return { icon: LuCloudRain, lucideIcon: CloudRain, bucket: 'rainShowers', label: BUCKET_LABELS.rainShowers };
  if (code <= 86) return { icon: LuCloudSnow, lucideIcon: CloudSnow, bucket: 'snowShowers', label: BUCKET_LABELS.snowShowers };
  return { icon: LuCloudLightning, lucideIcon: CloudLightning, bucket: 'thunderstorm', label: BUCKET_LABELS.thunderstorm };
}

export function deg(celsius: number, units: WeatherUnits): string {
  const value = units === 'f' ? celsius * 1.8 + 32 : celsius;
  return `${Math.round(value)}°`;
}

export function temp(celsius: number, units: WeatherUnits): string {
  return `${deg(celsius, units)}${units === 'f' ? 'F' : 'C'}`;
}
