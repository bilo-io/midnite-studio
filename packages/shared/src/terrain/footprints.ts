import type { TerrainBuilding, TerrainSpec } from '../media-terrain';
import type { Heightfield } from './heightfield';
import { morphClose, morphOpen } from './morphology';
import { createRng } from './noise';

export type FootprintExtractionResult = {
  buildings: TerrainBuilding[];
  warnings: string[];
};

/**
 * Extracts vector building footprints from the `building` land-cover class (Phase 105 Theme G).
 *
 * Pipeline:
 * 1. Binary mask of building class (6).
 * 2. 3×3 open then close morphology.
 * 3. Moore-neighbor contour tracing for outer boundaries.
 * 4. Douglas-Peucker simplification (ε = 1 px).
 * 5. Collinear point merging and right-angle orthogonalization (within snapToleranceDeg).
 * 6. Minimum area filtering (`minAreaM2`).
 * 7. Elevation sampling for baseY and seeded height extrusion.
 */
export function extractFootprints(
  landcover: Uint8Array,
  lcRes: number,
  worldSize: number,
  field: Heightfield,
  opts: TerrainSpec['buildings'],
): FootprintExtractionResult {
  const warnings: string[] = [];
  const rng = createRng(opts.seed ?? 1);

  // 1. Extract building class mask (class 6 is 'building')
  const mask = new Uint8Array(lcRes * lcRes);
  for (let i = 0; i < mask.length; i += 1) {
    if (landcover[i] === 6) mask[i] = 1;
  }

  // 2. 3×3 open then close
  const cleaned = morphClose(morphOpen(mask, lcRes, lcRes), lcRes, lcRes);

  // 3. Trace contours of connected components
  const contours = traceContours(cleaned, lcRes, lcRes);

  const snapToleranceDeg = opts.snapToleranceDeg ?? 12;
  const snapToleranceRad = (snapToleranceDeg * Math.PI) / 180;
  const minAreaM2 = opts.minAreaM2 ?? 20;
  const [minH, maxH] = opts.height;
  const scaleByArea = opts.scaleByArea ?? true;

  const buildings: TerrainBuilding[] = [];

  for (const contour of contours) {
    if (contour.length < 3) continue;

    // 4. Douglas-Peucker simplification (ε = 1.0 px)
    let simplified = douglasPeuckerPolygon(contour, 1.0);
    if (simplified.length < 3) continue;

    // Merge nearly collinear vertices (< 10°)
    simplified = mergeCollinear(simplified, (10 * Math.PI) / 180);
    if (simplified.length < 3) continue;

    // 5. Right-angle snap / orthogonalization
    const snapped = snapRightAngles(simplified, snapToleranceRad);
    if (snapped.length < 3) continue;

    // Convert pixel coordinates to world metres (origin at center)
    const polygon: [number, number][] = snapped.map(([px, py]) => [
      (px / lcRes - 0.5) * worldSize,
      (py / lcRes - 0.5) * worldSize,
    ]);

    // 6. Area filter
    const areaM2 = polygonArea(polygon);
    if (areaM2 < minAreaM2) continue;

    // Sample terrain elevation at polygon vertices to find mean baseY
    let sumY = 0;
    for (const [wx, wz] of polygon) {
      sumY += sampleHeight(field, wx, wz);
    }
    const baseY = sumY / polygon.length;

    // Height extrusion
    const baseExtrusion = minH + rng() * (maxH - minH);
    const areaScale = scaleByArea
      ? Math.max(0.75, Math.min(1.5, Math.sqrt(areaM2 / 200)))
      : 1.0;
    const height = baseExtrusion * areaScale;

    buildings.push({
      polygon,
      baseY: Math.round(baseY * 100) / 100,
      height: Math.round(height * 100) / 100,
    });
  }

  return { buildings, warnings };
}

