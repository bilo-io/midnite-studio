import { MEDIA_EXPORT_FORMAT_INFO, stringifyLayer, type MapLayerFile, type MediaExportFormat } from '@midnite/studio-shared';

import { geoJsonToKml } from './kml';

/** A layer as the bytes of one export format; `null` for a format a layer cannot take. */
export function layerExportText(name: string, fc: MapLayerFile, format: MediaExportFormat): string | null {
  if (format === 'geojson') return stringifyLayer(fc);
  if (format === 'kml') return geoJsonToKml(fc, name);
  return null;
}

/**
 * Hands the file to the OS save flow: Electron turns an `a[download]` click into a native save dialog,
 * the same route the workflow export takes (there is no IPC save dialog for text).
 */
export function downloadLayer(name: string, fc: MapLayerFile, format: MediaExportFormat): boolean {
  const text = layerExportText(name, fc, format);
  if (text === null) return false;
  const url = URL.createObjectURL(new Blob([text], { type: format === 'kml' ? 'application/vnd.google-earth.kml+xml' : 'application/geo+json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}.${MEDIA_EXPORT_FORMAT_INFO[format].ext}`;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
