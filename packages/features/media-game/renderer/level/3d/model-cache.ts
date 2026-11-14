/**
 * Lazy model loading for the 3D view (Phase 136 Theme F). A model loads the first time an object that uses it is in
 * range at full detail, is shared by every object using it (each draws a clone, which shares geometry and
 * materials), and is disposed once nothing has asked for it for {@link MODEL_DISPOSE_AFTER_S}. A model that fails
 * stays failed for the session: its objects draw as boxes. Generic over the loaded value so it tests without three.
 */
import { MODEL_DISPOSE_AFTER_S } from './level-lod';

type Entry<T> = { state: 'loading' } | { state: 'ready'; value: T; usedAt: number } | { state: 'failed'; error: string };

export type ModelCacheOptions<T> = {
  load: (name: string) => Promise<T>;
  dispose: (value: T) => void;
  now?: () => number;
  disposeAfterMs?: number;
  /** Called when a model finishes loading (or fails), so the scene re-culls and swaps the box for it. */
  onChange?: () => void;
};

export class ModelCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly now: () => number;
  private readonly disposeAfterMs: number;
  private closed = false;

  constructor(private readonly options: ModelCacheOptions<T>) {
    this.now = options.now ?? (() => performance.now());
    this.disposeAfterMs = options.disposeAfterMs ?? MODEL_DISPOSE_AFTER_S * 1000;
  }

  /** The loaded model, marking it used; starts a load the first time and answers `null` until it is ready. */
  request(name: string): T | null {
    const entry = this.entries.get(name);
    if (!entry) {
      this.start(name);
      return null;
    }
    if (entry.state !== 'ready') return null;
    entry.usedAt = this.now();
    return entry.value;
  }

  failed(name: string): boolean {
    return this.entries.get(name)?.state === 'failed';
  }

  /** Dispose every ready model nobody requested for the grace period; answers the names disposed. */
  sweep(): string[] {
    const cutoff = this.now() - this.disposeAfterMs;
    const gone: string[] = [];
    for (const [name, entry] of this.entries) {
      if (entry.state === 'ready' && entry.usedAt < cutoff) {
        this.options.dispose(entry.value);
        this.entries.delete(name);
        gone.push(name);
      }
    }
    return gone;
  }

  get loaded(): number {
    let n = 0;
    for (const entry of this.entries.values()) if (entry.state === 'ready') n++;
    return n;
  }

  /** Dispose everything (the view unmounted); loads still in flight are dropped when they land. */
  close(): void {
    this.closed = true;
    for (const entry of this.entries.values()) if (entry.state === 'ready') this.options.dispose(entry.value);
    this.entries.clear();
  }

  private start(name: string): void {
    this.entries.set(name, { state: 'loading' });
    this.options.load(name).then(
      (value) => {
        if (this.closed || this.entries.get(name)?.state !== 'loading') {
          this.options.dispose(value);
          return;
        }
        this.entries.set(name, { state: 'ready', value, usedAt: this.now() });
        this.options.onChange?.();
      },
      (error: unknown) => {
        if (this.closed) return;
        this.entries.set(name, { state: 'failed', error: error instanceof Error ? error.message : String(error) });
        this.options.onChange?.();
      },
    );
  }
}
