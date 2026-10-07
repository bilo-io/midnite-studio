import { randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { WriteQueue } from '@midnite/studio-git-engine';
import {
  failure,
  frameSlots,
  moveRenames,
  ok,
  parseSpriteFrameKey,
  parseSpriteSpec,
  presetClips,
  SPRITE_FRAME_SOURCES_PENDING,
  SPRITE_FRAMES_FILE,
  SPRITE_JOB_BUSY,
  SPRITE_JOB_CANCELLED,
  SPRITE_NEEDS_MODEL,
  SPRITE_NO_REFERENCE,
  SPRITE_SPEC_FILE,
  SPRITE_PIPELINE_BADGES,
  SpriteFrameMetaSchema,
  SpriteFramesFileSchema,
  SpritePackOptionsSchema,
  spriteFrameKey,
  spriteFramePath,
  spriteGroupOf,
  spriteSlug,
  spriteTimeStamp,
  staleFrameKeys,
  type GitOpResult,
  type SpriteAssetSpec,
  type SpriteBadge,
  type SpriteChangedEvent,
  type SpriteExportRequest,
  type SpriteExportResult,
  type SpriteFrameMeta,
  type SpriteFrameMeasure,
  type SpriteFramesFile,
  type SpriteGenerateRequest,
  type SpriteGetResult,
  type SpriteGroupId,
  type SpriteJobStatus,
  type SpriteLibraryRequest,
  type SpriteLibraryResult,
  type SpritePatchFramesRequest,
  type SpritePatchFramesResult,
  type SpritePatchOp,
  type SpriteProgressEvent,
  type SpriteSetReferenceRequest,
  type SpriteSetSpecRequest,
  type SpriteSheetSpec,
  type SpriteTarget,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../../fs-scope';
import { createFramePipeline, type FramePipeline } from './frame-pipeline';
import { exportSprite } from './sprite-export';

/**
 * Media ▸ Sprites' operations (`sprite.json`, the reference, frame metadata, generation jobs).
 * Everything runs in main inside the sprite tab's jail and answers a `GitOpResult` — nothing
 * throws across IPC. IPC (`media-sprite-handlers.ts`) and, later, MCP are thin adapters over this
 * one file, so the job limits, confinement and write-queue rules live in one place.
 *
 * - The spec is only ever read-modify-written inside the per-asset write queue.
 * - **One job per asset at a time.** A second `generate` is refused, not queued: a job may be
 *   minutes of paid API calls. Jobs of different assets run concurrently.
 * - Cancel aborts the runner's {@link AbortSignal}, keeps every frame already written, and ends
 *   the job `cancelled`.
 * - The frame sources (Themes D, E, F) are a pluggable {@link SpriteJobRunner}; with none
 *   installed a job ends `failed` with {@link SPRITE_FRAME_SOURCES_PENDING}.
 */
export type SpriteJobContext = {
  jobId: string;
  target: SpriteTarget;
  spec: SpriteAssetSpec;
  /** Absolute asset folder. */
  dir: string;
  signal: AbortSignal;
  /** Clips to (re)generate; absent means every clip. */
  clips: readonly string[] | undefined;
  /** Only these frames (`<clip>/<dir>/<nnn>`, the frame strip's re-roll); absent means every frame of `clips`. */
  frames: readonly string[] | undefined;
  progress: (event: Omit<SpriteProgressEvent, 'jobId'>) => void;
  /** Writes a normalised frame PNG and its metadata. */
  writeFrame: (frame: { clip: string; dir: string; n: number; png: Buffer; meta?: Partial<SpriteFrameMeta> }) => Promise<void>;
  /**
   * A raw generated or rendered frame (PNG, JPEG or WebP) through the frame pipeline (Theme B): keyed,
   * normalised onto the anchor and written. Sheets only. Submit the reference frame
   * ({@link spriteReferenceFrame}) of each direction first — it sets that direction's scale.
   */
  submitFrame: (frame: { clip: string; dir: string; n: number; bytes: Uint8Array; meta?: Partial<SpriteFrameMeta> }) => Promise<SpriteFrameMeasure>;
  /** Hand-drawn step 1 (Theme D): this job draws the turnaround reference, not frames. */
  turnaround: boolean;
  /**
   * Stores a new, **unapproved** reference image (any image format): `reference/reference.png`, plus
   * `reference/turnaround.png` when it is a generated turnaround.
   */
  writeReference: (bytes: Uint8Array, opts?: { turnaround?: boolean }) => Promise<void>;
  /** Counts one paid image request, for the job's log line. */
  countRequest: () => void;
  /** A line the job's final event carries even when it ends `done` (e.g. "Consistency not checked: …"). */
  note: (message: string) => void;
  /**
   * Read-modify-writes the sheet's `sprite.json` inside the asset's write queue — a rendered sheet
   * records each clip's real frame count (E), a one-shot sheet its grid and verdict (F).
   */
  updateSheet: (change: (spec: SpriteSheetSpec) => SpriteSheetSpec) => Promise<void>;
  /** The same for any kind — an environment job (Themes H–J) records its report. */
  updateAsset: (change: (spec: SpriteAssetSpec) => SpriteAssetSpec) => Promise<void>;
  /** Writes any other file of the asset (asset-relative path), e.g. the one-shot sheet image. */
  writeAssetFile: (path: string, data: Buffer) => Promise<void>;
};
export type SpriteJobRunner = (ctx: SpriteJobContext) => Promise<void>;

export type SpriteServiceDeps = {
  /** The sprite tab's root for a repo, or `null` when the folder does not exist yet. */
  rootFor: (repoId: string) => Promise<string | null>;
  writeBytes: (req: { repoId: string; project: string; path: string; data: Buffer }) => Promise<GitOpResult<unknown>>;
  trash: (absPath: string) => Promise<void>;
  /** Any image → PNG (Electron's `nativeImage`); `null` when the bytes are not an image. */
  toPng: (bytes: Uint8Array) => Promise<Buffer | null>;
  runJob?: SpriteJobRunner;
  /** Refuses a job up front (method-specific: hand-drawn needs an approved reference). `null` lets it run. */
  preflight?: (spec: SpriteAssetSpec, req: SpriteGenerateRequest) => string | null;
  onChanged: (repoId: string) => void;
  emitProgress: (event: SpriteProgressEvent) => void;
  emitChanged: (event: SpriteChangedEvent) => void;
  log: (line: string) => void;
  now?: () => Date;
};

export const NOT_AN_IMAGE = 'Use a PNG, JPEG or WebP image.';
/** A one-shot sheet is one image: single frames cannot be redrawn from it. */
export const ONE_SHOT_NO_FRAME_REROLL = 'A one-shot sheet re-rolls whole clips — use “Regenerate this clip with Hand-drawn”.';
/** Where a deleted frame waits for its undo (Theme G). */
export const SPRITE_TRASH_DIR = 'frames/.trash';

type Job = {
  id: string;
  key: string;
  controller: AbortController;
  status: SpriteJobStatus;
};

export function createSpriteService(deps: SpriteServiceDeps) {
  const queue = new WriteQueue();
  const now = deps.now ?? (() => new Date());
  const jobs = new Map<string, Job>();
  const running = new Map<string, Job>();
  let lastRevision = 0;
  const nextRevision = (): number => {
    lastRevision = Math.max(lastRevision + 1, now().getTime());
    return lastRevision;
  };
  const keyOf = (t: SpriteTarget): string => `${t.repoId}\0${t.group}\0${t.asset}`;
  const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

  const exists = (path: string): Promise<boolean> =>
    stat(path).then(
      () => true,
      () => false,
    );

  async function locate(target: SpriteTarget): Promise<GitOpResult<{ root: string; dir: string }>> {
    const root = await deps.rootFor(target.repoId);
    if (!root) return failure('Sprite not found.');
    const dir = await confineToRoot(root, `${target.group}/${target.asset}`);
    if (!dir) return failure('Sprite not found.');
    return ok({ root, dir });
  }

  async function readSpec(dir: string): Promise<GitOpResult<SpriteAssetSpec>> {
    let text: string;
    try {
      text = await readFile(join(dir, SPRITE_SPEC_FILE), 'utf8');
    } catch {
      return failure('Sprite not found.');
    }
    try {
      return ok(parseSpriteSpec(JSON.parse(text)));
    } catch (error) {
      return failure(`${SPRITE_SPEC_FILE} is not valid: ${firstIssue(error)}`);
    }
  }

  async function readFrames(dir: string): Promise<SpriteFramesFile> {
    try {
      return SpriteFramesFileSchema.parse(JSON.parse(await readFile(join(dir, SPRITE_FRAMES_FILE), 'utf8')));
    } catch {
      return SpriteFramesFileSchema.parse({});
    }
  }

  type Changed = { spec: SpriteAssetSpec } | { fail: GitOpResult<never> };

  /** Read-modify-write of `sprite.json`, serialised per asset. */
  function updateSpec(target: SpriteTarget, dir: string, change: (spec: SpriteAssetSpec) => Changed): Promise<GitOpResult<SpriteAssetSpec>> {
    return queue.run(dir, async () => {
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const next = change(current.value);
      if ('fail' in next) return next.fail;
      const stamped = { ...next.spec, updatedAt: now().toISOString() } as SpriteAssetSpec;
      const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${SPRITE_SPEC_FILE}`, data: json(stamped) });
      return written.ok ? ok(stamped) : written;
    });
  }

  function announce(target: SpriteTarget): void {
    deps.onChanged(target.repoId);
    deps.emitChanged({ repoId: target.repoId, group: target.group, asset: target.asset, revision: nextRevision() });
  }

  // --- library -----------------------------------------------------------------

  async function freshFolder(root: string, group: SpriteGroupId, name: string): Promise<string | null> {
    const base = `${spriteSlug(name)}-${spriteTimeStamp(now())}`;
    for (let n = 0; n < 50; n += 1) {
      const folder = n === 0 ? base : `${base}-${n + 1}`;
      const abs = joinWithin(root, `${group}/${folder}`);
      if (abs && !(await exists(abs))) return folder;
    }
    return null;
  }

  async function library(req: SpriteLibraryRequest): Promise<GitOpResult<SpriteLibraryResult>> {
    try {
      if (req.op === 'create') {
        let spec: SpriteAssetSpec;
        try {
          spec = parseSpriteSpec(req.spec);
        } catch (error) {
          return failure(firstIssue(error));
        }
        if (spec.kind === 'sheet') {
          // A locked reference image only exists once `setReference` wrote it; a model ref is a pointer.
          const reference = spec.reference?.kind === 'model' ? spec.reference : undefined;
          const { reference: _drop, ...rest } = spec;
          spec = { ...rest, ...(reference ? { reference } : {}), clips: spec.clips.length > 0 ? spec.clips : presetClips(spec.targetPerspective) };
        }
        const stamp = now().toISOString();
        spec = { ...spec, createdAt: stamp, updatedAt: stamp } as SpriteAssetSpec;
        const group = spriteGroupOf(spec);
        const root = (await deps.rootFor(req.repoId)) ?? '';
        const folder = root ? await freshFolder(root, group, spec.name) : `${spriteSlug(spec.name)}-${spriteTimeStamp(now())}`;
        if (!folder) return failure('Could not pick a folder name for the new sprite.');
        const written = await deps.writeBytes({ repoId: req.repoId, project: group, path: `${folder}/${SPRITE_SPEC_FILE}`, data: json(spec) });
        if (!written.ok) return written;
        announce({ repoId: req.repoId, group, asset: folder });
        return ok({ group, asset: folder });
      }

      const located = await locate(req);
      if (!located.ok) return located;
      const { root, dir } = located.value;
      if (running.has(keyOf(req)) && req.op !== 'duplicate') return failure(SPRITE_JOB_BUSY);

      if (req.op === 'delete') {
        await queue.run(dir, () => deps.trash(dir));
        deps.onChanged(req.repoId);
        return ok({ group: req.group, asset: req.asset });
      }
      if (req.op === 'rename') {
        const folder = await freshFolder(root, req.group, req.to);
        const target = folder ? joinWithin(root, `${req.group}/${folder}`) : null;
        if (!folder || !target) return failure('Could not pick a folder name for the renamed sprite.');
        const to = req.to.trim();
        const renamed = await queue.run(dir, async () => {
          const current = await readSpec(dir);
          if (!current.ok) return current;
          await rename(dir, target);
          return deps.writeBytes({
            repoId: req.repoId,
            project: req.group,
            path: `${folder}/${SPRITE_SPEC_FILE}`,
            data: json({ ...current.value, name: to, updatedAt: now().toISOString() }),
          });
        });
        if (!renamed.ok) return renamed;
        announce({ repoId: req.repoId, group: req.group, asset: folder });
        return ok({ group: req.group, asset: folder });
      }
      // duplicate: the spec, reference and frames, never an export.
      const current = await readSpec(dir);
      if (!current.ok) return current;
      const name = `${current.value.name} copy`;
      const folder = await freshFolder(root, req.group, name);
      const target = folder ? joinWithin(root, `${req.group}/${folder}`) : null;
      if (!folder || !target) return failure('Could not pick a folder name for the copy.');
      await cp(dir, target, { recursive: true, filter: (src) => !/[\\/]export([\\/]|$)/.test(src.slice(dir.length)) });
      const stamp = now().toISOString();
      const { lastReport: _report, ...rest } = current.value;
      const written = await deps.writeBytes({
        repoId: req.repoId,
        project: req.group,
        path: `${folder}/${SPRITE_SPEC_FILE}`,
        data: json({ ...rest, name, createdAt: stamp, updatedAt: stamp }),
      });
      if (!written.ok) return written;
      announce({ repoId: req.repoId, group: req.group, asset: folder });
      return ok({ group: req.group, asset: folder });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  // --- spec ----------------------------------------------------------------------

  async function get(target: SpriteTarget): Promise<GitOpResult<SpriteGetResult>> {
    const located = await locate(target);
    if (!located.ok) return located;
    const spec = await readSpec(located.value.dir);
    if (!spec.ok) return spec;
    return ok({ spec: spec.value, frames: await readFrames(located.value.dir), report: spec.value.lastReport ?? null });
  }

  /** Keys a patch may not set: owned by the library, the reference op and the job runner. */
  const PROTECTED = new Set(['version', 'kind', 'reference', 'lastReport', 'createdAt', 'updatedAt']);

  async function setSpec(req: SpriteSetSpecRequest): Promise<GitOpResult<{ spec: SpriteAssetSpec }>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      if (running.has(keyOf(req))) return failure(SPRITE_JOB_BUSY);
      const updated = await updateSpec(req, located.value.dir, (spec) => {
        const patch = Object.fromEntries(Object.entries(req.patch).filter(([key]) => !PROTECTED.has(key)));
        try {
          return { spec: parseSpriteSpec({ ...spec, ...patch }) };
        } catch (error) {
          return { fail: failure(firstIssue(error)) };
        }
      });
      if (!updated.ok) return updated;
      announce(req);
      return ok({ spec: updated.value });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function setReference(req: SpriteSetReferenceRequest): Promise<GitOpResult> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      const file = 'reference/reference.png' as const;

      if ('approve' in req) return await approveReference(req, dir);
      if ('fromFrame' in req) return await referenceFromFrame(req, dir);
      let png: Buffer | null = null;
      if ('bytes' in req) {
        png = await deps.toPng(req.bytes instanceof Uint8Array ? req.bytes : new Uint8Array(req.bytes));
        if (!png) return failure(NOT_AN_IMAGE);
      }
      const updated = await updateSpec(req, dir, (spec) => {
        if (spec.kind !== 'sheet') return { fail: failure('Only a sprite sheet has a reference.') };
        if ('remove' in req) {
          const { reference: _gone, ...rest } = spec;
          return { spec: rest };
        }
        if ('model' in req) return { spec: { ...spec, reference: { kind: 'model', project: req.model.project, path: req.model.path } } };
        return { spec: { ...spec, reference: { kind: 'image', file, approved: false } } };
      });
      if (!updated.ok) return updated;
      if (png) await deps.writeBytes({ repoId: req.repoId, project: req.group, path: `${req.asset}/${file}`, data: png });
      if ('remove' in req || 'model' in req) await rm(join(dir, file), { force: true });
      announce(req);
      return ok();
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  /** Locks the current reference image; optionally marks every existing frame `unchecked` for re-roll. */
  async function approveReference(req: SpriteTarget & { frames: 'keep' | 'mark' }, dir: string): Promise<GitOpResult> {
    if (running.has(keyOf(req))) return failure(SPRITE_JOB_BUSY);
    if (!(await exists(join(dir, 'reference/reference.png')))) return failure(SPRITE_NO_REFERENCE);
    const updated = await updateSpec(req, dir, (spec) => {
      if (spec.kind !== 'sheet') return { fail: failure('Only a sprite sheet has a reference.') };
      if (spec.reference?.kind !== 'image') return { fail: failure(SPRITE_NO_REFERENCE) };
      return { spec: { ...spec, reference: { ...spec.reference, approved: true } } };
    });
    if (!updated.ok) return updated;
    if (req.frames === 'mark') {
      const marked = await writeFrameMeta(req, dir, (file) => {
        for (const meta of Object.values(file.frames)) if (!meta.badges.includes('unchecked')) meta.badges = [...meta.badges, 'unchecked'];
      });
      if (!marked.ok) return marked;
    }
    announce(req);
    return ok();
  }

  /** One-shot's hand-off (Theme F): an existing frame becomes the approved reference image. */
  async function referenceFromFrame(req: SpriteTarget & { fromFrame: { clip: string; dir: string; n: number } }, dir: string): Promise<GitOpResult> {
    if (running.has(keyOf(req))) return failure(SPRITE_JOB_BUSY);
    const { clip, dir: direction, n } = req.fromFrame;
    let png: Buffer;
    try {
      png = await readFile(join(dir, spriteFramePath(clip, direction, n)));
    } catch {
      return failure(`Frame ${spriteFrameKey(clip, direction, n)} does not exist.`);
    }
    const updated = await updateSpec(req, dir, (spec) =>
      spec.kind === 'sheet' ? { spec: { ...spec, reference: { kind: 'image', file: 'reference/reference.png', approved: true } } } : { fail: failure('Only a sprite sheet has a reference.') },
    );
    if (!updated.ok) return updated;
    const written = await deps.writeBytes({ repoId: req.repoId, project: req.group, path: `${req.asset}/reference/reference.png`, data: png });
    if (!written.ok) return written;
    announce(req);
    return ok();
  }

  // --- frames --------------------------------------------------------------------

  async function writeFrameMeta(target: SpriteTarget, dir: string, change: (frames: SpriteFramesFile) => void): Promise<GitOpResult> {
    return queue.run(`${dir}#frames`, async () => {
      const frames = await readFrames(dir);
      change(frames);
      return deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${SPRITE_FRAMES_FILE}`, data: json(frames) });
    });
  }

  /**
   * The frame strip's edits (Theme G), applied in order under the frames lock. `delete` moves the PNG
   * (and its metadata) to `frames/.trash/` so `restore` can undo it; `move` renames files within one
   * clip and direction. A `reroll` starts a job for just those frames once the edits are on disk.
   */
  async function patchFrames(req: SpritePatchFramesRequest): Promise<GitOpResult<SpritePatchFramesResult>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      if (running.has(keyOf(req))) return failure(SPRITE_JOB_BUSY);
      const edits = req.ops.filter((op) => op.op !== 'reroll');
      const rerolls = [...new Set(req.ops.flatMap((op) => (op.op === 'reroll' ? op.keys : [])))];
      if (edits.length > 0) {
        const applied = await queue.run(`${dir}#frames`, async (): Promise<GitOpResult> => {
          const file = await readFrames(dir);
          let outcome: GitOpResult = ok();
          for (const op of edits) {
            outcome = await applyFrameOp(dir, file, op);
            if (!outcome.ok) break;
          }
          // Whatever ran is on disk, so the metadata is written even when a later op failed.
          const written = await deps.writeBytes({ repoId: req.repoId, project: req.group, path: `${req.asset}/${SPRITE_FRAMES_FILE}`, data: json(file) });
          return outcome.ok ? written : outcome;
        });
        announce(req);
        if (!applied.ok) return applied;
      }
      if (rerolls.length === 0) return ok({});
      const clips = [...new Set(rerolls.map((key) => parseSpriteFrameKey(key)?.clip).filter((c): c is string => !!c))];
      const started = await generate({ repoId: req.repoId, group: req.group, asset: req.asset, clips, frames: rerolls });
      return started.ok ? ok({ jobId: started.value.jobId }) : started;
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function applyFrameOp(dir: string, file: SpriteFramesFile, op: Exclude<SpritePatchOp, { op: 'reroll' }>): Promise<GitOpResult> {
    const parsed = parseSpriteFrameKey(op.key);
    if (!parsed) return failure(`${op.key} is not a frame.`);
    const { clip, dir: direction, n } = parsed;
    const png = (m: number) => join(dir, spriteFramePath(clip, direction, m));
    const trashed = join(dir, SPRITE_TRASH_DIR, `${op.key}.png`);
    const trashedMeta = join(dir, SPRITE_TRASH_DIR, `${op.key}.json`);
    const missing = () => failure(`Frame ${op.key} does not exist.`);
    const meta = file.frames[op.key];
    switch (op.op) {
      case 'nudge': {
        if (!meta) return missing();
        const clamp = (v: number) => Math.max(-64, Math.min(64, v));
        meta.anchorNudge = [clamp(meta.anchorNudge[0] + op.dx), clamp(meta.anchorNudge[1] + op.dy)];
        return ok();
      }
      case 'flip':
        if (!meta) return missing();
        meta.flipped = !meta.flipped;
        return ok();
      case 'delete': {
        if (!meta) return missing();
        await mkdir(dirname(trashed), { recursive: true });
        await rename(png(n), trashed).catch(() => undefined);
        await writeFile(trashedMeta, json(meta));
        delete file.frames[op.key];
        return ok();
      }
      case 'restore': {
        if (meta) return failure(`Frame ${op.key} already exists.`);
        if (!(await exists(trashed))) return failure(`Frame ${op.key} is not in the trash any more.`);
        let restored: SpriteFrameMeta;
        try {
          restored = SpriteFrameMetaSchema.parse(JSON.parse(await readFile(trashedMeta, 'utf8')));
        } catch {
          restored = SpriteFrameMetaSchema.parse({});
        }
        await mkdir(dirname(png(n)), { recursive: true });
        await rename(trashed, png(n));
        await rm(trashedMeta, { force: true });
        file.frames[op.key] = restored;
        return ok();
      }
      case 'move': {
        if (!meta) return missing();
        const renames = moveRenames(frameSlots(file, clip, direction), n, op.to);
        // Two passes through temporary names, so no rename lands on a frame still to be moved.
        const metas = new Map(renames.map(([from]) => [from, file.frames[spriteFrameKey(clip, direction, from)]!]));
        for (const [from] of renames) await rename(png(from), `${png(from)}.moving`).catch(() => undefined);
        for (const [from, to] of renames) {
          await rename(`${png(from)}.moving`, png(to)).catch(() => undefined);
          file.frames[spriteFrameKey(clip, direction, to)] = metas.get(from)!;
        }
        return ok();
      }
    }
  }

  /** Drops frames no clip plays any more (a shorter re-render, a removed clip) — files and metadata. */
  async function pruneStale(target: SpriteTarget, dir: string, clips: readonly string[] | undefined): Promise<void> {
    const current = await readSpec(dir);
    if (!current.ok || current.value.kind !== 'sheet') return;
    const spec = current.value;
    let removed: string[] = [];
    await writeFrameMeta(target, dir, (file) => {
      removed = staleFrameKeys(spec, file, clips);
      for (const key of removed) delete file.frames[key];
    });
    for (const key of removed) {
      const parsed = parseSpriteFrameKey(key);
      if (parsed) await rm(join(dir, spriteFramePath(parsed.clip, parsed.dir, parsed.n)), { force: true });
    }
  }

  // --- export (Theme G) ------------------------------------------------------------

  async function exportPack(req: SpriteExportRequest): Promise<GitOpResult<SpriteExportResult>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      if (running.has(keyOf(req))) return failure(SPRITE_JOB_BUSY);
      const spec = await readSpec(dir);
      if (!spec.ok) return spec;
      const pack = SpritePackOptionsSchema.parse(req.pack ?? {});
      const result = await queue.run(`${dir}#frames`, async () =>
        exportSprite({ dir, spec: spec.value, frames: await readFrames(dir), pack, ...(req.dest ? { dest: req.dest } : {}) }),
      );
      if (result.ok) {
        deps.onChanged(req.repoId);
        deps.log(`sprite export ${req.asset} frames=${result.value.frames} pages=${result.value.pages} bytes=${result.value.bytes}`);
      }
      return result;
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  // --- jobs ----------------------------------------------------------------------

  async function generate(req: SpriteGenerateRequest): Promise<GitOpResult<{ jobId: string }>> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const key = keyOf(req);
      if (running.has(key)) return failure(SPRITE_JOB_BUSY);
      const { dir } = located.value;
      const read = await readSpec(dir);
      if (!read.ok) return read;
      // One-shot's hand-off (Theme F) runs one job with another method; the stored spec keeps its own.
      const spec = { value: req.method && read.value.kind === 'sheet' ? { ...read.value, method: req.method } : read.value };
      if (!req.turnaround && spec.value.kind === 'sheet' && spec.value.method === 'rendered' && spec.value.reference?.kind !== 'model') return failure(SPRITE_NEEDS_MODEL);
      if (req.turnaround && spec.value.kind !== 'sheet') return failure('Only a sprite sheet has a reference.');
      if (req.frames && spec.value.kind === 'sheet' && spec.value.method === 'one-shot') return failure(ONE_SHOT_NO_FRAME_REROLL);
      const refused = deps.preflight?.(spec.value, req) ?? null;
      if (refused) return failure(refused);
      if (running.has(key)) return failure(SPRITE_JOB_BUSY);

      const job: Job = {
        id: randomUUID(),
        key,
        controller: new AbortController(),
        status: { jobId: '', state: 'running', done: 0, total: 0 },
      };
      job.status.jobId = job.id;
      jobs.set(job.id, job);
      running.set(key, job);
      void runJob(job, { repoId: req.repoId, group: req.group, asset: req.asset }, dir, spec.value, { clips: req.clips, frames: req.frames, turnaround: req.turnaround === true });
      return ok({ jobId: job.id });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  /** The sheet pass: palette (pixel mode), validation badges and the reference heights. */
  async function finishPipeline(target: SpriteTarget, dir: string, pipeline: FramePipeline): Promise<void> {
    if (pipeline.count === 0) return;
    const result = await pipeline.finish();
    const owned = new Set<SpriteBadge>(SPRITE_PIPELINE_BADGES);
    await writeFrameMeta(target, dir, (file) => {
      file.referenceHeights = result.referenceHeights;
      for (const [key, badges] of Object.entries(result.badges)) {
        const meta = file.frames[key];
        if (meta) meta.badges = [...meta.badges.filter((b) => !owned.has(b)), ...badges];
      }
    });
    if (result.palette) {
      const colours = result.palette;
      await updateSpec(target, dir, (current) => (current.kind === 'sheet' && colours.length >= 2 ? { spec: { ...current, palette: { colours } } } : { spec: current }));
    }
  }

  async function runJob(
    job: Job,
    target: SpriteTarget,
    dir: string,
    spec: SpriteAssetSpec,
    { clips, frames: onlyFrames, turnaround }: { clips: readonly string[] | undefined; frames: readonly string[] | undefined; turnaround: boolean },
  ): Promise<void> {
    const started = Date.now();
    // Deleted frames wait in the trash for an undo only until the next generation.
    await rm(join(dir, SPRITE_TRASH_DIR), { recursive: true, force: true }).catch(() => undefined);
    let frames = 0;
    let requests = 0;
    const notes: string[] = [];
    let end: 'done' | 'cancelled' | `failed:${string}` = 'done';
    const progress: SpriteJobContext['progress'] = (event) => {
      job.status.done = event.done;
      job.status.total = event.total;
      deps.emitProgress({ jobId: job.id, ...event });
    };
    const writeFrame: SpriteJobContext['writeFrame'] = async ({ clip, dir: direction, n, png, meta }) => {
      const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${spriteFramePath(clip, direction, n)}`, data: png });
      if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'Could not write a frame.');
      await writeFrameMeta(target, dir, (file) => {
        file.frames[spriteFrameKey(clip, direction, n)] = { anchorNudge: [0, 0], flipped: false, source: 'generated', badges: [], ...meta };
      });
      frames += 1;
    };
    let pipeline: FramePipeline | null = null;
    const pipelineFor = async (): Promise<FramePipeline> => {
      if (spec.kind !== 'sheet') throw new Error('Only a sprite sheet has frames to normalise.');
      if (!pipeline) {
        const { referenceHeights } = await readFrames(dir);
        const seen = new Set<string>();
        pipeline = createFramePipeline(
          spec,
          {
            toPng: deps.toPng,
            readFrame: (clip, direction, n) => readFile(join(dir, spriteFramePath(clip, direction, n))).catch(() => null),
            writeFrame: async ({ clip, dir: direction, n, png }) => {
              const key = spriteFrameKey(clip, direction, n);
              if (seen.has(key)) {
                // The palette pass rewrites the image only; the metadata is already on disk.
                const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${spriteFramePath(clip, direction, n)}`, data: png });
                if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'Could not write a frame.');
                return;
              }
              seen.add(key);
              const meta = pending.get(key);
              await writeFrame({ clip, dir: direction, n, png, ...(meta ? { meta } : {}) });
            },
          },
          { referenceHeights },
        );
      }
      return pipeline;
    };
    const pending = new Map<string, Partial<SpriteFrameMeta>>();
    try {
      const runner = deps.runJob;
      if (!runner) throw new Error(SPRITE_FRAME_SOURCES_PENDING);
      await runner({
        jobId: job.id,
        target,
        spec,
        dir,
        signal: job.controller.signal,
        clips,
        frames: onlyFrames,
        progress,
        writeFrame,
        turnaround,
        countRequest: () => {
          requests += 1;
        },
        note: (message) => {
          if (!notes.includes(message)) notes.push(message);
        },
        writeReference: async (bytes, opts) => {
          const png = await deps.toPng(bytes);
          if (!png) throw new Error(NOT_AN_IMAGE);
          for (const path of opts?.turnaround ? ['reference/turnaround.png', 'reference/reference.png'] : ['reference/reference.png']) {
            const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${path}`, data: png });
            if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'Could not write the reference.');
          }
          const updated = await updateSpec(target, dir, (current) =>
            current.kind === 'sheet' ? { spec: { ...current, reference: { kind: 'image', file: 'reference/reference.png', approved: false } } } : { fail: failure('Only a sprite sheet has a reference.') },
          );
          if (!updated.ok) throw new Error(updated.kind === 'error' ? updated.message : 'Could not update the reference.');
        },
        updateSheet: async (change) => {
          const updated = await updateSpec(target, dir, (current) => (current.kind === 'sheet' ? { spec: change(current) } : { fail: failure('Only a sprite sheet has frames.') }));
          if (!updated.ok) throw new Error(updated.kind === 'error' ? updated.message : 'Could not update the sprite.');
        },
        updateAsset: async (change) => {
          const updated = await updateSpec(target, dir, (current) => ({ spec: change(current) }));
          if (!updated.ok) throw new Error(updated.kind === 'error' ? updated.message : 'Could not update the asset.');
        },
        writeAssetFile: async (path, data) => {
          const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${path}`, data });
          if (!written.ok) throw new Error(written.kind === 'error' ? written.message : `Could not write ${path}.`);
        },
        submitFrame: async ({ clip, dir: direction, n, bytes, meta }) => {
          const p = await pipelineFor();
          if (meta) pending.set(spriteFrameKey(clip, direction, n), meta);
          return p.process({ clip, dir: direction, n, bytes, rendered: meta?.source === 'rendered' });
        },
      });
      if (job.controller.signal.aborted) end = 'cancelled';
    } catch (error) {
      end = job.controller.signal.aborted ? 'cancelled' : `failed:${error instanceof Error ? error.message : String(error)}`;
    }
    if (pipeline) {
      try {
        await finishPipeline(target, dir, pipeline);
      } catch (error) {
        if (end === 'done') end = `failed:${error instanceof Error ? error.message : String(error)}`;
      }
    }
    // A clip re-rendered shorter leaves higher-numbered frames behind; nothing plays them, so they go.
    if (end === 'done' && spec.kind === 'sheet' && !turnaround && !onlyFrames) {
      try {
        await pruneStale(target, dir, clips);
      } catch {
        /* a frame that will not delete stays out of the previewer and the pack anyway */
      }
    }
    if (frames > 0) {
      const all = await readFrames(dir);
      const entries = Object.values(all.frames);
      await updateSpec(target, dir, (current) => ({
        spec: { ...current, lastReport: { frames: entries.length, failing: entries.filter((f) => f.badges.length > 0).length, at: now().toISOString() } } as SpriteAssetSpec,
      }));
    }
    // The job reads as finished only once everything it wrote (frames, badges, report) is on disk.
    running.delete(job.key);
    job.status.state = end === 'done' ? 'done' : end === 'cancelled' ? 'cancelled' : 'failed';
    if (end === 'cancelled') job.status.message = SPRITE_JOB_CANCELLED;
    else if (end.startsWith('failed:')) job.status.message = end.slice('failed:'.length);
    else if (notes.length > 0) job.status.message = notes.join(' ');
    deps.emitProgress({
      jobId: job.id,
      done: job.status.done,
      total: job.status.total,
      stage: 'processing',
      state: job.status.state as 'done' | 'cancelled' | 'failed',
      ...(job.status.message ? { message: job.status.message } : {}),
    });
    deps.log(`sprite job ${target.asset} method=${spec.kind === 'sheet' ? spec.method : spec.kind} frames=${frames} requests=${requests || frames} ms=${Date.now() - started} ${end}`);
    announce(target);
  }

  function jobStatus(jobId: string): SpriteJobStatus | null {
    return jobs.get(jobId)?.status ?? null;
  }

  function cancel(jobId: string): GitOpResult {
    const job = jobs.get(jobId);
    if (!job || job.status.state !== 'running') return failure('No such running job.');
    job.controller.abort();
    return ok();
  }

  return { library, get, setSpec, setReference, patchFrames, generate, jobStatus, cancel, export: exportPack };
}

export type SpriteService = ReturnType<typeof createSpriteService>;

function firstIssue(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues;
  const issue = issues?.[0];
  if (issue) return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
  return error instanceof Error ? error.message : String(error);
}
