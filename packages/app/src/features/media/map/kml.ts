import { emptyLayer, type MapLayerFeature, type MapLayerFile } from '@midnite/studio-shared';

import { newFeatureId } from './map-tools';

/**
 * KML <-> GeoJSON for layers (Phase 108 Theme H). Pure DOMParser/string work in the renderer — no
 * dependency. Only `Point`, `LineString` and `Polygon` (outer ring) placemarks survive; anything else is
 * skipped and counted so the import can say so.
 */
export type KmlImport = { layer: MapLayerFile; skipped: number };

const text = (el: Element, tag: string): string | undefined => {
  for (const child of Array.from(el.children)) if (child.localName === tag) return child.textContent?.trim() || undefined;
  return undefined;
};
const descendants = (el: Element, tag: string): Element[] => Array.from(el.getElementsByTagNameNS('*', tag));
const parseCoords = (el: Element | undefined): number[][] =>
  (el?.textContent ?? '')
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(',').map(Number))
    .filter((c) => c.length >= 2 && c.every((n) => Number.isFinite(n)))
    .map(([lon, lat]) => [lon!, lat!]);

export function kmlToGeoJson(source: string): KmlImport | null {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return null;
  const layer = emptyLayer();
  let skipped = 0;
  for (const mark of descendants(doc.documentElement, 'Placemark')) {
    const label = text(mark, 'name');
    const note = text(mark, 'description');
    const props = { ...(label ? { label } : {}), ...(note ? { note } : {}) };
    const multi = descendants(mark, 'MultiGeometry').length > 0;
    const point = descendants(mark, 'Point')[0];
    const line = descendants(mark, 'LineString')[0];
    const poly = descendants(mark, 'Polygon')[0];
    let feature: MapLayerFeature | null = null;
    if (!multi && point) {
      const c = parseCoords(descendants(point, 'coordinates')[0])[0];
      if (c) feature = { type: 'Feature', id: newFeatureId(), geometry: { type: 'Point', coordinates: [c[0]!, c[1]!] }, properties: { kind: 'pin', ...props } };
    } else if (!multi && line) {
      const c = parseCoords(descendants(line, 'coordinates')[0]);
      if (c.length >= 2) feature = { type: 'Feature', id: newFeatureId(), geometry: { type: 'LineString', coordinates: c as [number, number][] }, properties: { kind: 'path', ...props } };
    } else if (!multi && poly) {
      const outer = descendants(poly, 'outerBoundaryIs')[0];
      const c = parseCoords(outer ? descendants(outer, 'coordinates')[0] : undefined);
      if (c.length >= 4) feature = { type: 'Feature', id: newFeatureId(), geometry: { type: 'Polygon', coordinates: [c as [number, number][]] }, properties: { kind: 'area', ...props } };
    }
    if (feature) layer.features.push(feature);
    else skipped += 1;
  }
  return { layer, skipped };
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const coords = (positions: readonly (readonly number[])[]): string => positions.map((p) => `${p[0]},${p[1]},0`).join(' ');

export function geoJsonToKml(layer: MapLayerFile, name: string): string {
  const marks = layer.features.map((f) => {
    const head = `${f.properties.label ? `<name>${esc(f.properties.label)}</name>` : ''}${f.properties.note ? `<description>${esc(f.properties.note)}</description>` : ''}`;
    const g = f.geometry;
    const body =
      g.type === 'Point'
        ? `<Point><coordinates>${coords([g.coordinates])}</coordinates></Point>`
        : g.type === 'LineString'
          ? `<LineString><coordinates>${coords(g.coordinates)}</coordinates></LineString>`
          : `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coords(g.coordinates[0] ?? [])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
    return `    <Placemark>${head}${body}</Placemark>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n  <Document>\n    <name>${esc(name)}</name>\n${marks.join('\n')}\n  </Document>\n</kml>\n`;
}
