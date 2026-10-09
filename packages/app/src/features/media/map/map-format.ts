export type MapUnits = 'metric' | 'imperial';

const M_PER_MI = 1609.344;
const M_PER_FT = 0.3048;

/** Metric: under 1 000 m in metres, else km to 2 dp. Imperial: under 0.1 mi in feet, else miles to 2 dp. */
export function formatDistance(m: number, units: MapUnits): string {
  if (units === 'imperial') {
    const mi = m / M_PER_MI;
    return mi < 0.1 ? `${Math.round(m / M_PER_FT).toLocaleString('en-US')} ft` : `${mi.toFixed(2)} mi`;
  }
  return m < 1000 ? `${Math.round(m).toLocaleString('en-US')} m` : `${(m / 1000).toFixed(2)} km`;
}

/** Metric: m² under 10 000, ha under 1 km², else km². Imperial: ft² under an acre, acres under a mi², else mi². */
export function formatArea(m2: number, units: MapUnits): string {
  if (units === 'imperial') {
    const acres = m2 / 4046.8564224;
    if (acres < 1) return `${Math.round(m2 / (M_PER_FT * M_PER_FT)).toLocaleString('en-US')} ft²`;
    if (acres < 640) return `${acres.toFixed(2)} ac`;
    return `${(m2 / (M_PER_MI * M_PER_MI)).toFixed(2)} mi²`;
  }
  if (m2 < 10_000) return `${Math.round(m2).toLocaleString('en-US')} m²`;
  if (m2 < 1_000_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${(m2 / 1_000_000).toFixed(2)} km²`;
}
