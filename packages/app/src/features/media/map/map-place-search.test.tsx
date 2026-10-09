import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
vi.mock('../../geo/geocode', () => ({ searchLocations: (q: string) => search(q) }));

import { MapPlaceSearch, SEARCH_DEBOUNCE_MS } from './map-place-search';
import { useMapPlaceStore } from './map-place-store';

const cape = { name: 'Cape Town', latitude: -33.92, longitude: 18.42, country: 'South Africa', admin1: 'Western Cape' };

beforeEach(() => {
  vi.useFakeTimers();
  search.mockReset();
  useMapPlaceStore.setState({ place: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const type = (value: string) => fireEvent.change(screen.getByLabelText('Search places'), { target: { value } });
const flush = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('MapPlaceSearch', () => {
  it('waits 300 ms and two characters before searching', async () => {
    search.mockResolvedValue([cape]);
    render(<MapPlaceSearch onPick={() => undefined} />);
    type('C');
    await flush(SEARCH_DEBOUNCE_MS + 10);
    expect(search).not.toHaveBeenCalled();
    type('Ca');
    type('Cap');
    await flush(SEARCH_DEBOUNCE_MS - 1);
    expect(search).not.toHaveBeenCalled();
    await flush(1);
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('Cap');
  });

  it('Enter flies to the first result at zoom 12 and records the name', async () => {
    search.mockResolvedValue([cape]);
    const onPick = vi.fn();
    render(<MapPlaceSearch onPick={onPick} />);
    type('Cape');
    await flush(SEARCH_DEBOUNCE_MS + 10);
    expect(screen.getByText('Cape Town, Western Cape, South Africa')).toBeTruthy();
    fireEvent.keyDown(screen.getByLabelText('Search places'), { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith([18.42, -33.92], 12);
    expect(useMapPlaceStore.getState().place?.name).toBe('Cape Town, Western Cape, South Africa');
  });

  it('says so when nothing matches and when the network fails', async () => {
    search.mockResolvedValueOnce([]);
    render(<MapPlaceSearch onPick={() => undefined} />);
    type('zzzz');
    await flush(SEARCH_DEBOUNCE_MS + 10);
    expect(screen.getByText('No places match.')).toBeTruthy();
    search.mockRejectedValueOnce(new Error('offline'));
    type('zzzzz');
    await flush(SEARCH_DEBOUNCE_MS + 10);
    expect(screen.getByText('Place search needs a network connection.')).toBeTruthy();
  });
});
