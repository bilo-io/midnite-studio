import { randomUUID } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAP_CAPTURE_BUSY,
  MAP_CAPTURE_CANCELLED,
  captureFolderName,
  expandMapTemplate,
  failure,
  map,
  mapSource,
  ok,
  type GitOpResult,
  type MapCaptureFile,
  type MapCaptureProgressEvent,
  type MapCaptureRequest,
  type MapCaptureResult,
  type MapCaptureStage,
  type MapSource,
} from '@midnite/studio-shared';

import { decodePng } from '../png/png-codec';
import type { CaptureBroker } from './capture-broker';

/**
 * Orchestrates a Capture for Terrain (Phase 108 Theme D): plan the DEM tiles, fetch them through the
 * shared tile fetcher (so they are cached and rate-limited like display tiles), decode them, stream
 * them to the `map-capture-worker`, and move the finished folder into `captures/<name>/`.
 *
 * One capture at a time. Files are written to `captures/.tmp-<id>/` and renamed into place only on
 * success, so a cancel or a failure leaves nothing. Never throws across the boundary — every exit is
 * a `GitOpResult`.
 */
export type DecodedTile = { width: number; height: number; rgba: Uint8Array };

type FetchLike = {
  fetch: (
    key: string,
    url: string,
    opts?: { signal?: AbortSignal; cache?: boolean },
  ) => Promise<{ ok: true; bytes: Uint8Array } | { ok: false; status: number | 'network' | 'aborted'; message: string }>;
};

export type CaptureServiceDeps = {
  /** The map tab root for a repo (`<repo>/.midnite/media/map`), or null. */
  rootFor: (repoId: string) => Promise<string | null>;
  fetcher: FetchLike;
  readKey: () => Promise<string | null>;
  /** Decodes JPEG/WebP (PNG is handled here); `nativeImage` lives behind this in main. */
  nativeDecode: (bytes: Uint8Array) => Promise<DecodedTile | null>;
  broker: CaptureBroker;
  onChanged: (repoId: string) => void;
  emitProgress: (event: MapCaptureProgressEvent) => void;
  now?: () => Date;
  newId?: () => string;
  log?: (line: string) => void;
  /** How many tile fetches run at once (the fetcher separately caps per host). */
  fetchConcurrency?: number;
};

export const DEFAULT_DEM_SOURCE = 'aws-terrarium' as const;

const CLASS_OK = (s: MapSource) => s.kind === 'dem' && (s.encoding === 'terrarium' || s.encoding === 'terrain-rgb');

/** PNG via the in-tree codec (the only 16-bit-safe path), everything else via `nativeDecode`. */
export async function decodeTileBytes(
  bytes: Uint8Array,
  nativeDecode: CaptureServiceDeps['nativeDecode'],
): Promise<DecodedTile | null> {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    const decoded = decodePng(bytes);
    if (decoded.ok && decoded.image.bitDepth === 8 && (decoded.image.channels === 4 || decoded.image.channels === 3)) {
      const { width, height, channels } = decoded.image;
      const data = decoded.image.data as Uint8Array;
      if (channels === 4) return { width, height, rgba: data };
      const rgba = new Uint8Array(width * height * 4);
      for (let i = 0; i < width * height; i += 1) {
        rgba[i * 4] = data[i * 3]!;
        rgba[i * 4 + 1] = data[i * 3 + 1]!;
        rgba[i * 4 + 2] = data[i * 3 + 2]!;
        rgba[i * 4 + 3] = 255;
      }
      return { width, height, rgba };
    }
  }
  return nativeDecode(bytes);
}

