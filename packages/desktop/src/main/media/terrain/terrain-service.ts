import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { WriteQueue } from '@midnite/studio-git-engine';
import {
  DEFAULT_TERRAIN_PROJECT,
  detectRoadColour,
  extractRoadMask,
  failure,
  pickColour,
  needsHeightSource,
  ok,
  parseTerrainSpec,
  TERRAIN_BUILD_CANCELLED,
  TERRAIN_HEIGHTMAP_IMAGE_PROJECT,
  TERRAIN_HEIGHTMAP_PROMPT,
  TERRAIN_INPUT_MAX_BYTES,
  TERRAIN_INPUT_MAX_SIDE,
  TERRAIN_ROAD_PREVIEW_SIZE,
  TERRAIN_SPEC_FILE,
  terrainSlug,
  terrainTimeStamp,
  type GitOpResult,
  type ImageProviderId,
  type TerrainBuildRequest,
  type TerrainBuildResult,
  type TerrainBuildStage,
  type TerrainChangedEvent,
  type TerrainGetResult,
  type TerrainInputRef,
  type TerrainInputSlot,
  type TerrainLibraryRequest,
  type TerrainLibraryResult,
  type TerrainPaintRequest,
  type TerrainProgressEvent,
  type RasterImage,
  type TerrainRoadKeyRequest,
  type TerrainRoadKeyResult,
  type TerrainSetInputRequest,
  type TerrainSetInputResult,
  type TerrainSetSpecRequest,
  type TerrainSpec,
  type TerrainExportOptions,
  type TerrainExportResult,
  type TerrainTarget,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../../fs-scope';
import { decodePng, encodePngGrey8 } from '../png/png-codec';
import type { VisionCall } from '../model/engines';
import { plannedStages } from './build-pipeline';
import { exportTerrain } from './terrain-export';
import type { TerrainBroker } from './terrain-broker';

/**
 * Media ▸ Terrain's operations (`terrain.json`, the three inputs, the build). Everything runs in main,
 * inside the terrain tab's jail, and answers a `GitOpResult` — nothing throws across IPC.
 *
 * - The spec is the source of truth and is only ever read-modify-written inside the per-terrain
 *   write queue, so a build finishing (`lastBuild`) cannot race a `setSpec`.
 * - `build/` is disposable and swapped in whole: the worker writes `.build-tmp-<id>/`, and only a
 *   successful, uncancelled build is renamed over it, so a failed run leaves the previous build intact.
 * - One build per terrain (latest wins) is the broker's rule; this layer maps a cancel to its message.
 */
export type TerrainServiceDeps = {
  /** The terrain tab's root for a repo, or `null` when the folder does not exist yet. */
  rootFor: (repoId: string) => Promise<string | null>;
  /** Writes a file under a group through the media store's jail (creating folders on the way). */
  writeBytes: (req: { repoId: string; project: string; path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  trash: (absPath: string) => Promise<void>;
  /**
   * JPEG/WebP → PNG, and the downscale of an 8-bit image above the side cap — both need Electron's
   * `nativeImage`, so main injects them. `null` when the bytes are not an image.
   */
  toPng: (bytes: Uint8Array, opts: { maxSide: number }) => Promise<{ png: Buffer; downscaledFrom?: { width: number; height: number } } | null>;
  /**
   * Generates a heightmap picture through the Images service (into the Images tab's
   * `terrain-heightmaps` project) and returns its bytes. Absent: prompted heightmaps are refused.
   */
  generateImage?: (req: { generationId: string; repoId: string; project: string; prompt: string; provider: ImageProviderId; model: string }) => Promise<GitOpResult<{ bytes: Uint8Array; name: string }>>;
  broker: TerrainBroker;
  visionCall?: VisionCall;
  onChanged: (repoId: string) => void;
  emitProgress: (event: TerrainProgressEvent) => void;
  emitChanged: (event: TerrainChangedEvent) => void;
  log: (line: string) => void;
  now?: () => Date;
};

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const isPng = (bytes: Uint8Array): boolean => PNG_MAGIC.every((b, i) => bytes[i] === b);

const SLOT_LABEL: Record<TerrainInputSlot, string> = { heightmap: 'heightmap', satellite: 'satellite image', roads: 'roads mask' };

export const NOT_AN_IMAGE = 'Use a PNG, JPEG or WebP image.';

type Located = { root: string; dir: string };
/** What a spec edit answers: the new spec, or why it refuses. */
type Changed = { spec: TerrainSpec } | { fail: GitOpResult<never> };

export function createTerrainService(deps: TerrainServiceDeps) {
  const queue = new WriteQueue();
  const now = deps.now ?? (() => new Date());
  let lastRevision = 0;
  const nextRevision = (): number => {
    lastRevision = Math.max(lastRevision + 1, now().getTime());
    return lastRevision;
  };

  async function locate(target: Pick<TerrainTarget, 'repoId' | 'project' | 'terrain'>): Promise<GitOpResult<Located>> {
    const root = await deps.rootFor(target.repoId);
    if (!root) return failure('Terrain not found.');
    const dir = await confineToRoot(root, `${target.project}/${target.terrain}`);
    if (!dir) return failure('Terrain not found.');
    return ok({ root, dir });
  }

  async function readSpec(dir: string): Promise<GitOpResult<TerrainSpec>> {
    let text: string;
    try {
      text = await readFile(join(dir, TERRAIN_SPEC_FILE), 'utf8');
    } catch {
      return failure('Terrain not found.');
    }
    try {
      return ok(parseTerrainSpec(JSON.parse(text)));
    } catch (error) {
      return failure(`${TERRAIN_SPEC_FILE} is not valid: ${error instanceof Error ? firstIssue(error) : String(error)}`);
    }
  }

  const exists = (path: string): Promise<boolean> =>
    stat(path).then(
      () => true,
      () => false,
    );

  /** Read-modify-write of `terrain.json`, serialised per terrain. */
  function updateSpec(target: TerrainTarget, dir: string, change: (spec: TerrainSpec) => Changed): Promise<GitOpResult<TerrainSpec>> {
    return queue.run(dir, async () => {
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const next = change(current.value);
      if ('fail' in next) return next.fail;
      const stamped: TerrainSpec = { ...next.spec, updatedAt: now().toISOString() };
      const written = await deps.writeBytes({
        repoId: target.repoId,
        project: target.project,
        path: `${target.terrain}/${TERRAIN_SPEC_FILE}`,
        data: Buffer.from(`${JSON.stringify(stamped, null, 2)}\n`, 'utf8'),
      });
      if (!written.ok) return written;
      return ok(stamped);
    });
  }

  function announce(target: TerrainTarget): void {
    deps.onChanged(target.repoId);
    deps.emitChanged({ repoId: target.repoId, project: target.project, terrain: target.terrain, revision: nextRevision() });
  }

  // --- library -----------------------------------------------------------------

  async function freshFolder(root: string, project: string, name: string): Promise<string | null> {
    const base = `${terrainSlug(name)}-${terrainTimeStamp(now())}`;
    for (let n = 0; n < 50; n += 1) {
      const folder = n === 0 ? base : `${base}-${n + 1}`;
      const abs = joinWithin(root, `${project}/${folder}`);
      if (abs && !(await exists(abs))) return folder;
    }
    return null;
  }

  async function library(req: TerrainLibraryRequest): Promise<GitOpResult<TerrainLibraryResult>> {
    try {
      if (req.op === 'create') {
        const project = req.project ?? DEFAULT_TERRAIN_PROJECT;
        const stamp = now().toISOString();
        const spec: TerrainSpec = { ...parseTerrainSpec({}), name: req.name, createdAt: stamp, updatedAt: stamp };
        // The first write creates the tab root and the group on the way; the folder name is unique per second.
        const root = (await deps.rootFor(req.repoId)) ?? '';
        const folder = root ? await freshFolder(root, project, req.name) : `${terrainSlug(req.name)}-${terrainTimeStamp(now())}`;
        if (!folder) return failure('Could not pick a folder name for the new terrain.');
        const written = await deps.writeBytes({
          repoId: req.repoId,
          project,
          path: `${folder}/${TERRAIN_SPEC_FILE}`,
          data: Buffer.from(`${JSON.stringify(spec, null, 2)}\n`, 'utf8'),
        });
        if (!written.ok) return written;
        announce({ repoId: req.repoId, project, terrain: folder });
        return ok({ project, terrain: folder });
      }

      const located = await locate(req);
      if (!located.ok) return located;
      const { root, dir } = located.value;
      if (req.op === 'delete') {
        await queue.run(dir, () => deps.trash(dir));
        deps.onChanged(req.repoId);
        return ok({ project: req.project, terrain: req.terrain });
      }
      if (req.op === 'rename') {
        const folder = await freshFolder(root, req.project, req.to);
        if (!folder) return failure('Could not pick a folder name for the renamed terrain.');
        const target = joinWithin(root, `${req.project}/${folder}`);
        if (!target) return failure('Invalid terrain name.');
        const to = req.to.trim();
        const renamed = await queue.run(dir, async () => {
          const current = await readSpec(dir);
          if (!current.ok) return current;
          await rename(dir, target);
          const written = await deps.writeBytes({
            repoId: req.repoId,
            project: req.project,
            path: `${folder}/${TERRAIN_SPEC_FILE}`,
            data: Buffer.from(`${JSON.stringify({ ...current.value, name: to, updatedAt: now().toISOString() }, null, 2)}\n`, 'utf8'),
          });
          return written.ok ? ok() : written;
        });
        if (!renamed.ok) return renamed;
        announce({ repoId: req.repoId, project: req.project, terrain: folder });
        return ok({ project: req.project, terrain: folder });
      }
      // duplicate: the spec and the inputs, never the disposable build or an export.
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const name = `${current.value.name} copy`;
      const folder = await freshFolder(root, req.project, name);
      const target = folder ? joinWithin(root, `${req.project}/${folder}`) : null;
      if (!folder || !target) return failure('Could not pick a folder name for the copy.');
      await cp(dir, target, {
        recursive: true,
        filter: (src) => !/[\\/](build|export|\.build-tmp-[^\\/]*)([\\/]|$)/.test(src.slice(dir.length)),
      });
      const stamp = now().toISOString();
      const { lastBuild: _drop, ...rest } = current.value;
      const written = await deps.writeBytes({
        repoId: req.repoId,
        project: req.project,
        path: `${folder}/${TERRAIN_SPEC_FILE}`,
        data: Buffer.from(`${JSON.stringify({ ...rest, name, createdAt: stamp, updatedAt: stamp }, null, 2)}\n`, 'utf8'),
      });
      if (!written.ok) return written;
      announce({ repoId: req.repoId, project: req.project, terrain: folder });
      return ok({ project: req.project, terrain: folder });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  // --- spec ----------------------------------------------------------------------

  async function get(target: TerrainTarget): Promise<GitOpResult<TerrainGetResult>> {
    const located = await locate(target);
    if (!located.ok) return located;
    const spec = await readSpec(located.value.dir);
    if (!spec.ok) return spec;
    return ok({ spec: spec.value, built: await exists(join(located.value.dir, 'build', 'heights.f32')) });
  }

  /** Keys a patch may not set: they are owned by `setInput`, the build and the library. */
  const PROTECTED = new Set(['version', 'inputs', 'lastBuild', 'createdAt', 'updatedAt']);

  async function setSpec(req: TerrainSetSpecRequest): Promise<GitOpResult<{ spec: TerrainSpec }>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const updated = await updateSpec(req, located.value.dir, (spec) => {
        const patch = Object.fromEntries(Object.entries(req.patch).filter(([key]) => !PROTECTED.has(key)));
        try {
          return { spec: parseTerrainSpec({ ...spec, ...patch }) };
        } catch (error) {
          return { fail: failure(error instanceof Error ? firstIssue(error) : String(error)) };
        }
      });
      if (!updated.ok) return updated;
      announce(req);
      return ok({ spec: updated.value });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  // --- inputs ----------------------------------------------------------------------

  async function setInput(req: TerrainSetInputRequest): Promise<GitOpResult<TerrainSetInputResult>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      const label = SLOT_LABEL[req.slot];
      const file = `inputs/${req.slot}.png`;

      if ('remove' in req) {
        const updated = await updateSpec(req, dir, (spec) => {
          const { [req.slot]: _gone, ...inputs } = spec.inputs;
          return { spec: { ...spec, inputs } };
        });
        if (!updated.ok) return updated;
        await rm(join(dir, file), { force: true });
        announce(req);
        return ok({ warnings: [] });
      }

      let upload: { bytes: Uint8Array | ArrayBuffer; name: string };
      if ('prompt' in req) {
        if (!deps.generateImage) return failure('Generating a heightmap is not available.');
        const generated = await deps.generateImage({
          generationId: `terrain-${randomUUID()}`,
          repoId: req.repoId,
          project: TERRAIN_HEIGHTMAP_IMAGE_PROJECT,
          prompt: TERRAIN_HEIGHTMAP_PROMPT(req.prompt),
          provider: req.provider,
          model: req.model,
        });
        if (!generated.ok) return generated;
        upload = generated.value;
      } else {
        upload = req;
      }
      const bytes = upload.bytes instanceof Uint8Array ? upload.bytes : new Uint8Array(upload.bytes);
      if (bytes.byteLength === 0) return failure(`The ${label} is empty.`);
      if (bytes.byteLength > TERRAIN_INPUT_MAX_BYTES) return failure(`The ${label} is larger than ${TERRAIN_INPUT_MAX_BYTES / 1024 / 1024} MB.`);

      const warnings: string[] = [];
      let png: Uint8Array;
      let decoded = isPng(bytes) ? decodePng(bytes) : null;
      if (decoded && !decoded.ok) return failure(decoded.message);
      if (decoded?.ok) {
        const { width, height, bitDepth } = decoded.image;
        const side = Math.max(width, height);
        if (side > TERRAIN_INPUT_MAX_SIDE && bitDepth === 16) {
          return failure('16-bit heightmaps larger than 8192 px are not supported.');
        }
        png = bytes;
        if (side > TERRAIN_INPUT_MAX_SIDE) {
          const resized = await deps.toPng(bytes, { maxSide: TERRAIN_INPUT_MAX_SIDE });
          if (!resized) return failure(NOT_AN_IMAGE);
          png = resized.png;
          warnings.push(downscaleWarning(resized.downscaledFrom ?? { width, height }));
          decoded = decodePng(png);
        }
      } else {
        const converted = await deps.toPng(bytes, { maxSide: TERRAIN_INPUT_MAX_SIDE });
        if (!converted) return failure(NOT_AN_IMAGE);
        png = converted.png;
        decoded = decodePng(png);
        if (converted.downscaledFrom) warnings.push(downscaleWarning(converted.downscaledFrom));
      }
      if (!decoded?.ok) return failure(decoded ? decoded.message : NOT_AN_IMAGE);
      const { width, height, bitDepth } = decoded.image;
      const input: TerrainInputRef = { file, sourceName: upload.name.slice(0, 255), width, height, bitDepth };

      const written = await deps.writeBytes({ repoId: req.repoId, project: req.project, path: `${req.terrain}/${file}`, data: Buffer.from(png) });
      if (!written.ok) return written;
      const updated = await updateSpec(req, dir, (spec) => ({
        spec: {
          ...spec,
          inputs: { ...spec.inputs, [req.slot]: input },
          // A heightmap's pre-smooth is decided here: an 8-bit source terraces, so it is softened by default.
          ...(req.slot === 'heightmap' ? { preSmooth: bitDepth === 8 ? 1 : 0 } : {}),
        },
      }));
      if (!updated.ok) return updated;
      if (req.slot === 'heightmap' && bitDepth === 8) warnings.push('8-bit heightmap: expect visible terracing. Pre-smooth is on.');
      announce(req);
      return ok({ input, warnings });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  // --- build -----------------------------------------------------------------------

  async function build(req: TerrainBuildRequest): Promise<GitOpResult<TerrainBuildResult>> {
    const started = Date.now();
    let stages: TerrainBuildStage[] = [];
    let resolution = 0;
    const logLine = (outcome: string) =>
      deps.log(`terrain build ${req.terrain} res=${resolution} stages=${stages.join(',')} ms=${Date.now() - started} ${outcome}`);
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const spec = current.value;
      // The one rule UI and MCP share: nothing to shape the ground from means ask, never guess.
      if (needsHeightSource(spec)) return ok({ status: 'needs-height-source' });
      resolution = spec.resolution;
      stages = plannedStages(spec);
      const buildId = req.buildId ?? randomUUID();
      const outDir = `.build-tmp-${buildId}`;
      const run = deps.broker.build(
        { key: `${req.repoId}/${req.project}/${req.terrain}`, dir, outDir, spec, stages, buildId },
        (stage, fraction) => deps.emitProgress({ buildId, stage, fraction }),
      );
      const result = await run.done;
      if (!result.ok) {
        await rm(join(dir, outDir), { recursive: true, force: true });
        logLine(result.message === TERRAIN_BUILD_CANCELLED ? 'cancelled' : `failed:${result.message}`);
        return failure(result.message);
      }
      // Swap the finished build in whole. A concurrent newer build for this terrain would have cancelled us.
      await queue.run(dir, async () => {
        await rm(join(dir, 'build'), { recursive: true, force: true });
        await rename(join(dir, outDir), join(dir, 'build'));
      });
      const updated = await updateSpec(req, dir, (latest) => ({
        spec: { ...latest, lastBuild: { at: now().toISOString(), buildMs: result.stats.buildMs, stats: result.stats } },
      }));
      if (!updated.ok) return updated;
      announce(req);
      logLine('ok');
      return ok({ status: 'built', stats: result.stats });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine(`failed:${message}`);
      return failure(message);
    }
  }

  async function paint(req: TerrainPaintRequest): Promise<GitOpResult> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const spec = current.value;

      const res = Math.min(spec.textureSize, 2048);
      const overrideDir = join(dir, 'overrides');
      await mkdir(overrideDir, { recursive: true });
      const overridePath = join(overrideDir, 'landcover.png');

      let data = new Uint8Array(res * res);
      const existing = await readFile(overridePath).catch(() => null);
      if (existing) {
        const dec = decodePng(existing);
        if (dec.ok && dec.image.width === res && dec.image.height === res) {
          data = new Uint8Array(dec.image.data);
        }
      }

      rasterizeStroke(data, res, req.points, req.radiusPx, req.cls);
      await writeFile(overridePath, encodePngGrey8(data, res, res));

      const buildDir = join(dir, 'build');
      const heightsPath = join(buildDir, 'heights.f32');
      if (await exists(heightsPath) && spec.inputs.satellite) {
        await build({ repoId: req.repoId, project: req.project, terrain: req.terrain });
      } else {
        announce(req);
      }

      return ok();
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Theme H: keys the roads image at {@link TERRAIN_ROAD_PREVIEW_SIZE}² without a build. `pick`
   * samples the full-resolution image (the eyedropper); otherwise the request's colour, the spec's,
   * or the detected one, in that order. Image space — no alignment — since the panel shows the image.
   */
  async function roadKey(req: TerrainRoadKeyRequest): Promise<GitOpResult<TerrainRoadKeyResult>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const spec = current.value;
      if (!spec.inputs.roads) return failure('Attach a roads mask first.');
      const bytes = await readFile(join(dir, spec.inputs.roads.file)).catch(() => null);
      if (!bytes) return failure('The roads mask file is missing — attach it again.');
      const decoded = decodePng(bytes);
      if (!decoded.ok) return failure(decoded.message);
      const detectedColour = detectRoadColour(decoded.image).colour;
      const colour = req.pick
        ? pickColour(decoded.image, req.pick[0], req.pick[1])
        : req.colour ?? spec.roads.colour ?? detectedColour;
      const size = TERRAIN_ROAD_PREVIEW_SIZE;
      const mask = extractRoadMask(previewRaster(decoded.image, size), colour, req.tolerance ?? spec.roads.tolerance);
      for (let i = 0; i < mask.length; i += 1) mask[i] = mask[i] ? 255 : 0;
      return ok({ pngBase64: encodePngGrey8(mask, size, size).toString('base64'), colour, detected: detectedColour });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  function cancel(buildId: string): GitOpResult {
    deps.broker.cancel(buildId);
    return ok();
  }

  async function exportPack(req: TerrainExportOptions & TerrainTarget): Promise<GitOpResult<TerrainExportResult>> {
    const located = await locate(req);
    if (!located.ok) return located;
    const { dir } = located.value;
    const spec = await readSpec(dir);
    if (!spec.ok) return spec;
    // Serialised with writes to this terrain, so an export never reads a build that is being swapped in.
    return queue.run(dir, () => exportTerrain({ dir, spec: spec.value, options: req }));
  }

  /** The terrain's folder, for the callers that read its files directly (the MCP preview and export). */
  async function dirOf(target: Pick<TerrainTarget, 'repoId' | 'project' | 'terrain'>): Promise<GitOpResult<string>> {
    const located = await locate(target);
    return located.ok ? ok(located.value.dir) : located;
  }

  return { library, get, setSpec, setInput, build, cancel, paint, roadKey, export: exportPack, dirOf };
}

/** Nearest-neighbour resample of any raster to a `size`² one with the same channels. */
function previewRaster(image: RasterImage, size: number): RasterImage {
  const { width, height, channels } = image;
  const data = image.bitDepth === 16 ? new Uint16Array(size * size * channels) : new Uint8Array(size * size * channels);
  for (let y = 0; y < size; y += 1) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / size));
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / size));
      const from = (sy * width + sx) * channels;
      for (let c = 0; c < channels; c += 1) data[(y * size + x) * channels + c] = image.data[from + c]!;
    }
  }
  return { width: size, height: size, channels, bitDepth: image.bitDepth, data };
}