/** Moore-neighbor outer boundary tracing for all foreground regions in a binary mask. */
export function traceContours(
  mask: Uint8Array,
  w: number,
  h: number,
): [number, number][][] {
  const visited = new Uint8Array(w * h);
  const contours: [number, number][][] = [];

  // Moore neighborhood offsets in clockwise order, starting from North-West
  const dx = [-1, 0, 1, 1, 1, 0, -1, -1];
  const dy = [-1, -1, -1, 0, 1, 1, 1, 0];

  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const idx = y * w + x;
      // Start of a new component (must be foreground, unvisited, and entered from background to left)
      if (mask[idx] === 1 && visited[idx] === 0 && mask[idx - 1] === 0) {
        const ring: [number, number][] = [];
        let cx = x;
        let cy = y;
        let enterDir = 6; // Entered from West (x-1, y)

        const startX = cx;
        const startY = cy;
        let startEnterDir = enterDir;

        ring.push([cx, cy]);
        visited[cy * w + cx] = 1;

        let steps = 0;
        const maxSteps = w * h;

        while (steps < maxSteps) {
          steps += 1;
          // Check 8 neighbors in clockwise order starting from (enterDir + 1)
          let nextX = -1;
          let nextY = -1;
          let nextEnterDir = -1;

          for (let i = 0; i < 8; i += 1) {
            const dir = (enterDir + 1 + i) % 8;
            const nx = cx + dx[dir]!;
            const ny = cy + dy[dir]!;

            if (nx >= 0 && nx < w && ny >= 0 && ny < h && mask[ny * w + nx] === 1) {
              nextX = nx;
              nextY = ny;
              // Backtrack direction from neighbor to current
              nextEnterDir = (dir + 4) % 8;
              break;
            }
          }

          if (nextX === -1) {
            // Isolated single pixel
            break;
          }

          cx = nextX;
          cy = nextY;
          enterDir = nextEnterDir;

          if (cx === startX && cy === startY && ring.length > 2) {
            break;
          }

          ring.push([cx, cy]);
          visited[cy * w + cx] = 1;
        }

        // Mark all pixels enclosed in this row or component to prevent duplicate outer loops
        floodFillInterior(mask, visited, w, h, x, y);

        if (ring.length >= 3) {
          contours.push(ring);
        }
      }
    }
  }

  return contours;
}

/** Simple scanline fill to mark visited interior pixels of a component */
function floodFillInterior(
  mask: Uint8Array,
  visited: Uint8Array,
  w: number,
  h: number,
  startX: number,
  startY: number,
): void {
  const stack: [number, number][] = [[startX, startY]];
  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    const idx = cy * w + cx;
    visited[idx] = 1;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const nIdx = ny * w + nx;
        if (mask[nIdx] === 1 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          stack.push([nx, ny]);
        }
      }
    }
  }
}

/** Douglas-Peucker polygon simplification */
export function douglasPeuckerPolygon(
  points: [number, number][],
  epsilon: number,
): [number, number][] {
  if (points.length <= 3) return points;

  // Find the point farthest from point 0 to split the polygon into two halves
  let maxDist = 0;
  let splitIdx = 0;
  const [x0, y0] = points[0]!;

  for (let i = 1; i < points.length; i += 1) {
    const [x, y] = points[i]!;
    const distSq = (x - x0) ** 2 + (y - y0) ** 2;
    if (distSq > maxDist) {
      maxDist = distSq;
      splitIdx = i;
    }
  }

  if (splitIdx === 0 || splitIdx === points.length - 1) {
    splitIdx = Math.floor(points.length / 2);
  }

  const half1 = points.slice(0, splitIdx + 1);
  const half2 = points.slice(splitIdx).concat([points[0]!]);

  const simp1 = douglasPeucker(half1, epsilon);
  const simp2 = douglasPeucker(half2, epsilon);

  // Combine, dropping duplicates at junctions
  return simp1.slice(0, -1).concat(simp2.slice(0, -1));
}

function douglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const [x1, y1] = points[0]!;
  const [x2, y2] = points[points.length - 1]!;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i]!;
    let dist = 0;
    if (lenSq === 0) {
      dist = Math.hypot(px - x1, py - y1);
    } else {
      const num = Math.abs(dy * px - dx * py + x2 * y1 - y2 * x1);
      dist = num / Math.sqrt(lenSq);
    }

    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const rec1 = douglasPeucker(points.slice(0, index + 1), epsilon);
    const rec2 = douglasPeucker(points.slice(index), epsilon);
    return rec1.slice(0, -1).concat(rec2);
  }

  return [points[0]!, points[points.length - 1]!];
}

