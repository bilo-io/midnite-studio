import { beforeEach, describe, expect, it } from 'vitest';

import { useWeatherStore } from './weather-store';

const reset = () => useWeatherStore.setState({ location: null, unit: 'celsius' });
beforeEach(reset);

const london = { name: 'London', latitude: 51.5, longitude: -0.13 };

describe('setLocation', () => {
  it('stores a location', () => {
    useWeatherStore.getState().setLocation(london);
    expect(useWeatherStore.getState().location).toEqual(london);
  });

  it('clears back to unset', () => {
    useWeatherStore.getState().setLocation(london);
    useWeatherStore.getState().setLocation(null);
    expect(useWeatherStore.getState().location).toBeNull();
  });
});

describe('setUnit', () => {
  it('stores the temperature unit', () => {
    useWeatherStore.getState().setUnit('fahrenheit');
    expect(useWeatherStore.getState().unit).toBe('fahrenheit');
  });
});
