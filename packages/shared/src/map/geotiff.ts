/**
 * A hand-written baseline GeoTIFF writer (no `geotiff` dependency): one strip, little-endian,
 * `SampleFormat = IEEE float`, 32 bits. The CRS is user-defined azimuthal equidistant on WGS84
 * centred on the capture frame (`+proj=aeqd +lat_0 +lon_0`), `PixelIsPoint` because the heightmap is
 * vertex-centred. Row 0 is the north edge.
 */
import type { LonLat } from './geodesy';

const T = { BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, DOUBLE: 12 } as const;

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Inline value (when it fits in 4 bytes) or an out-of-line payload. */
  inline?: number;
  payload?: Uint8Array;
}

function doubles(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 8);
  const v = new DataView(out.buffer);
  values.forEach((x, i) => v.setFloat64(i * 8, x, true));
  return out;
}

function shorts(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const v = new DataView(out.buffer);
  values.forEach((x, i) => v.setUint16(i * 2, x, true));
  return out;
}

export function writeGeoTiffFloat32(
  heights: Float32Array,
  n: number,
  frame: { center: LonLat; sideM: number },
): Uint8Array {
  const imageBytes = n * n * 4;
  const pitch = frame.sideM / (n - 1);
  const [lon0, lat0] = frame.center;

  // GeoKeyDirectory: header + keys sorted ascending; doubles live in GeoDoubleParams.
  const keys: [number, number, number, number][] = [
    [1024, 0, 1, 1], // GTModelType = projected
    [1025, 0, 1, 2], // GTRasterType = PixelIsPoint
    [2048, 0, 1, 4326], // GeographicType = WGS84
    [3072, 0, 1, 32767], // ProjectedCSType = user-defined
    [3074, 0, 1, 32767], // Projection = user-defined
    [3075, 0, 1, 12], // ProjCoordTrans = AzimuthalEquidistant
    [3076, 0, 1, 9001], // ProjLinearUnits = metre
    [3082, 34736, 1, 2], // FalseEasting -> params[2]
    [3083, 34736, 1, 3], // FalseNorthing -> params[3]
    [3088, 34736, 1, 0], // ProjCenterLong -> params[0]
    [3089, 34736, 1, 1], // ProjCenterLat -> params[1]
  ];
  const geoKeys = shorts([1, 1, 0, keys.length, ...keys.flat()]);
  const geoDoubles = doubles([lon0, lat0, 0, 0]);
  const ascii = new TextEncoder().encode('Midnite Studio capture (azimuthal equidistant)|\0');

  const entries: Entry[] = [
    { tag: 256, type: T.LONG, count: 1, inline: n },
    { tag: 257, type: T.LONG, count: 1, inline: n },
    { tag: 258, type: T.SHORT, count: 1, inline: 32 },
    { tag: 259, type: T.SHORT, count: 1, inline: 1 },
    { tag: 262, type: T.SHORT, count: 1, inline: 1 },
    { tag: 273, type: T.LONG, count: 1, inline: 8 },
    { tag: 277, type: T.SHORT, count: 1, inline: 1 },
    { tag: 278, type: T.LONG, count: 1, inline: n },
    { tag: 279, type: T.LONG, count: 1, inline: imageBytes },
    { tag: 284, type: T.SHORT, count: 1, inline: 1 },
    { tag: 339, type: T.SHORT, count: 1, inline: 3 },
    { tag: 33550, type: T.DOUBLE, count: 3, payload: doubles([pitch, pitch, 0]) },
    {
      tag: 33922,
      type: T.DOUBLE,
      count: 6,
      payload: doubles([0, 0, 0, -frame.sideM / 2, frame.sideM / 2, 0]),
    },
    { tag: 34735, type: T.SHORT, count: geoKeys.length / 2, payload: geoKeys },
    { tag: 34736, type: T.DOUBLE, count: 4, payload: geoDoubles },
    { tag: 34737, type: T.ASCII, count: ascii.length, payload: ascii },
  ];

  // Layout: header(8) | image | out-of-line payloads (8-aligned) | IFD.
  let cursor = 8 + imageBytes;
  const offsets = new Map<Entry, number>();
  for (const e of entries) {
    if (!e.payload) continue;
    cursor = (cursor + 7) & ~7;
    offsets.set(e, cursor);
    cursor += e.payload.length;
  }
  cursor = (cursor + 7) & ~7;
  const ifdOffset = cursor;
  const total = ifdOffset + 2 + entries.length * 12 + 4;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out[0] = 0x49;
  out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  const img = new DataView(out.buffer, 8, imageBytes);
  for (let k = 0; k < n * n; k += 1) img.setFloat32(k * 4, heights[k]!, true);
  for (const [e, off] of offsets) out.set(e.payload!, off);
  view.setUint16(ifdOffset, entries.length, true);
  entries.forEach((e, idx) => {
    const p = ifdOffset + 2 + idx * 12;
    view.setUint16(p, e.tag, true);
    view.setUint16(p + 2, e.type, true);
    view.setUint32(p + 4, e.count, true);
    if (e.payload) view.setUint32(p + 8, offsets.get(e)!, true);
    else if (e.type === T.SHORT) view.setUint16(p + 8, e.inline!, true);
    else view.setUint32(p + 8, e.inline!, true);
  });
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true);
  return out;
}
