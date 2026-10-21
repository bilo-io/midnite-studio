/**
 * WGS84 geodesy: Vincenty's inverse and direct formulae, with a spherical fallback when the inverse
 * fails to converge (near-antipodal points only). No `@turf/*` — turf is spherical, `shared` is
 * zod-only, and main (`map_measure`) and the renderer's tools need the same function.
 */
export const WGS84_A = 6_378_137;
export const WGS84_F = 1 / 298.257223563;
export const WGS84_B = WGS84_A * (1 - WGS84_F);
/** Mean radius, used only by the spherical fallback. */
export const EARTH_MEAN_RADIUS_M = 6_371_008.8;

const DEG = Math.PI / 180;
const MAX_ITERATIONS = 200;
const EPS = 1e-12;

export type LonLat = [number, number];

export interface InverseResult {
  distanceM: number;
  /** Forward azimuth at `a`, degrees clockwise from north, [0, 360). */
  azi1: number;
  /** Forward azimuth at `b`, degrees clockwise from north, [0, 360). */
  azi2: number;
}

const norm360 = (deg: number): number => ((deg % 360) + 360) % 360;

function sphericalInverse(a: LonLat, b: LonLat): InverseResult {
  const phi1 = a[1] * DEG;
  const phi2 = b[1] * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h =
    Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const y1 = Math.sin(dLon) * Math.cos(phi2);
  const x1 = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const y2 = -Math.sin(dLon) * Math.cos(phi1);
  const x2 = Math.cos(phi2) * Math.sin(phi1) - Math.sin(phi2) * Math.cos(phi1) * Math.cos(dLon);
  return {
    distanceM: EARTH_MEAN_RADIUS_M * c,
    azi1: norm360((Math.atan2(y1, x1) * 180) / Math.PI),
    azi2: norm360((Math.atan2(y2, x2) * 180) / Math.PI + 180),
  };
}

export function inverse(a: LonLat, b: LonLat): InverseResult {
  if (a[0] === b[0] && a[1] === b[1]) return { distanceM: 0, azi1: 0, azi2: 0 };
  const f = WGS84_F;
  const L = (b[0] - a[0]) * DEG;
  const U1 = Math.atan((1 - f) * Math.tan(a[1] * DEG));
  const U2 = Math.atan((1 - f) * Math.tan(b[1] * DEG));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0;
  let cosSigma = 0;
  let sigma = 0;
  let cosSqAlpha = 0;
  let cos2SigmaM = 0;
  let converged = false;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
    if (sinSigma === 0) return { distanceM: 0, azi1: 0, azi2: 0 };
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha * sinAlpha;
    cos2SigmaM = cosSqAlpha !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha : 0;
    const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
    const prev = lambda;
    lambda =
      L +
      (1 - C) *
        f *
        sinAlpha *
        (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - prev) < EPS) {
      converged = true;
      break;
    }
    if (!Number.isFinite(lambda) || Math.abs(lambda) > Math.PI * 1.5) break;
  }
  if (!converged) return sphericalInverse(a, b);

  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    B *
    sinSigma *
    (cos2SigmaM +
      (B / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
          (B / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma * sinSigma) *
            (-3 + 4 * cos2SigmaM * cos2SigmaM)));
  const distanceM = WGS84_B * A * (sigma - deltaSigma);
  const sinLambda = Math.sin(lambda);
  const cosLambda = Math.cos(lambda);
  const azi1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda);
  const azi2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda);
  return {
    distanceM,
    azi1: norm360((azi1 * 180) / Math.PI),
    azi2: norm360((azi2 * 180) / Math.PI),
  };
}

/** The point `distM` metres from `p` along azimuth `aziDeg` (degrees clockwise from north). */
export function direct(p: LonLat, aziDeg: number, distM: number): LonLat {
  if (distM === 0) return [p[0], p[1]];
  const f = WGS84_F;
  const alpha1 = aziDeg * DEG;
  const sinAlpha1 = Math.sin(alpha1);
  const cosAlpha1 = Math.cos(alpha1);
  const tanU1 = (1 - f) * Math.tan(p[1] * DEG);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosAlpha1);
  const sinAlpha = cosU1 * sinAlpha1;
  const cosSqAlpha = 1 - sinAlpha * sinAlpha;
  const uSq = (cosSqAlpha * (WGS84_A * WGS84_A - WGS84_B * WGS84_B)) / (WGS84_B * WGS84_B);
  const A = 1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const B = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));

  let sigma = distM / (WGS84_B * A);
  let cos2SigmaM = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma);
    sinSigma = Math.sin(sigma);
    cosSigma = Math.cos(sigma);
    const deltaSigma =
      B *
      sinSigma *
      (cos2SigmaM +
        (B / 4) *
          (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
            (B / 6) *
              cos2SigmaM *
              (-3 + 4 * sinSigma * sinSigma) *
              (-3 + 4 * cos2SigmaM * cos2SigmaM)));
    const prev = sigma;
    sigma = distM / (WGS84_B * A) + deltaSigma;
    if (Math.abs(sigma - prev) < EPS) break;
  }
  sinSigma = Math.sin(sigma);
  cosSigma = Math.cos(sigma);
  cos2SigmaM = Math.cos(2 * sigma1 + sigma);
  const x = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1;
  const phi2 = Math.atan2(
    sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.hypot(sinAlpha, x),
  );
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1);
  const C = (f / 16) * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha));
  const L =
    lambda -
    (1 - C) *
      f *
      sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
  let lon = p[0] + (L * 180) / Math.PI;
  lon = ((((lon + 180) % 360) + 360) % 360) - 180;
  return [lon, (phi2 * 180) / Math.PI];
}

/** Geodesic length of a path, metres. */
export function pathLengthM(points: readonly LonLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += inverse(points[i - 1]!, points[i]!).distanceM;
  return total;
}
