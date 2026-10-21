import { create } from 'zustand';

/** The last place the user flew to from Maps' search — Theme F names a capture after it. */
export type MapPlace = { name: string; center: [number, number] };
export const useMapPlaceStore = create<{ place: MapPlace | null; setPlace: (place: MapPlace | null) => void }>((set) => ({
  place: null,
  setPlace: (place) => set({ place }),
}));