export function createCaptureService(deps: CaptureServiceDeps) {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? randomUUID;
  const log = deps.log ?? (() => undefined);
  const concurrency = deps.fetchConcurrency ?? 24;
  let running: { id: string; abort: AbortController; cancel: () => void } | null = null;

  async function capture(req: MapCaptureRequest): Promise<GitOpResult<MapCaptureResult>> {
    if (running) return failure(MAP_CAPTURE_BUSY);
    const captureId = req.captureId ?? newId();
    const abort = new AbortController();
    const state = { id: captureId, abort, cancel: () => undefined as void };
    running = state;
    const progress = (stage: MapCaptureStage, fraction: number) =>
      deps.emitProgress({ captureId, stage, fraction: Math.max(0, Math.min(1, fraction)) });
    let tmpDir: string | null = null;
    try {
      const source = mapSource(req.demSource ?? DEFAULT_DEM_SOURCE);
      if (!CLASS_OK(source)) return failure(`${source.label} is not an elevation source.`);
      if (!source.exportable)
        return failure(`${source.label} is display-only: ${source.exportReason ?? source.licence}`);
      const key = await deps.readKey();
      if (source.requiresKey && !key) return failure('Add a MapTiler key in Settings ▸ Media.');
      const root = await deps.rootFor(req.repoId);
      if (!root) return failure('Open a repository to capture into.');
      const frame = { center: req.center, sideM: req.sideM };
      const encoding = source.encoding === 'terrarium' ? 'terrarium' : 'terrain-rgb';

      progress('plan', 0);
      const plan = map.chooseCaptureZoom(source, frame, req.size);
      const tiles = map.listTiles(plan);
      log(`map capture ${captureId}: ${source.id} z${plan.z}, ${tiles.length} tiles, ${req.size}²`);

      const projectDir = join(root, req.project);
      const capturesDir = join(projectDir, 'captures');
      tmpDir = join(capturesDir, `.tmp-${captureId}`);
      await mkdir(tmpDir, { recursive: true });
      progress('plan', 1);

      const handle = deps.broker.begin(
        { id: captureId, frame, size: req.size, plan, encoding, outDir: tmpDir },
        (fraction) => progress('encode', fraction),
      );
      state.cancel = () => handle.cancel();

      // --- fetch ----------------------------------------------------------------------------------
      let next = 0;
      let done = 0;
      let fatal: string | null = null;
      const ext = source.encoding === 'terrarium' ? 'png' : 'webp';
      const fetchOne = async (t: { x: number; y: number }) => {
        const url = expandMapTemplate(source.template ?? '', { z: plan.z, x: t.x, y: t.y, key });
        const got = await deps.fetcher.fetch(`${source.id}/${plan.z}/${t.x}/${t.y}.${ext}`, url, { signal: abort.signal });
        if (!got.ok) {
          // A 404 is an empty tile (ocean at depth): the mosaic leaves it NaN and the grid fills it.
          if (got.status === 404) return;
          if (got.status !== 'aborted') fatal ??= `Elevation tiles could not be fetched (${got.status === 'network' ? 'network error' : `HTTP ${got.status}`}).`;
          return;
        }
        const decoded = await decodeTileBytes(got.bytes, deps.nativeDecode);
        if (!decoded) {
          fatal ??= 'An elevation tile could not be decoded.';
          return;
        }
        handle.addTile(t.x, t.y, decoded.width, decoded.height, decoded.rgba);
      };
      const lane = async () => {
        while (!abort.signal.aborted && fatal === null) {
          const index = next;
          next += 1;
          const t = tiles[index];
          if (!t) return;
          await fetchOne(t);
          done += 1;
          progress('dem', done / tiles.length);
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, lane));

      if (abort.signal.aborted) {
        await cleanup(tmpDir);
        return failure(MAP_CAPTURE_CANCELLED);
      }
      if (fatal) {
        handle.cancel();
        await cleanup(tmpDir);
        return failure(fatal);
      }

      // --- resample + encode (worker) ---------------------------------------------------------------
      progress('encode', 0);
      const encoded = await handle.finish();
      if (!encoded.ok) {
        await cleanup(tmpDir);
        return failure(abort.signal.aborted ? MAP_CAPTURE_CANCELLED : encoded.message);
      }
      if (abort.signal.aborted) {
        await cleanup(tmpDir);
        return failure(MAP_CAPTURE_CANCELLED);
      }

      // --- write the sidecars and move into place ---------------------------------------------------
      const name = captureFolderName({ center: req.center, place: req.place }, now());
      const attributions = [source.attribution];
      const file: MapCaptureFile = {
        version: 1,
        name,
        center: req.center,
        sideM: req.sideM,
        size: req.size,
        mPerPx: req.sideM / (req.size - 1),
        bbox: map.frameBBox(req.center, req.sideM),
        heightMinM: encoded.stats.minM,
        heightMaxM: encoded.stats.maxM,
        hasSea: encoded.stats.minM <= 0,
        sources: { dem: source.id },
        demZoom: plan.z,
        attributions,
        files: [...encoded.stats.files, 'capture.json', 'ATTRIBUTION.txt'],
        missing: [],
        capturedAt: now().toISOString(),
      };
      await writeFile(join(tmpDir, 'capture.json'), `${JSON.stringify(file, null, 2)}\n`);
      await writeFile(join(tmpDir, 'ATTRIBUTION.txt'), `${attributions.join('\n')}\n`);
      const finalDir = join(capturesDir, name);
      await rename(tmpDir, finalDir);
      tmpDir = null;
      deps.onChanged(req.repoId);
      progress('handoff', 1);
      return ok({ captureId, name, dir: `captures/${name}`, capture: file });
    } catch (error) {
      if (tmpDir) await cleanup(tmpDir);
      return failure(abort.signal.aborted ? MAP_CAPTURE_CANCELLED : error instanceof Error ? error.message : String(error));
    } finally {
      running = null;
    }
  }

  async function cleanup(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  /** Cancels the running capture by id; `false` when nothing with that id is running. */
  function cancel(captureId: string): boolean {
    if (!running || running.id !== captureId) return false;
    running.abort.abort();
    running.cancel();
    return true;
  }

  return { capture, cancel };
}

export type CaptureService = ReturnType<typeof createCaptureService>;
