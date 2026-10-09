import { map as geo, type MapLayerFeature } from '@midnite/studio-shared';

import type { LonLat } from './map-frame';

/**
 * The measure/draw tools (Phase 108 Theme G) as modes of one reducer. `pan` is the resting mode; the
 * others collect points on the map until finished (Enter or a double-click) or cancelled (Esc). Pure —
 * the canvas feeds it clicks and the tab turns a finished draft into a layer feature.
 */
export const MAP_TOOLS = ['pan', 'distance', 'circle', 'area', 'pin'] as const;
export type MapTool = (typeof MAP_TOOLS)[number];

/** The key that picks each tool while the canvas has focus. `F`, `T`, arrows and `+`/`-` belong to the canvas. */
export const MAP_TOOL_KEYS: Record<Exclude<MapTool, 'pan'>, string> = { distance: 'd', circle: 'c', area: 'a', pin: 'p' };
export const MAP_TOOL_LABEL: Record<MapTool, string> = { pan: 'Pan', distance: 'Distance', circle: 'Radius circle', area: 'Area', pin: 'Pin' };

export const MIN_POINTS: Record<MapTool, number> = { pan: 0, distance: 2, circle: 1, area: 3, pin: 1 };

export type MapToolState = {
  tool: MapTool;
  /** Distance and area: the vertices so far. Circle: `[centre]`. Pin: unused (a click places it at once). */
  points: LonLat[];
  /** Circle only: the radius once the second click has set it; `null` while only the centre is down. */
  radiusM: number | null;
};

export type MapToolAction =
  | { type: 'select'; tool: MapTool }
  | { type: 'click'; point: LonLat }
  | { type: 'move'; index: number; point: LonLat }
  | { type: 'undo' }
  | { type: 'cancel' }
  | { type: 'reset' };

export const initialToolState: MapToolState = { tool: 'pan', points: [], radiusM: null };

const same = (a: LonLat, b: LonLat): boolean => a[0] === b[0] && a[1] === b[1];

export function mapToolReducer(state: MapToolState, action: MapToolAction): MapToolState {
  switch (action.type) {
    case 'select':
      // Re-pressing the active tool's key drops back to pan, like a toggle.
      return action.tool === state.tool ? initialToolState : { tool: action.tool, points: [], radiusM: null };
    case 'click': {
      if (state.tool === 'pan') return state;
      if (state.tool === 'pin') return { ...state, points: [action.point] };
      if (state.tool === 'circle') {
        if (state.points.length === 0) return { ...state, points: [action.point], radiusM: null };
        if (state.radiusM !== null) return state;
        const r = geo.inverse(state.points[0]!, action.point).distanceM;
        return { ...state, radiusM: Math.min(geo.MAX_CIRCLE_RADIUS_M, Math.max(geo.MIN_CIRCLE_RADIUS_M, r)) };
      }
      const last = state.points[state.points.length - 1];
      return last && same(last, action.point) ? state : { ...state, points: [...state.points, action.point] };
    }
    case 'move':
      if (action.index < 0 || action.index >= state.points.length) return state;
      return { ...state, points: state.points.map((p, i) => (i === action.index ? action.point : p)) };
    case 'undo':
      if (state.tool === 'circle') return { ...state, points: state.radiusM !== null ? state.points : [], radiusM: null };
      return { ...state, points: state.points.slice(0, -1) };
    case 'cancel':
      // Esc: cancel the in-progress shape first; with nothing in progress, leave the tool.
      return state.points.length > 0 ? { ...state, points: [], radiusM: null } : initialToolState;
    case 'reset':
      return { ...state, points: [], radiusM: null };
  }
}

/** Whether the draft is far enough along that Enter / a double-click would produce a shape. */
export function canFinish(state: MapToolState): boolean {
  if (state.tool === 'circle') return state.points.length === 1;
  if (state.tool === 'pin') return state.points.length === 1;
  return state.points.length >= MIN_POINTS[state.tool];
}

export type DraftShape =
  | { kind: 'path'; points: LonLat[] }
  | { kind: 'area'; points: LonLat[] }
  | { kind: 'circle'; center: LonLat; radiusM: number }
  | { kind: 'pin'; point: LonLat };

export const DEFAULT_CIRCLE_RADIUS_M = 1000;

/** The shape a finished draft stands for, or `null` while it is not finishable. */
export function draftShape(state: MapToolState): DraftShape | null {
  if (!canFinish(state)) return null;
  const pts = state.points;
  switch (state.tool) {
    case 'distance':
      return { kind: 'path', points: pts };
    case 'area':
      return { kind: 'area', points: pts };
    case 'circle':
      return { kind: 'circle', center: pts[0]!, radiusM: state.radiusM ?? DEFAULT_CIRCLE_RADIUS_M };
    case 'pin':
      return { kind: 'pin', point: pts[0]! };
    default:
      return null;
  }
}

export const newFeatureId = (): string => `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const AREA_TOO_LARGE = 'Areas up to 200 km across.';

/** A finished draft as a layer feature, or an error message (an over-large area). */
export function featureFromDraft(shape: DraftShape, index: number): { feature: MapLayerFeature } | { error: string } {
  const id = newFeatureId();
  switch (shape.kind) {
    case 'pin':
      return { feature: { type: 'Feature', id, geometry: { type: 'Point', coordinates: shape.point }, properties: { kind: 'pin', label: `Pin ${index}` } } };
    case 'path':
      return { feature: { type: 'Feature', id, geometry: { type: 'LineString', coordinates: shape.points }, properties: { kind: 'path', label: `Path ${index}` } } };
    case 'circle':
      return { feature: circleFeature(id, shape.center, shape.radiusM, `Circle ${index}`) };
    case 'area': {
      if (!geo.polygonMeasure(shape.points)) return { error: AREA_TOO_LARGE };
      const ring = [...shape.points, shape.points[0]!];
      return { feature: { type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [ring] }, properties: { kind: 'area', label: `Area ${index}` } } };
    }
  }
}

export function circleFeature(id: string | number, center: LonLat, radiusM: number, label?: string, color?: string): MapLayerFeature {
  const r = Math.min(geo.MAX_CIRCLE_RADIUS_M, Math.max(geo.MIN_CIRCLE_RADIUS_M, radiusM));
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Polygon', coordinates: [geo.geodesicCircle(center, r)] },
    properties: { kind: 'circle', center, radiusM: r, ...(label ? { label } : {}), ...(color ? { color } : {}) },
  };
}
