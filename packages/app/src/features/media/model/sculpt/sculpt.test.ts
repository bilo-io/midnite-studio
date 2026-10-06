import { decodeMeshBin, EditableMesh, encodeMeshBin } from '@midnite/studio-shared';
import { BufferAttribute } from 'three';
import { describe, expect, it } from 'vitest';

import { SculptSession, type SculptPort } from './sculpt-client';
import { applySculptDelta, createSculptGeometry } from './sculpt-display';
import { createSculptHost } from './sculpt-host';
import type { SculptRequest, SculptResponse } from './sculpt-protocol';

/** A flat `n × n` grid in XZ, normals up — displacement along the normal is a pure +Y move. */
function gridBytes(n: number): Uint8Array {
  const positions: number[] = [];
  for (let z = 0; z <= n; z += 1) for (let x = 0; x <= n; x += 1) positions.push(x / n - 0.5, 0, z / n - 0.5);
  const at = (x: number, z: number): number => z * (n + 1) + x;
  const indices: number[] = [];
  for (let z = 0; z < n; z += 1) for (let x = 0; x < n; x += 1) indices.push(at(x, z), at(x, z + 1), at(x + 1, z), at(x + 1, z), at(x, z + 1), at(x + 1, z + 1));
  const mesh = new EditableMesh({ positions: new Float32Array(positions), indices: new Uint32Array(indices) });
  return encodeMeshBin({ positions: mesh.positions, normals: mesh.normals, indices: mesh.indices, multiresLevel: 0 });
}

/** A session wired straight to the host, replies delivered asynchronously like a real worker's. */
function session(): { session: SculptSession; transfers: Transferable[][] } {
  const transfers: Transferable[][] = [];
  const port: SculptPort = {
    onmessage: null,
    postMessage: (message: SculptRequest) => host(message),
    terminate: () => undefined,
  };
  const host = createSculptHost((message: SculptResponse, transfer) => {
    transfers.push(transfer ?? []);
    queueMicrotask(() => port.onmessage?.({ data: message } as MessageEvent<SculptResponse>));
  });
  return { session: new SculptSession(port), transfers };
}

describe('sculpt worker pipeline', () => {
  it('loads, displaces a region, and hands back only the changed vertex range as transferables', async () => {
    const { session: s, transfers } = session();
    const loaded = await s.load(gridBytes(20));
    expect(loaded).toMatchObject({ vertices: 441, triangles: 800 });
    expect(transfers.at(-1)).toHaveLength(3);

    const geometry = createSculptGeometry(loaded);
    const seen: number[] = [];
    s.onDelta((reply) => seen.push(reply.moved));
    const reply = await s.displace([0, 0, 0], 0.2, 0.1);
    expect(reply.moved).toBeGreaterThan(0);
    expect(seen).toEqual([reply.moved]);
    const delta = reply.delta!;
    expect(delta.end - delta.start).toBeLessThan(441);
    expect(transfers.at(-1)).toHaveLength(2);

    applySculptDelta(geometry, delta);
    const position = geometry.getAttribute('position') as BufferAttribute;
    expect(position.updateRanges).toEqual([{ start: delta.start * 3, count: (delta.end - delta.start) * 3 }]);
    expect((geometry.getAttribute('normal') as BufferAttribute).updateRanges).toHaveLength(1);
    // The centre vertex (10, 10) rose by the full amount; a corner did not move.
    const centre = 10 * 21 + 10;
    expect(position.getY(centre)).toBeCloseTo(0.1, 5);
    expect(position.getY(0)).toBe(0);
  });

  it('keeps every pending range until the renderer uploads them', async () => {
    const { session: s } = session();
    const geometry = createSculptGeometry(await s.load(gridBytes(20)));
    applySculptDelta(geometry, (await s.displace([-0.4, 0, -0.4], 0.1, 0.05)).delta!);
    applySculptDelta(geometry, (await s.displace([0.4, 0, 0.4], 0.1, 0.05)).delta!);
    expect((geometry.getAttribute('position') as BufferAttribute).updateRanges).toHaveLength(2);
  });

  it('raycasts against the edited surface and serializes what it holds', async () => {
    const { session: s } = session();
    await s.load(gridBytes(10));
    await s.displace([0, 0, 0], 0.3, 0.2);
    const hit = await s.raycast([0, 5, 0], [0, -1, 0]);
    expect(hit!.point[1]).toBeCloseTo(0.2, 4);
    const saved = await s.serialize();
    expect(saved).toMatchObject({ vertices: 121, triangles: 200 });
    const decoded = decodeMeshBin(saved.bytes);
    expect(Math.max(...Array.from(decoded.positions).filter((_, i) => i % 3 === 1))).toBeCloseTo(0.2, 4);
  });

  it('answers errors as rejections, not crashes', async () => {
    const { session: s } = session();
    await expect(s.displace([0, 0, 0], 1, 1)).rejects.toThrow(/No sculpt mesh/);
    await expect(s.load(new TextEncoder().encode('nope, not a mesh at all, really not'))).rejects.toThrow(/not a sculpt mesh/);
  });
});
