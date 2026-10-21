import { DEFAULT_MAP_LAYER_COLOR, map as geo, type MapLayerFeature, type MapLayerFile } from '@midnite/studio-shared';

import { formatArea, formatDistance, type MapUnits } from './map-format';
import type { LonLat } from './map-frame';
import { DEFAULT_CIRCLE_RADIUS_M, type MapToolState } from './map-tools';

/** Pure data builders for the drawings the canvas paints (Phase 108 Themes G and H); no MapLibre in here. */
export type GeoFC = { type: 'FeatureCollection'; features: Array<Record<string, unknown>> };
export const EMPTY_FC: GeoFC = { type: 'FeatureCollection', features: [] };

export type LayerView = {
  name: string;
  /** `null` when the file is not valid GeoJSON: listed with an error, never drawn, never overwritten. */
  fc: MapLayerFile | null;
  color: string;
  visible: boolean;
};

export const featureId = (f: MapLayerFeature): string => String(f.id ?? '');
/** A selected feature is addressed as `<layer>\u0000<id>`, so ids need only be unique inside a layer. */
export const selKey = (layer: string, id: string): string => `${layer}\u0000${id}`;
export const splitSelKey = (key: string): { layer: string; id: string } => {
  const i = key.indexOf('\u0000');
  return { layer: key.slice(0, i), id: key.slice(i + 1) };
};

/** Every visible layer's features, with the colour, owning layer and selection folded into properties. */
export function drawingsData(layers: readonly LayerView[], selected: ReadonlySet<string>): GeoFC {
  const features: GeoFC['features'] = [];
  for (const layer of layers) {
    if (!layer.visible || !layer.fc) continue;
    for (const f of layer.fc.features) {
      const id = featureId(f);
      features.push({
        type: 'Feature',
        geometry: f.geometry,
        properties: {
          fid: selKey(layer.name, id),
          kind: f.properties.kind,
          label: f.properties.label ?? '',
          color: f.properties.color ?? layer.color ?? DEFAULT_MAP_LAYER_COLOR,
          selected: selected.has(selKey(layer.name, id)) ? 1 : 0,
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

const DRAFT_COLOR = '#f59e0b';

/** The in-progress shape: its outline/fill, plus numbered vertices the user can drag. */
export function draftData(state: MapToolState): { shape: GeoFC; vertices: GeoFC } {
  const pts = state.points;
  const features: GeoFC['features'] = [];
  const props = { kind: 'draft', color: DRAFT_COLOR };
  if (state.tool === 'distance' && pts.length >= 2) features.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: pts } });
  if (state.tool === 'area' && pts.length >= 2) {
    features.push(
      pts.length >= 3
        ? { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]!]] } }
        : { type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: pts } },
    );
  }
  if (state.tool === 'circle' && pts[0]) {
    features.push({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [geo.geodesicCircle(pts[0], state.radiusM ?? DEFAULT_CIRCLE_RADIUS_M)] } });
  }
  const vertices: GeoFC = {
    type: 'FeatureCollection',
    features: pts.map((p, index) => ({ type: 'Feature', properties: { index }, geometry: { type: 'Point', coordinates: p } })),
  };
  return { shape: { type: 'FeatureCollection', features }, vertices };
}

export type Readout = { title: string; rows: Array<[string, string]> };

/** What the measure readout and detail pane say about a draft. "Geodesic" — Vincenty on WGS84, not a sphere. */
export function draftReadout(state: MapToolState, units: MapUnits): Readout | null {
  const pts = state.points;
  if (state.tool === 'distance' && pts.length >= 1) {
    const legs = geo.pathLegsM(pts);
    const rows: Array<[string, string]> = legs.map((m, i) => [`Leg ${i + 1}`, formatDistance(m, units)]);
    rows.push(['Total (geodesic)', formatDistance(legs.reduce((a, b) => a + b, 0), units)]);
    return { title: 'Distance', rows };
  }
  if (state.tool === 'circle' && pts[0]) {
    const r = state.radiusM ?? DEFAULT_CIRCLE_RADIUS_M;
    return { title: 'Radius circle', rows: [['Radius', formatDistance(r, units)], ['Area', formatArea(Math.PI * r * r, units)]] };
  }
  if (state.tool === 'area' && pts.length >= 3) {
    const m = geo.polygonMeasure(pts);
    return { title: 'Area', rows: m ? [['Area', formatArea(m.areaM2, units)], ['Perimeter', formatDistance(m.perimeterM, units)]] : [['Area', 'Areas up to 200 km across.']] };
  }
  return null;
}

/** Facts about a saved feature, for the detail pane. */
export function featureFacts(f: MapLayerFeature, units: MapUnits): Array<[string, string]> {
  const g = f.geometry;
  switch (f.properties.kind) {
    case 'pin': {
      const [lon, lat] = g.type === 'Point' ? g.coordinates : [0, 0];
      return [['Position', `${lat!.toFixed(5)}, ${lon!.toFixed(5)}`]];
    }
    case 'path':
      return g.type === 'LineString' ? [['Length (geodesic)', formatDistance(geo.pathLengthM(g.coordinates as LonLat[]), units)], ['Vertices', String(g.coordinates.length)]] : [];
    case 'circle': {
      const r = f.properties.radiusM ?? 0;
      return [['Radius', formatDistance(r, units)], ['Area', formatArea(Math.PI * r * r, units)]];
    }
    case 'area': {
      const m = g.type === 'Polygon' ? geo.polygonMeasure(g.coordinates[0] as LonLat[]) : null;
      return m ? [['Area', formatArea(m.areaM2, units)], ['Perimeter', formatDistance(m.perimeterM, units)]] : [['Area', 'Areas up to 200 km across.']];
    }
  }
}

/** Two circles: centre-to-centre distance and the gap between their edges (negative = overlap). */
export function circlePair(a: MapLayerFeature, b: MapLayerFeature, units: MapUnits): Array<[string, string]> | null {
  const ca = a.properties.center as LonLat | undefined;
  const cb = b.properties.center as LonLat | undefined;
  if (a.properties.kind !== 'circle' || b.properties.kind !== 'circle' || !ca || !cb) return null;
  const d = geo.inverse(ca, cb).distanceM;
  const gap = d - (a.properties.radiusM ?? 0) - (b.properties.radiusM ?? 0);
  return [['Centre to centre', formatDistance(d, units)], gap < 0 ? ['Overlap', formatDistance(-gap, units)] : ['Gap', formatDistance(gap, units)]];
}

/** Next free `Layer N`-style name. */
export function uniqueLayerName(base: string, taken: readonly string[]): string {
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.includes(`${base} ${n}`)) return `${base} ${n}`;
}
