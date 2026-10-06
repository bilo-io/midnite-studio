import type { RemeshOptions, SdfTree } from '@midnite/studio-shared';

import type { SculptLoaded, SculptRequest, SculptResponse, Vec3 } from './sculpt-protocol';

/**
 * The editor's handle on a sculpt worker (Phase 104 Theme A): request/reply by id over a `Worker`-shaped
 * port, so a test can hand it the host directly. Deltas resolve their request and are also fanned out to
 * `onDelta`, which is where the display applies them.
 */
export type SculptPort = {
  postMessage: (message: SculptRequest, transfer: Transferable[]) => void;
  onmessage: ((event: MessageEvent<SculptResponse>) => void) | null;
  terminate: () => void;
};

type Pending = { resolve: (response: SculptResponse) => void; reject: (error: Error) => void };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class SculptSession {
  private next = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly deltaListeners = new Set<(response: Extract<SculptResponse, { type: 'delta' }>) => void>();

  constructor(private readonly port: SculptPort) {
    port.onmessage = (event) => {
      const response = event.data;
      if (response.type === 'delta') for (const listener of this.deltaListeners) listener(response);
      const waiting = this.pending.get(response.id);
      if (!waiting) return;
      this.pending.delete(response.id);
      if (response.type === 'error') waiting.reject(new Error(response.message));
      else waiting.resolve(response);
    };
  }

  private request<T extends SculptResponse['type']>(message: DistributiveOmit<SculptRequest, 'id'>, transfer: Transferable[] = []): Promise<Extract<SculptResponse, { type: T }>> {
    const id = this.next;
    this.next += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (response: SculptResponse) => void, reject });
      this.port.postMessage({ ...message, id } as SculptRequest, transfer);
    });
  }

  /** Hands the worker a `.mesh.bin` (the buffer is transferred, so the caller's copy is emptied). */
  async load(bytes: Uint8Array): Promise<SculptLoaded> {
    const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
    const buffer = owned.buffer as ArrayBuffer;
    return (await this.request<'loaded'>({ type: 'load', bytes: buffer }, [buffer])).mesh;
  }

  async displace(center: Vec3, radius: number, amount: number): Promise<Extract<SculptResponse, { type: 'delta' }>> {
    return this.request<'delta'>({ type: 'displace', center, radius, amount });
  }

  async raycast(origin: Vec3, dir: Vec3): Promise<Extract<SculptResponse, { type: 'hit' }>['hit']> {
    return (await this.request<'hit'>({ type: 'raycast', origin, dir })).hit;
  }

  /** The live mesh as `.mesh.bin` bytes, ready for `window.midniteStudio.media.model.mesh.write`. */
  async serialize(): Promise<{ bytes: Uint8Array; vertices: number; triangles: number }> {
    const reply = await this.request<'serialized'>({ type: 'serialize' });
    return { bytes: new Uint8Array(reply.bytes), vertices: reply.vertices, triangles: reply.triangles };
  }

  /** Voxel remesh in the worker; the input buffers are transferred. */
  async remesh(soup: { positions: Float64Array; indices: Uint32Array; groups: Uint16Array }, options: RemeshOptions): Promise<Extract<SculptResponse, { type: 'remeshed' }>> {
    return this.request<'remeshed'>({ type: 'remesh', ...soup, options }, [soup.positions.buffer, soup.indices.buffer, soup.groups.buffer]);
  }

  /** Bakes a signed-distance tree in the worker (Theme C). */
  async sdfBake(tree: SdfTree, resolution: number): Promise<Extract<SculptResponse, { type: 'sdfBaked' }>> {
    return this.request<'sdfBaked'>({ type: 'sdfBake', tree, resolution });
  }

  onDelta(listener: (response: Extract<SculptResponse, { type: 'delta' }>) => void): () => void {
    this.deltaListeners.add(listener);
    return () => void this.deltaListeners.delete(listener);
  }

  dispose(): void {
    for (const waiting of this.pending.values()) waiting.reject(new Error('The sculpt session was closed.'));
    this.pending.clear();
    this.deltaListeners.clear();
    this.port.terminate();
  }
}

/**
 * A session on a fresh worker. The worker is inlined (`?worker&inline`) for the same reason Monaco's
 * are — see `vite.config.ts`: the packaged renderer's opaque `file://` origin cannot start a worker from
 * a `file:` URL — and imported lazily, so it stays out of the entry chunk until sculpting starts.
 */
export async function startSculptSession(): Promise<SculptSession> {
  const { default: SculptWorker } = await import('./sculpt.worker?worker&inline');
  return new SculptSession(new SculptWorker() as unknown as SculptPort);
}
