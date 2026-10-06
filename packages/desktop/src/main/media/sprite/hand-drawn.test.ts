import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createRgba, hexToRgb, ok, failure, SPRITE_APPROVE_FIRST, SPRITE_POSE_TABLES, type SpriteFramesFile } from '@midnite/studio-shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImageBytesRequest } from '../image/image-service';
import type { VisionCall } from '../model/engines';
import { encodePngRgba8 } from '../png/png-codec';
import { consistencyUnchecked, createHandDrawnRunner, handDrawnPreflight } from './hand-drawn';
import { createSpriteService } from './sprite-service';

/** No provider and no vision model is ever reached: both are stubs. */
let repo: string;
let root: string;

beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'sprite-hand-drawn-'));
  root = join(repo, '.midnite', 'media', 'sprite');
  await mkdir(root, { recursive: true });
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

/** A blue figure on magenta, as a provider without alpha would return it. */
function figure(): Buffer {
  const size = 48;
  const img = createRgba(size, size);
  const fg = hexToRgb('#2060c0');
  const bg = hexToRgb('#ff00ff');
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) {
      const c = x >= 18 && x < 30 && y >= 8 && y < 44 ? fg : bg;
      img.data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
    }
  return encodePngRgba8(new Uint8Array(img.data.buffer), size, size);
}

function setup(vision: VisionCall, generate?: (req: ImageBytesRequest) => void) {
  const requests: ImageBytesRequest[] = [];
  const generateImage = vi.fn(async (req: ImageBytesRequest) => {
    requests.push(req);
    generate?.(req);
    return ok({ bytes: figure(), mime: 'image/png' });
  });
  const runJob = createHandDrawnRunner({ generateImage, visionCall: vision });
  const service = createSpriteService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return ok(undefined);
    },
    trash: (abs) => rm(abs, { recursive: true, force: true }),
    toPng: async (bytes) => Buffer.from(bytes),
    onChanged: () => undefined,
    emitProgress: () => undefined,
    emitChanged: () => undefined,
    log: () => undefined,
    runJob,
    preflight: handDrawnPreflight,
    now: () => new Date(2026, 9, 6, 12, 0, 0),
  });
  return { service, requests, generateImage };
}

async function sheet(service: ReturnType<typeof setup>['service'], spec: Record<string, unknown> = {}) {
  const created = await service.library({
    op: 'create',
    repoId: 'r',
    spec: { kind: 'sheet', name: 'Hero', prompt: 'a knight', provider: 'gemini', model: 'gemini-2.5-flash-image', clips: [{ name: 'walk', frames: 8 }], ...spec },
  });
  if (!created.ok || !created.value.group || !created.value.asset) throw new Error('create failed');
  return { repoId: 'r', group: created.value.group, asset: created.value.asset };
}

async function approved(service: ReturnType<typeof setup>['service'], spec: Record<string, unknown> = {}) {
  const target = await sheet(service, spec);
  expect((await service.setReference({ ...target, bytes: figure(), name: 'ref.png' })).ok).toBe(true);
  expect((await service.setReference({ ...target, approve: true, frames: 'keep' })).ok).toBe(true);
  return target;
}

async function run(service: ReturnType<typeof setup>['service'], target: Awaited<ReturnType<typeof sheet>>, extra: { turnaround?: true } = {}) {
  const started = await service.generate({ ...target, ...extra });
  if (!started.ok) throw new Error(started.kind === 'error' ? started.message : 'generate failed');
  await vi.waitFor(() => expect(service.jobStatus(started.value.jobId)?.state).not.toBe('running'));
  return service.jobStatus(started.value.jobId)!;
}

const framesOf = async (target: { group: string; asset: string }): Promise<SpriteFramesFile> =>
  JSON.parse(await readFile(join(root, target.group, target.asset, 'frames/frames.json'), 'utf8')) as SpriteFramesFile;

const passing: VisionCall = async () => ok({ text: '{"score": 0.95, "issues": []}', model: 'qwen2.5vl:7b' });

