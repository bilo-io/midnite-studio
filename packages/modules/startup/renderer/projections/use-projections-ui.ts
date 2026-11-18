import { create } from 'zustand';

import type { FleetProjection } from '@midnite/studio-shared';

export const LIST_BOUNDS = { initial: 240, min: 200, max: 360 } as const;
export const CONTROLS_BOUNDS = { initial: 340, min: 300, max: 480 } as const;

const KEYS = {
  listWidth: 'midnite-startup.projections.listWidth',
  controlsWidth: 'midnite-startup.projections.controlsWidth',
  selectedId: 'midnite-startup.projections.selectedId',
} as const;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private window or blocked storage: the change still holds for this session.
  }
}

/** A stored width clamped into its bounds; garbage falls back to `initial`. */
export function loadWidth(raw: string | null, b: { initial: number; min: number; max: number }): number {
  const n = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(n)) return b.initial;
  return Math.min(b.max, Math.max(b.min, Math.round(n)));
}

/** The stored id if it still exists, else the first projection, else null. */
export function resolveSelection<T extends { id: string }>(projections: readonly T[], storedId: string | null): string | null {
  if (storedId !== null && projections.some((p) => p.id === storedId)) return storedId;
  return projections[0]?.id ?? null;
}

export function selectedProjection(projections: readonly FleetProjection[], storedId: string | null): FleetProjection | null {
  const id = resolveSelection(projections, storedId);
  return projections.find((p) => p.id === id) ?? null;
}

type ProjectionsUi = {
  listWidth: number;
  controlsWidth: number;
  selectedId: string | null;
  setListWidth: (w: number) => void;
  setControlsWidth: (w: number) => void;
  select: (id: string | null) => void;
};

/** Pane widths and the selected projection, remembered per viewer (hand-rolled localStorage, not `persist`). */
export const useProjectionsUi = create<ProjectionsUi>((set) => ({
  listWidth: loadWidth(read(KEYS.listWidth), LIST_BOUNDS),
  controlsWidth: loadWidth(read(KEYS.controlsWidth), CONTROLS_BOUNDS),
  selectedId: read(KEYS.selectedId),
  setListWidth: (listWidth) => {
    write(KEYS.listWidth, String(listWidth));
    set({ listWidth });
  },
  setControlsWidth: (controlsWidth) => {
    write(KEYS.controlsWidth, String(controlsWidth));
    set({ controlsWidth });
  },
  select: (selectedId) => {
    if (selectedId !== null) write(KEYS.selectedId, selectedId);
    set({ selectedId });
  },
}));
