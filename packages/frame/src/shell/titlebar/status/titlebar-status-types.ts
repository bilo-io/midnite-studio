export type WeatherUnits = 'c' | 'f';

export type WeatherLocation = {
  lat: number;
  lon: number;
  label?: string;
};

export type WeatherResponse = {
  current: {
    temperatureC: number;
    weatherCode: number;
    precipitation: number;
  };
  today: {
    highC: number;
    lowC: number;
    precipitationProbability: number;
    weatherCode: number;
  };
  resolvedAt: string;
};

export type WeatherLocateResponse = {
  lat: number;
  lon: number;
  label: string | null;
};

export type WeatherGeocodeResult = {
  id: string;
  name: string;
  label: string;
  lat: number;
  lon: number;
};

export type WorldClockZone = {
  label: string;
  tz: string;
};

export type ClockMode = 'digital' | 'analogue';

export type PanelView = 'time' | 'date';