/** Merges consecutive vertices whose angle deviation is less than maxAngleRad (removes collinear points). */
export function mergeCollinear(
  polygon: [number, number][],
  maxAngleRad: number,
): [number, number][] {
  if (polygon.length <= 3) return polygon;

  let current = polygon;
  let changed = true;

  while (changed && current.length > 3) {
    changed = false;
    const n = current.length;
    const next: [number, number][] = [];

    for (let i = 0; i < n; i += 1) {
      const prev = current[(i - 1 + n) % n]!;
      const curr = current[i]!;
      const nxt = current[(i + 1) % n]!;

      const v1x = curr[0] - prev[0];
      const v1y = curr[1] - prev[1];
      const v2x = nxt[0] - curr[0];
      const v2y = nxt[1] - curr[1];

      const len1 = Math.hypot(v1x, v1y);
      const len2 = Math.hypot(v2x, v2y);

      if (len1 < 1e-4 || len2 < 1e-4) {
        changed = true;
        continue;
      }

      const dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
      const clampedDot = Math.max(-1, Math.min(1, dot));
      const angle = Math.acos(clampedDot);

      // If angle is close to 0 (straight line), skip current vertex
      if (angle < maxAngleRad) {
        changed = true;
      } else {
        next.push(curr);
      }
    }

    current = next;
  }

  return current;
}

/**
 * Snaps corners of a polygon to right angles (90° / 270°) if they are within tolerance.
 * Uses principal direction estimation followed by orthogonal alignment.
 */
export function snapRightAngles(
  polygon: [number, number][],
  toleranceRad: number,
): [number, number][] {
  const n = polygon.length;
  if (n < 4) return polygon;

  // 1. Calculate dominant orientation (weighted circular mean modulo 90°)
  let sumSin = 0;
  let sumCos = 0;
  let totalLength = 0;

  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % n]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const angle = Math.atan2(dy, dx);
    // Multiply angle by 4 to map 90° intervals to a single period
    sumSin += len * Math.sin(4 * angle);
    sumCos += len * Math.cos(4 * angle);
    totalLength += len;
  }

  if (totalLength < 1e-4) return polygon;

  const theta0 = Math.atan2(sumSin, sumCos) / 4;

  // 2. Rotate polygon by -theta0 into axis-aligned space
  const cosT = Math.cos(-theta0);
  const sinT = Math.sin(-theta0);
  const rot = polygon.map(([x, y]) => [
    x * cosT - y * sinT,
    x * sinT + y * cosT,
  ] as [number, number]);

  // Snap shallow notches/indentations within outer facades
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of rot) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const notchThresh = Math.max(3.5, 0.1 * Math.min(maxX - minX, maxY - minY));

  const notchSnapped = rot.map(([x, y]) => {
    let nx = x;
    let ny = y;
    if (Math.abs(x - minX) <= notchThresh) nx = minX;
    else if (Math.abs(x - maxX) <= notchThresh) nx = maxX;
    if (Math.abs(y - minY) <= notchThresh) ny = minY;
    else if (Math.abs(y - maxY) <= notchThresh) ny = maxY;
    return [nx, ny] as [number, number];
  });

  const mergedRot = mergeCollinear(notchSnapped, toleranceRad);

  // If quadrilateral with 4 corners, fit exact rectangle
  let resRot = mergedRot;
  if (mergedRot.length === 4) {
    resRot = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
  }

  // 3. Rotate back by +theta0
  const cosBack = Math.cos(theta0);
  const sinBack = Math.sin(theta0);
  const out = resRot.map(([x, y]) => [
    x * cosBack - y * sinBack,
    x * sinBack + y * cosBack,
  ] as [number, number]);

  return mergeCollinear(out, toleranceRad);
}

/** Polygon area in square metres using Shoelace formula */
export function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = polygon[i]!;
    const [x2, y2] = polygon[(i + 1) % n]!;
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/** Samples bilinear elevation from heightfield */
function sampleHeight(field: Heightfield, wx: number, wz: number): number {
  const { resolution, worldSize, heights } = field;
  const u = (wx + worldSize / 2) / worldSize;
  const v = (wz + worldSize / 2) / worldSize;
  const gx = Math.max(0, Math.min(resolution - 1, u * (resolution - 1)));
  const gz = Math.max(0, Math.min(resolution - 1, v * (resolution - 1)));

  const x0 = Math.floor(gx);
  const z0 = Math.floor(gz);
  const x1 = Math.min(resolution - 1, x0 + 1);
  const z1 = Math.min(resolution - 1, z0 + 1);
  const fx = gx - x0;
  const fz = gz - z0;

  const h00 = heights[z0 * resolution + x0]!;
  const h10 = heights[z0 * resolution + x1]!;
  const h01 = heights[z1 * resolution + x0]!;
  const h11 = heights[z1 * resolution + x1]!;

  return (1 - fx) * (1 - fz) * h00 + fx * (1 - fz) * h10 + (1 - fx) * fz * h01 + fx * fz * h11;
}