describe('hand-drawn frame source', () => {
  it('refuses frames until a reference is approved', async () => {
    const { service } = setup(passing);
    const target = await sheet(service);
    await service.setReference({ ...target, bytes: figure(), name: 'ref.png' });
    const refused = await service.generate(target);
    expect(refused).toEqual(failure(SPRITE_APPROVE_FIRST));
  });

  it('draws a turnaround as the unapproved reference', async () => {
    const { service, requests } = setup(passing);
    const target = await sheet(service);
    const status = await run(service, target, { turnaround: true });
    expect(status.state).toBe('done');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.aspect).toBe('3:2');
    expect(requests[0]!.prompt).toMatch(/turnaround/);
    expect(requests[0]!.references).toBeUndefined();
    await stat(join(root, target.group, target.asset, 'reference/turnaround.png'));
    const got = await service.get(target);
    expect(got.ok && got.value.spec.kind === 'sheet' && got.value.spec.reference).toEqual({ kind: 'image', file: 'reference/reference.png', approved: false });
  });

  it('expands the walk pose table into eight prompts in order, each with the reference attached', async () => {
    const { service, requests } = setup(passing);
    const target = await approved(service, { mirror: false, targetPerspective: 'front' });
    const status = await run(service, target);
    expect(status.state).toBe('done');
    expect(requests).toHaveLength(8);
    SPRITE_POSE_TABLES.walk!.forEach((pose, i) => expect(requests[i]!.prompt).toContain(pose));
    expect(requests.every((r) => r.references?.length === 1 && r.aspect === '1:1')).toBe(true);
    // Gemini gets the chroma clause; it cannot return alpha.
    expect(requests[0]!.prompt).toMatch(/#ff00ff/);
    expect(requests[0]!.transparent).toBeUndefined();
    const frames = await framesOf(target);
    expect(Object.keys(frames.frames).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `walk/s/00${i}`));
    expect(frames.frames['walk/s/000']).toMatchObject({ score: 0.95, badges: [] });
  });

  it('re-rolls a failing frame up to the budget, then flags it inconsistent with the issues', async () => {
    const vision = vi.fn<VisionCall>(async () => ok({ text: '{"score": 0.2, "issues": ["wrong helmet"]}', model: 'qwen2.5vl:7b' }));
    const { service, requests } = setup(vision);
    const target = await approved(service, { targetPerspective: 'front', clips: [{ name: 'idle', frames: 1 }], consistency: { rerollBudget: 2 } });
    await run(service, target);
    expect(requests).toHaveLength(3);
    expect(vision).toHaveBeenCalledTimes(3);
    expect((await framesOf(target)).frames['idle/s/000']).toMatchObject({ badges: ['inconsistent'], issues: ['wrong helmet'], score: 0.2 });
  });

  it('keeps a frame as unchecked when the vision call fails, and says why', async () => {
    const vision: VisionCall = async () => failure('No Ollama vision model is installed.');
    const { service, requests } = setup(vision);
    const target = await approved(service, { targetPerspective: 'front', clips: [{ name: 'idle', frames: 2 }] });
    const status = await run(service, target);
    expect(status).toMatchObject({ state: 'done', message: consistencyUnchecked('No Ollama vision model is installed.') });
    expect(requests).toHaveLength(2);
    const frames = await framesOf(target);
    expect(frames.frames['idle/s/000']!.badges).toEqual(['unchecked']);
    expect(frames.frames['idle/s/001']!.badges).toEqual(['unchecked']);
  });

  it('mirrors a side sheet: eight drawn east frames, eight flipped west frames, no extra requests', async () => {
    const { service, requests } = setup(passing);
    const target = await approved(service);
    await run(service, target);
    expect(requests).toHaveLength(8);
    expect(requests.every((r) => r.prompt.includes('facing right'))).toBe(true);
    const frames = await framesOf(target);
    const west = Object.entries(frames.frames).filter(([key]) => key.startsWith('walk/w/'));
    expect(west).toHaveLength(8);
    expect(west.every(([, meta]) => meta.flipped && meta.source === 'mirrored')).toBe(true);
    expect(frames.referenceHeights).toHaveProperty('w');
  });

  it('draws the west facing too when the character is asymmetric', async () => {
    const { service, requests } = setup(passing);
    const target = await approved(service, { mirror: false });
    await run(service, target);
    expect(requests).toHaveLength(16);
    expect(requests.filter((r) => r.prompt.includes('facing left'))).toHaveLength(8);
  });

  it('marks existing frames for re-roll when a new reference is approved over them', async () => {
    const { service } = setup(passing);
    const target = await approved(service, { targetPerspective: 'front', clips: [{ name: 'idle', frames: 1 }] });
    await run(service, target);
    await service.setReference({ ...target, bytes: figure(), name: 'new.png' });
    expect((await service.setReference({ ...target, approve: true, frames: 'mark' })).ok).toBe(true);
    expect((await framesOf(target)).frames['idle/s/000']!.badges).toEqual(['unchecked']);
  });
});
