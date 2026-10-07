import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  MAP_CAPTURE_BUSY,
  MAP_CAPTURE_CANCELLED,
  MAP_KEY_MISSING_REASON,
  MAP_ROADS_MAX_SIDE_M,
  MAP_ROADS_NONE,
  MAP_ROADS_TOO_LARGE,
  OSM_ATTRIBUTION_TEXT,
  captureTextureSize,
  captureFolderName,
  captureTerrainName,
  handoffSpec,
  MAP_CAPTURE_SEA_FRACTION,
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
  type TerrainBuildRequest,
  type TerrainOpenEvent,
} from '@midnite/studio-shared';

import { decodePng } from '../png/png-codec';
import type { TerrainService } from '../terrain/terrain-service';
import type { CaptureBroker } from './capture-broker';
import type { OverpassClient } from './overpass';

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
  /** The one Overpass request a capture makes. Absent: roads are recorded as missing. */
  overpass?: Pick<OverpassClient, 'query'>;
  onChanged: (repoId: string) => void;
  emitProgress: (event: MapCaptureProgressEvent) => void;
  /**
   * The Terrain tab's service, called directly (Phase 108 Decision 13) — never the renderer IPC chain,
   * so a capture started from an MCP tool hands off with the Maps tab closed. Absent: no hand-off.
   */
  terrain?: Pick<TerrainService, 'library' | 'setInput' | 'setRoadsGraph' | 'setSpec' | 'build'>;
  /** Asks every window to select the new terrain (`mediaTerrainOpen`). */
  emitOpen?: (event: TerrainOpenEvent) => void;
  now?: () => Date;
  newId?: () => string;
  log?: (line: string) => void;
  /** How many tile fetches run at once (the fetcher separately caps per host). */
  fetchConcurrency?: number;
};