function rasterizeStroke(
  data: Uint8Array,
  res: number,
  points: [number, number][],
  radiusPx: number,
  cls: number,
): void {
  const rSq = radiusPx * radiusPx;

  const drawCircle = (cx: number, cy: number) => {
    const xMin = Math.max(0, Math.floor(cx - radiusPx));
    const xMax = Math.min(res - 1, Math.ceil(cx + radiusPx));
    const yMin = Math.max(0, Math.floor(cy - radiusPx));
    const yMax = Math.min(res - 1, Math.ceil(cy + radiusPx));
    for (let y = yMin; y <= yMax; y += 1) {
      const dy = y - cy;
      for (let x = xMin; x <= xMax; x += 1) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= rSq) {
          data[y * res + x] = cls;
        }
      }
    }
  };

  for (let i = 0; i < points.length; i += 1) {
    const [u, v] = points[i]!;
    const px = u * res;
    const py = v * res;
    drawCircle(px, py);

    if (i > 0) {
      const [pU, pV] = points[i - 1]!;
      const prevX = pU * res;
      const prevY = pV * res;
      const dist = Math.hypot(px - prevX, py - prevY);
      const steps = Math.ceil(dist / Math.max(1, radiusPx / 2));
      for (let s = 1; s < steps; s += 1) {
        const t = s / steps;
        drawCircle(prevX + t * (px - prevX), prevY + t * (py - prevY));
      }
    }
  }
}

export type TerrainService = ReturnType<typeof createTerrainService>;

function firstIssue(error: Error): string {
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues;
  const issue = issues?.[0];
  return issue ? `${issue.path.join('.') || 'spec'}: ${issue.message}` : error.message;
}

const downscaleWarning = ({ width, height }: { width: number; height: number }): string =>
  `Downscaled from ${width}×${height} to the ${TERRAIN_INPUT_MAX_SIDE} px limit.`;
