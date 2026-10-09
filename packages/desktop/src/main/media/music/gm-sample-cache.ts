import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  GM_PROGRAMS,
  GM_SAMPLE_BASE_URL,
  gmProgram,
  gmSampleSetUrl,
  type GmLoadResult,
  type GmProgress,
} from '@midnite/studio-shared';

/**
 * General MIDI sample cache (Phase 101 Theme D). One program's samples are downloaded the first
 * time the Editor asks for them and live under `<userData>/gm-samples/<set id>/<note>.mp3` from
 * then on, so playback works offline. Mirrors the MusicGen model download: lazy, progress over an
 * event channel, cached under `userData`, never inside the read-only app bundle.
 *
 * Upstream ships each instrument as one `<id>-mp3.js` script (a JS object of note name to a base64
 * data URI). We fetch that once, split it into per-note MP3 files in a temp directory and rename
 * the directory into place, so a half-finished download is never mistaken for a cached set.
 */

export type GmCacheDeps = {
  /** `userData`; sets land in `<directory>/gm-samples/`. */
  directory: string;
  fetch?: typeof fetch;
  baseUrl?: string;
};

export type GmEnsureResult = { ok: true } | { ok: false; error: string };

const NOTE_ENTRY = /"([A-G][b#]?-?\d)"\s*:\s*"data:audio\/[a-z0-9]+;base64,([A-Za-z0-9+/=]+)"/g;

/** Pulls `note -> base64` pairs out of an upstream sample-set script. Exported for tests. */
export function parseSampleSet(script: string): Record<string, string> {
  const notes: Record<string, string> = {};
  for (const match of script.matchAll(NOTE_ENTRY)) {
    const note = match[1];
    const data = match[2];
    if (note && data) notes[note] = data;
  }
  return notes;
}

export function createGmSampleCache(deps: GmCacheDeps) {
  const doFetch = deps.fetch ?? fetch;
  const baseUrl = deps.baseUrl ?? GM_SAMPLE_BASE_URL;
  const root = join(deps.directory, 'gm-samples');
  const inflight = new Map<number, Promise<GmEnsureResult>>();

  const dirFor = (program: number): string | null => {
    const info = gmProgram(program);
    return info ? join(root, info.id) : null;
  };

  async function isCached(program: number): Promise<boolean> {
    const dir = dirFor(program);
    if (!dir) return false;
    try {
      return (await readdir(dir)).some((name) => name.endsWith('.mp3'));
    } catch {
      return false;
    }
  }

  async function status(): Promise<{ cached: number[] }> {
    const cached: number[] = [];
    for (const info of GM_PROGRAMS) if (await isCached(info.program)) cached.push(info.program);
    return { cached };
  }

  async function download(program: number, emit: (event: GmProgress) => void): Promise<GmEnsureResult> {
    const url = gmSampleSetUrl(program, baseUrl);
    const dir = dirFor(program);
    if (!url || !dir) return { ok: false, error: `Unknown GM program ${program}` };
    const fail = (error: string): GmEnsureResult => {
      emit({ program, phase: 'failed', fraction: 0, message: error });
      return { ok: false, error };
    };
    try {
      emit({ program, phase: 'download', fraction: 0 });
      const response = await doFetch(url);
      if (!response.ok) return fail(`Sample download failed (HTTP ${response.status})`);
      const total = Number(response.headers.get('content-length') ?? 0);
      const chunks: Uint8Array[] = [];
      let received = 0;
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) emit({ program, phase: 'download', fraction: Math.min(0.95, received / total) });
        }
      } else {
        chunks.push(new Uint8Array(await response.arrayBuffer()));
      }
      const script = Buffer.concat(chunks).toString('utf8');
      const notes = parseSampleSet(script);
      if (Object.keys(notes).length === 0) return fail('Sample set was empty or in an unexpected format');
      const tmp = `${dir}.partial-${process.pid}`;
      await rm(tmp, { recursive: true, force: true });
      await mkdir(tmp, { recursive: true });
      await Promise.all(
        Object.entries(notes).map(([note, base64]) => writeFile(join(tmp, `${note}.mp3`), Buffer.from(base64, 'base64'))),
      );
      await rm(dir, { recursive: true, force: true });
      await rename(tmp, dir);
      emit({ program, phase: 'ready', fraction: 1 });
      return { ok: true };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }

  /** Downloads a program's samples unless cached; concurrent calls share one download. */
  function ensure(program: number, emit: (event: GmProgress) => void): Promise<GmEnsureResult> {
    const running = inflight.get(program);
    if (running) return running;
    const task = (async () => {
      if (await isCached(program)) {
        emit({ program, phase: 'ready', fraction: 1 });
        return { ok: true } as const;
      }
      return download(program, emit);
    })().finally(() => inflight.delete(program));
    inflight.set(program, task);
    return task;
  }

  /** Reads a cached program; `null` when it is not on disk. */
  async function load(program: number): Promise<GmLoadResult | null> {
    const dir = dirFor(program);
    if (!dir || !(await isCached(program))) return null;
    const notes: Record<string, string> = {};
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.mp3')) continue;
      notes[name.slice(0, -4)] = (await readFile(join(dir, name))).toString('base64');
    }
    return { program, notes };
  }

  return { status, ensure, load };
}
