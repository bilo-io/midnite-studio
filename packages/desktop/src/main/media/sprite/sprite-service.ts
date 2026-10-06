import { randomUUID } from 'node:crypto';
import { cp, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { WriteQueue } from '@midnite/studio-git-engine';
import {
  failure,
  ok,
  parseSpriteSpec,
  presetClips,
  SPRITE_FRAME_SOURCES_PENDING,
  SPRITE_FRAMES_FILE,
  SPRITE_JOB_BUSY,
  SPRITE_JOB_CANCELLED,
  SPRITE_NEEDS_MODEL,
  SPRITE_NOT_AVAILABLE,
  SPRITE_SPEC_FILE,
  SpriteFramesFileSchema,
  spriteFrameKey,
  spriteFramePath,
  spriteGroupOf,
  spriteSlug,
  spriteTimeStamp,
  type GitOpResult,
  type SpriteAssetSpec,
  type SpriteChangedEvent,
  type SpriteFrameMeta,
  type SpriteFramesFile,
  type SpriteGenerateRequest,
  type SpriteGetResult,
  type SpriteGroupId,
  type SpriteJobStatus,
  type SpriteLibraryRequest,
  type SpriteLibraryResult,
  type SpritePatchFramesRequest,
  type SpriteProgressEvent,
  type SpriteSetReferenceRequest,
  type SpriteSetSpecRequest,
  type SpriteTarget,
} from '@midnite/studio-shared';

import { confineToRoot, joinWithin } from '../../fs-scope';

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
  progress: (event: Omit<SpriteProgressEvent, 'jobId'>) => void;
  /** Writes a normalised frame PNG and its metadata. */
  writeFrame: (frame: { clip: string; dir: string; n: number; png: Buffer; meta?: Partial<SpriteFrameMeta> }) => Promise<void>;
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
  onChanged: (repoId: string) => void;
  emitProgress: (event: SpriteProgressEvent) => void;
  emitChanged: (event: SpriteChangedEvent) => void;
  log: (line: string) => void;
  now?: () => Date;
};

export const NOT_AN_IMAGE = 'Use a PNG, JPEG or WebP image.';

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

  // --- frames --------------------------------------------------------------------

  async function writeFrameMeta(target: SpriteTarget, dir: string, change: (frames: SpriteFramesFile) => void): Promise<GitOpResult> {
    return queue.run(`${dir}#frames`, async () => {
      const frames = await readFrames(dir);
      change(frames);
      return deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${SPRITE_FRAMES_FILE}`, data: json(frames) });
    });
  }

  async function patchFrames(req: SpritePatchFramesRequest): Promise<GitOpResult> {
    try {
      const located = await locate(req);
      if (!located.ok) return located;
      const { dir } = located.value;
      for (const p of req.patches) {
        if (!(await exists(join(dir, spriteFramePath(p.clip, p.dir, p.n))))) return failure(`Frame ${spriteFrameKey(p.clip, p.dir, p.n)} does not exist.`);
      }
      const written = await writeFrameMeta(req, dir, (frames) => {
        for (const p of req.patches) {
          const key = spriteFrameKey(p.clip, p.dir, p.n);
          if (p.delete) {
            delete frames.frames[key];
            continue;
          }
          const meta: SpriteFrameMeta = frames.frames[key] ?? { anchorNudge: [0, 0], flipped: false, source: 'generated', badges: [] };
          frames.frames[key] = { ...meta, ...(p.anchorNudge ? { anchorNudge: p.anchorNudge } : {}), ...(p.flipped !== undefined ? { flipped: p.flipped } : {}) };
        }
      });
      if (!written.ok) return written;
      for (const p of req.patches) if (p.delete) await rm(join(dir, spriteFramePath(p.clip, p.dir, p.n)), { force: true });
      announce(req);
      return ok();
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
      const spec = await readSpec(dir);
      if (!spec.ok) return spec;
      if (spec.value.kind === 'sheet' && spec.value.method === 'rendered' && spec.value.reference?.kind !== 'model') return failure(SPRITE_NEEDS_MODEL);
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
      void runJob(job, { repoId: req.repoId, group: req.group, asset: req.asset }, dir, spec.value, req.clips);
      return ok({ jobId: job.id });
    } catch (error) {
      return failure(error instanceof Error ? error.message : String(error));
    }
  }

  async function runJob(job: Job, target: SpriteTarget, dir: string, spec: SpriteAssetSpec, clips: readonly string[] | undefined): Promise<void> {
    const started = Date.now();
    let frames = 0;
    let end: 'done' | 'cancelled' | `failed:${string}` = 'done';
    const progress: SpriteJobContext['progress'] = (event) => {
      job.status.done = event.done;
      job.status.total = event.total;
      deps.emitProgress({ jobId: job.id, ...event });
    };
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
        progress,
        writeFrame: async ({ clip, dir: direction, n, png, meta }) => {
          const written = await deps.writeBytes({ repoId: target.repoId, project: target.group, path: `${target.asset}/${spriteFramePath(clip, direction, n)}`, data: png });
          if (!written.ok) throw new Error(written.kind === 'error' ? written.message : 'Could not write a frame.');
          await writeFrameMeta(target, dir, (file) => {
            file.frames[spriteFrameKey(clip, direction, n)] = { anchorNudge: [0, 0], flipped: false, source: 'generated', badges: [], ...meta };
          });
          frames += 1;
        },
      });
      if (job.controller.signal.aborted) end = 'cancelled';
    } catch (error) {
      end = job.controller.signal.aborted ? 'cancelled' : `failed:${error instanceof Error ? error.message : String(error)}`;
    }
    running.delete(job.key);
    job.status.state = end === 'done' ? 'done' : end === 'cancelled' ? 'cancelled' : 'failed';
    if (end === 'cancelled') job.status.message = SPRITE_JOB_CANCELLED;
    else if (end.startsWith('failed:')) job.status.message = end.slice('failed:'.length);
    if (frames > 0) {
      const all = await readFrames(dir);
      const entries = Object.values(all.frames);
      await updateSpec(target, dir, (current) => ({
        spec: { ...current, lastReport: { frames: entries.length, failing: entries.filter((f) => f.badges.length > 0).length, at: now().toISOString() } } as SpriteAssetSpec,
      }));
    }
    deps.emitProgress({
      jobId: job.id,
      done: job.status.done,
      total: job.status.total,
      stage: 'processing',
      state: job.status.state === 'running' ? 'done' : job.status.state,
      ...(job.status.message ? { message: job.status.message } : {}),
    });
    deps.log(`sprite job ${target.asset} method=${spec.kind === 'sheet' ? spec.method : spec.kind} frames=${frames} requests=${frames} ms=${Date.now() - started} ${end}`);
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

  return { library, get, setSpec, setReference, patchFrames, generate, jobStatus, cancel };
}

export type SpriteService = ReturnType<typeof createSpriteService>;

/** What the handler answers for the channels whose theme has not landed (export). */
export const spriteNotAvailableYet = (): GitOpResult => failure(SPRITE_NOT_AVAILABLE);

function firstIssue(error: unknown): string {
  const issues = (error as { issues?: Array<{ path: Array<string | number>; message: string }> }).issues;
  const issue = issues?.[0];
  if (issue) return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message;
  return error instanceof Error ? error.message : String(error);
}