const why = (r: { ok: false; kind: string; message?: string }): string => r.message ?? 'a conflict occurred';

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
      const demExt = source.encoding === 'terrarium' ? 'png' : 'webp';
      const fetched = await fetchTiles(source, plan, tiles, demExt, key, abort.signal, (t, d) => handle.addTile(t.x, t.y, d.width, d.height, d.rgba), (f) => progress('dem', f), 'Elevation');
      const fatal = fetched.ok ? null : fetched.message;
      if (abort.signal.aborted) {
        handle.cancel();
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

      // --- satellite and roads (a failure here never loses the heightmap) ----------------------------
      const missing: MapCaptureFile['missing'] = [];
      const files = [...encoded.stats.files];
      const attributions = [source.attribution];
      const sources: MapCaptureFile['sources'] = { dem: source.id };
      const extra: Partial<MapCaptureFile> = {};
      const texture = captureTextureSize(req.size);
      const layerHandle = (h: { cancel: () => void }) => {
        state.cancel = () => h.cancel();
      };

      if (req.satellite !== false) {
        const sat = mapSource(req.satelliteSource ?? (key ? 'maptiler-satellite' : 'eox-s2cloudless-2016'));
        let reason: string | null = null;
        if (sat.kind !== 'satellite') reason = `${sat.label} is not a satellite source.`;
        else if (!sat.exportable) reason = `${sat.label} is display-only: ${sat.exportReason ?? sat.licence}`;
        else if (sat.requiresKey && !key) reason = MAP_KEY_MISSING_REASON;
        if (reason) missing.push({ slot: 'satellite', reason });
        else {
          progress('satellite', 0);
          const satPlan = map.chooseCaptureZoom(sat, frame, texture, { pitched: false });
          const satTiles = map.listTiles(satPlan);
          log(`map capture ${captureId}: ${sat.id} z${satPlan.z}, ${satTiles.length} tiles, ${texture}²`);
          const h = deps.broker.beginSatellite({ id: `${captureId}-sat`, frame, size: texture, plan: satPlan, outDir: tmpDir }, (f) => progress('satellite', 0.5 + f / 2));
          layerHandle(h);
          const got = await fetchTiles(sat, satPlan, satTiles, 'jpg', key, abort.signal, (t, d) => h.addTile(t.x, t.y, d.width, d.height, d.rgba), (f) => progress('satellite', f / 2), 'Satellite');
          if (abort.signal.aborted) {
            h.cancel();
            await cleanup(tmpDir);
            return failure(MAP_CAPTURE_CANCELLED);
          }
          if (!got.ok) {
            h.cancel();
            missing.push({ slot: 'satellite', reason: got.message });
          } else {
            const written = await h.finish();
            if (abort.signal.aborted) {
              await cleanup(tmpDir);
              return failure(MAP_CAPTURE_CANCELLED);
            }
            if (written.ok) {
              files.push(...written.stats.files);
              attributions.push(`${sat.attribution} (${sat.licence})`);
              sources.satellite = sat.id;
              extra.satelliteZoom = satPlan.z;
            } else missing.push({ slot: 'satellite', reason: written.message });
          }
        }
      }

      if (req.roads !== false) {
        let reason: string | null = null;
        let graph: map.RoadGraph | null = null;
        if (req.sideM > MAP_ROADS_MAX_SIDE_M) reason = MAP_ROADS_TOO_LARGE;
        else if (!deps.overpass) reason = 'Roads are unavailable.';
        else {
          progress('roads', 0);
          const got = await deps.overpass.query(map.frameBBox(req.center, req.sideM), abort.signal);
          if (abort.signal.aborted) {
            await cleanup(tmpDir);
            return failure(MAP_CAPTURE_CANCELLED);
          }
          if (!got.ok) reason = got.reason;
          else {
            graph = map.osmToRoadGraph(got.osm, req.center, req.sideM);
            if (graph.edges.length === 0) reason = MAP_ROADS_NONE;
          }
        }
        if (graph && !reason) {
          progress('roads', 0.5);
          const h = deps.broker.beginRoads({ id: `${captureId}-roads`, graph, size: texture, outDir: tmpDir }, (f) => progress('roads', 0.5 + f / 2));
          layerHandle(h);
          const written = await h.finish();
          if (abort.signal.aborted) {
            await cleanup(tmpDir);
            return failure(MAP_CAPTURE_CANCELLED);
          }
          if (written.ok) {
            files.push(...written.stats.files);
            attributions.push(OSM_ATTRIBUTION_TEXT);
            sources.roads = 'overpass';
          } else reason = written.message;
        }
        if (reason) missing.push({ slot: 'roads', reason });
      }

      // --- write the sidecars and move into place ---------------------------------------------------
      const name = captureFolderName({ center: req.center, place: req.place }, now());
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
        hasSea: encoded.stats.minM < 0 && encoded.stats.seaFraction >= MAP_CAPTURE_SEA_FRACTION,
        sources,
        demZoom: plan.z,
        ...extra,
        attributions,
        files: [...files, 'capture.json', 'ATTRIBUTION.txt'],
        missing,
        capturedAt: now().toISOString(),
      };
      await writeFile(join(tmpDir, 'capture.json'), `${JSON.stringify(file, null, 2)}\n`);
      await writeFile(join(tmpDir, 'ATTRIBUTION.txt'), `${attributions.join('\n')}\n`);
      const finalDir = join(capturesDir, name);
      await rename(tmpDir, finalDir);
      tmpDir = null;
      deps.onChanged(req.repoId);
      const result: MapCaptureResult = { captureId, name, dir: `captures/${name}`, capture: file };
      if (req.handoff) {
        progress('handoff', 0);
        const handed = await handoff(req, file, finalDir);
        if (!handed.ok) return handed;
        result.terrain = handed.value;
      }
      progress('handoff', 1);
      return ok(result);
    } catch (error) {
      if (tmpDir) await cleanup(tmpDir);
      return failure(abort.signal.aborted ? MAP_CAPTURE_CANCELLED : error instanceof Error ? error.message : String(error));
    } finally {
      running = null;
    }
  }

  /**
   * Creates the terrain from a finished capture: library create → inputs → captured road graph →
   * spec → open (→ build). The capture stays on disk whatever happens; a failing step names itself and
   * leaves the half-made terrain in place, visible and deletable, rather than deleting it.
   */
  async function handoff(
    req: MapCaptureRequest,
    file: MapCaptureFile,
    captureDir: string,
  ): Promise<GitOpResult<{ project: string; terrain: string }>> {
    const terrain = deps.terrain;
    if (!terrain) return failure('Handing off to Terrain is not available.');
    const read = (name: string): Promise<Uint8Array | null> => readFile(join(captureDir, name)).then((b) => b, () => null);
    const name = captureTerrainName(req);
    const created = await terrain.library({ op: 'create', repoId: req.repoId, name });
    if (!created.ok) return failure(`Could not create the terrain: ${why(created)}`);
    const target = { repoId: req.repoId, project: created.value.project ?? '', terrain: created.value.terrain ?? '' };
    if (!target.project || !target.terrain) return failure('Could not create the terrain.');

    const slots = [
      ['heightmap', 'heightmap.png', 'heightmap'],
      ['satellite', 'satellite.png', 'satellite image'],
      ['roads', 'roads.png', 'roads mask'],
    ] as const;
    for (const [slot, fileName, label] of slots) {
      const bytes = await read(fileName);
      if (!bytes) {
        if (slot === 'heightmap') return failure(`The capture has no heightmap to hand off (${target.terrain} was left empty).`);
        continue;
      }
      const attached = await terrain.setInput({ ...target, slot, bytes, name: fileName });
      if (!attached.ok) return failure(`Could not attach the ${label} to the terrain: ${why(attached)}`);
    }
    const graph = await read('roads.graph.json');
    if (graph) {
      const attached = await terrain.setRoadsGraph(target, graph);
      if (!attached.ok) return failure(`Could not attach the road graph to the terrain: ${why(attached)}`);
    }
    const patch = handoffSpec(file, { repoId: req.repoId, project: req.project, name });
    const applied = await terrain.setSpec({ ...target, patch });
    if (!applied.ok) return failure(`Could not apply the terrain settings: ${why(applied)}`);

    deps.emitOpen?.(target);
    if (req.build) {
      // Not awaited: the Terrain tab shows its own build progress, and the capture is done.
      const build: TerrainBuildRequest = target;
      void terrain.build(build).catch((error: unknown) => log(`map capture hand-off build failed: ${String(error)}`));
    }
    return ok({ project: target.project, terrain: target.terrain });
  }

  /**
   * Fetches `tiles` through the shared fetcher with a bounded pool and hands each decoded tile to
   * `onTile`. A 404 is an empty tile (ocean at depth, or no imagery) and is left to the mosaic's fill;
   * any other failure ends the run with a message naming the `label`. An abort ends it quietly.
   */
  async function fetchTiles(
    source: MapSource,
    plan: map.TilePlan,
    tiles: map.PlannedTile[],
    ext: string,
    key: string | null,
    signal: AbortSignal,
    onTile: (t: { x: number; y: number }, d: DecodedTile) => void,
    onProgress: (fraction: number) => void,
    label: string,
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    let next = 0;
    let done = 0;
    let fatal: string | null = null;
    const fetchOne = async (t: { x: number; y: number }) => {
      const url = expandMapTemplate(source.template ?? '', { z: plan.z, x: t.x, y: t.y, key });
      const got = await deps.fetcher.fetch(`${source.id}/${plan.z}/${t.x}/${t.y}.${ext}`, url, { signal });
      if (!got.ok) {
        if (got.status === 404) return;
        if (got.status !== 'aborted') fatal ??= `${label} tiles could not be fetched (${got.status === 'network' ? 'network error' : `HTTP ${got.status}`}).`;
        return;
      }
      const decoded = await decodeTileBytes(got.bytes, deps.nativeDecode);
      if (!decoded) {
        fatal ??= `${label === 'Elevation' ? 'An elevation' : 'A satellite'} tile could not be decoded.`;
        return;
      }
      onTile(t, decoded);
    };
    const lane = async () => {
      while (!signal.aborted && fatal === null) {
        const index = next;
        next += 1;
        const t = tiles[index];
        if (!t) return;
        await fetchOne(t);
        done += 1;
        onProgress(done / tiles.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, tiles.length) }, lane));
    return fatal ? { ok: false, message: fatal } : { ok: true };
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
