// vitest (node): the sprite MCP tools over a real SpriteService with stub frame sources — no Electron,
// no provider, no browser capability. Covers the gate (through the dispatcher), the 200-request cap,
// structured validation errors, the generate → poll → report → export round trip, the preview's
// pictures and the map patch loop.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  assembleTileset,
  createRgba,
  MCP_CONTENT_KEY,
  PhaserAtlasJsonSchema,
  isSpriteMcpToolId,
  SPRITE_MCP_TOOL_IDS,
  SPRITE_MCP_WRITE_TOOL_IDS,
  SPRITES_OFF_MESSAGE,
  TilesetSpecSchema,
  spriteRequestCapMessage,
  type GitOpResult,
} from '@midnite/studio-shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchMcpCall } from '../../mcp/dispatch';
import { setSpriteTools } from '../../mcp/sprite-tools';
import { resetMcpAllowUiStateForTests, setMcpAllowSpritesState } from '../../mcp/ui-gate';
import { pngChunks } from '../png/apng';
import { encodePngRgba8 } from '../png/png-codec';
import type { LlmCall } from '../model/model-service';
import { createMapRunner, mapPreflight } from './map-generate';
import { createSpriteTools } from './sprite-mcp';
import { createSpriteService, type SpriteJobRunner } from './sprite-service';

let repo: string;
let root: string;
const opened: unknown[] = [];

/** A 16 × 16 frame: a block whose colour says which frame it is. */
const framePng = (n: number) => {
  const data = new Uint8Array(16 * 16 * 4);
  for (let y = 4; y < 16; y += 1) for (let x = 4; x < 12; x += 1) data.set([40 * n, 120, 200, 255], (y * 16 + x) * 4);
  return encodePngRgba8(data, 16, 16);
};

/** The stub provider: every frame of every requested clip, the second one badged `drift`. */
const stubFrames: SpriteJobRunner = async (ctx) => {
  if (ctx.spec.kind !== 'sheet') throw new Error('sheets only');
  const clips = ctx.spec.clips.filter((c) => !ctx.clips || ctx.clips.includes(c.name));
  let done = 0;
  for (const clip of clips)
    for (let n = 0; n < clip.frames; n += 1) {
      ctx.countRequest();
      await ctx.writeFrame({ clip: clip.name, dir: 'e', n, png: framePng(n), meta: { badges: n === 1 ? ['drift'] : [] } });
      ctx.progress({ done: ++done, total: clips.length * clip.frames, stage: 'generating' });
    }
};

const layout = JSON.stringify({ width: 10, height: 8, base: 'grass', regions: [{ terrain: 'water', shape: 'rect', points: [[3, 3], [5, 5]] }], objects: [{ type: 'spawn', name: 'player', x: 0, y: 0 }] });
const llm: LlmCall = vi.fn(async (): Promise<GitOpResult<{ text: string }>> => ({ ok: true, value: { text: layout } }));
const mapRunner = createMapRunner({ llmCall: llm });

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'sprite-mcp-'));
  root = join(repo, '.midnite', 'media', 'sprite');
  await mkdir(root, { recursive: true });
  const service = createSpriteService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true, value: undefined };
    },
    trash: (abs) => rm(abs, { recursive: true, force: true }),
    toPng: async () => null,
    onChanged: () => undefined,
    emitProgress: () => undefined,
    emitChanged: () => undefined,
    log: () => undefined,
    runJob: (ctx) => (ctx.spec.kind === 'map' ? mapRunner(ctx) : stubFrames(ctx)),
    preflight: mapPreflight,
  });
  setSpriteTools(
    createSpriteTools({
      service,
      resolveRepo: async (p) => (p === repo ? { ok: true, repoId: 'r', repoRoot: repo } : { ok: false, kind: 'not-found', message: 'No such repository.' }),
      rootFor: async () => root,
      listFiles: async ({ project }) => {
        const entries = await readdir(join(root, project)).catch(() => [] as string[]);
        return { ok: true, value: entries.map((e) => ({ path: `${e}/sprite.json`, mtimeMs: 1 })) };
      },
      emitOpen: (e) => opened.push(e),
    }),
  );
  // A built tileset for the map tests, as Theme H's job writes it.
  const tileset = TilesetSpecSchema.parse({
    kind: 'tileset',
    name: 'meadow',
    tileSize: 16,
    terrains: [
      { id: 'grass', label: 'Grass', collision: 'walkable' },
      { id: 'water', label: 'Water', collision: 'water' },
    ],
    transitions: [{ a: 'grass', b: 'water' }],
  });
  const solid = () => {
    const img = createRgba(16, 16);
    img.data.fill(200);
    return img;
  };
  const built = assembleTileset(tileset, tileset.terrains.map((t) => ({ id: t.id, collision: t.collision, image: solid() })));
  const dir = join(root, 'tilesets', 'meadow-20261004-120000');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sprite.json'), JSON.stringify({ ...tileset, lastReport: { frames: 49, failing: 0, at: 'x' } }));
  await writeFile(join(dir, 'tileset.tsj'), JSON.stringify(built.tsj));
  await writeFile(join(dir, 'tileset.png'), encodePngRgba8(new Uint8Array(built.sheet.data.buffer), built.sheet.width, built.sheet.height));
});

afterAll(async () => {
  setSpriteTools(null);
  await rm(repo, { recursive: true, force: true });
});
beforeEach(() => setMcpAllowSpritesState(true));
afterEach(() => resetMcpAllowUiStateForTests());

async function until(jobId: string) {
  for (let i = 0; i < 200; i += 1) {
    const status = await dispatchMcpCall('sprite_job_status', { jobId });
    if (status.ok && (status.value as { state: string }).state !== 'running') return status.value as { state: string; message?: string };
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('job did not finish');
}

describe('the sprite MCP tools', () => {
  it('refuses every write tool with the switch off, and still answers the reads', async () => {
    setMcpAllowSpritesState(false);
    const target = { repoPath: repo, group: 'characters', asset: 'x' };
    const inputs: Record<string, unknown> = {
      sprite_open: target,
      sprite_set_spec: { ...target, patch: {} },
      sprite_generate: { repoPath: repo, spec: { kind: 'sheet', name: 'x' } },
      sprite_regenerate_frames: { ...target, frames: ['walk/e/000'] },
      sprite_patch_frames: { ...target, ops: [{ op: 'flip', key: 'walk/e/000' }] },
      tileset_generate: { repoPath: repo, spec: { kind: 'tileset', name: 't' } },
      background_generate: { repoPath: repo, spec: { kind: 'background', name: 'b' } },
      map_generate: { repoPath: repo, spec: { kind: 'map', name: 'm' } },
      map_patch: { ...target, group: 'maps', ops: [{ op: 'refill' }] },
      sprite_export: target,
      sprite_cancel: { jobId: 'j' },
    };
    for (const tool of SPRITE_MCP_WRITE_TOOL_IDS) expect(await dispatchMcpCall(tool, inputs[tool]), tool).toEqual({ ok: false, kind: 'refused', message: SPRITES_OFF_MESSAGE });
    expect(await dispatchMcpCall('sprite_list', { repoPath: repo })).toMatchObject({ ok: true });
    expect(await dispatchMcpCall('sprite_recommend_method', { repoPath: repo, spec: { targetPerspective: 'isometric', directions: 8 } })).toMatchObject({ ok: true, value: { method: 'rendered' } });
  });

  it('refuses a job over 200 requests before creating anything', async () => {
    const before = await readdir(join(root, 'characters')).catch(() => [] as string[]);
    const result = await dispatchMcpCall('sprite_generate', {
      repoPath: repo,
      spec: { kind: 'sheet', name: 'army', targetPerspective: 'isometric', directions: 8, clips: [{ name: 'walk', frames: 12 }, { name: 'run', frames: 1 }] },
    });
    // 13 frames × 8 directions × 3 (two re-rolls) = 312
    expect(result).toEqual({ ok: false, kind: 'refused', message: spriteRequestCapMessage(312) });
    expect(await readdir(join(root, 'characters')).catch(() => [] as string[])).toEqual(before);
  });

  it('returns validation failures as a result, not an error', async () => {
    const created = await dispatchMcpCall('sprite_generate', { repoPath: repo, spec: { kind: 'sheet', name: 'knight', clips: [{ name: 'walk', frames: 4 }] } });
    if (!created.ok) throw new Error(created.message);
    const { asset, jobId } = created.value as { asset: string; jobId: string };
    await until(jobId);
    const bad = await dispatchMcpCall('sprite_set_spec', { repoPath: repo, group: 'characters', asset, patch: { directions: 5, kind: 'map' } });
    expect(bad).toMatchObject({ ok: true, value: { ok: false, errors: [{ path: 'kind' }] } });
    const bad2 = await dispatchMcpCall('sprite_set_spec', { repoPath: repo, group: 'characters', asset, patch: { directions: 5 } });
    expect(bad2).toMatchObject({ ok: true, value: { ok: false, errors: [{ path: 'directions' }] } });
  });

  it('generates with a stub provider, reports the badges, previews the motion and exports a pack', async () => {
    const started = await dispatchMcpCall('sprite_generate', { repoPath: repo, spec: { kind: 'sheet', name: 'hero', consistency: { enabled: false }, clips: [{ name: 'walk', frames: 3, fps: 10 }] } });
    if (!started.ok) throw new Error(started.message);
    const job = started.value as { jobId: string; group: string; asset: string; requests: number };
    expect(job).toMatchObject({ group: 'characters', requests: 3 });
    expect(await until(job.jobId)).toMatchObject({ state: 'done' });
    const target = { repoPath: repo, group: job.group, asset: job.asset };

    const report = await dispatchMcpCall('sprite_get_report', target);
    expect(report).toMatchObject({ ok: true, value: { frames: 3, flagged: [{ key: 'walk/e/001', badges: ['drift'], rules: ['Drift: the body sits off the anchor.'] }] } });

    const preview = await dispatchMcpCall('sprite_render_preview', { ...target, animate: 'walk' });
    if (!preview.ok) throw new Error(preview.message);
    const blocks = (preview.value as Record<string, Array<{ type: string; data?: string; text?: string }>>)[MCP_CONTENT_KEY]!;
    const images = blocks.filter((b) => b.type === 'image');
    expect(images).toHaveLength(2); // the walk contact sheet and its APNG
    const apng = pngChunks(Buffer.from(images[1]!.data!, 'base64')).map((c) => c.type);
    expect(apng.filter((t) => t === 'fcTL')).toHaveLength(3);
    expect(apng).toContain('acTL');
    expect(apng.filter((t) => t === 'fdAT')).toHaveLength(2);

    const exported = await dispatchMcpCall('sprite_export', { ...target, dest: 'game/assets' });
    expect(exported).toMatchObject({ ok: true, value: { relativePath: 'game/assets/hero.sprite', frames: 3 } });
    const atlas = JSON.parse(await readFile(join(repo, 'game/assets/hero.sprite/atlas.json'), 'utf8'));
    expect(() => PhaserAtlasJsonSchema.parse(atlas)).not.toThrow();
    expect(await dispatchMcpCall('sprite_export', { ...target, dest: '../outside' })).toMatchObject({ ok: false, kind: 'refused' });

    expect(await dispatchMcpCall('sprite_open', target)).toMatchObject({ ok: true });
    expect(opened.at(-1)).toEqual({ repoId: 'r', group: 'characters', asset: job.asset });
  });

  it('lays out a map, reads it, patches a cell and an object, and draws it', async () => {
    const started = await dispatchMcpCall('map_generate', { repoPath: repo, spec: { kind: 'map', name: 'isle', tileset: 'meadow-20261004-120000', engine: { kind: 'ollama', model: 'm' } } });
    if (!started.ok) throw new Error(started.message);
    const job = started.value as { jobId: string; asset: string; requests: number };
    expect(job.requests).toBe(3);
    expect(await until(job.jobId)).toMatchObject({ state: 'done' });
    const target = { repoPath: repo, group: 'maps', asset: job.asset };
    expect(await dispatchMcpCall('map_get', target)).toMatchObject({
      ok: true,
      value: { built: true, tileset: 'meadow-20261004-120000', terrains: ['grass', 'water'], width: 10, height: 8, layers: [{ name: 'ground', tiles: 80 }, { name: 'decoration' }, { name: 'collision', tiles: 9 }, { name: 'objects', objects: 1 }] },
    });

    const bad = await dispatchMcpCall('map_patch', { ...target, ops: [{ op: 'set', x: 0, y: 0, terrain: 'lava' }] });
    expect(bad).toMatchObject({ ok: true, value: { ok: false } });
    expect(JSON.stringify(bad)).toContain('\\"lava\\" is not in this tileset (grass, water)');
    const outside = await dispatchMcpCall('map_patch', { ...target, ops: [{ op: 'object', type: 'exit', name: 'door', x: 40, y: 0 }] });
    expect(outside).toMatchObject({ ok: true, value: { ok: false, errors: [{ path: 'ops[0]' }] } });

    const patched = await dispatchMcpCall('map_patch', { ...target, ops: [{ op: 'set', x: 9, y: 7, terrain: 'water' }, { op: 'object', type: 'exit', name: 'door', x: 9, y: 0 }] });
    expect(patched).toMatchObject({ ok: true, value: { ok: true, applied: 2, layers: [{ name: 'ground' }, { name: 'decoration' }, { name: 'collision', tiles: 10 }, { name: 'objects', objects: 2 }] } });
    expect(llm).toHaveBeenCalledTimes(1);

    const preview = await dispatchMcpCall('sprite_render_preview', target);
    if (!preview.ok) throw new Error(preview.message);
    expect((preview.value as Record<string, Array<{ type: string }>>)[MCP_CONTENT_KEY]!.filter((b) => b.type === 'image')).toHaveLength(1);
  });
});

describe('the midnite-media-sprite-build skill', () => {
  it('names only real sprite tools, and every one of them', async () => {
    const skill = await readFile(join(__dirname, '../../../../../../.claude/skills/midnite-media-sprite-build/SKILL.md'), 'utf8');
    const named = new Set([...skill.matchAll(/`((?:sprite|tileset|background|map)_[a-z_]+)`/g)].map((m) => m[1]!));
    for (const token of named) expect(isSpriteMcpToolId(token), `${token} is not a sprite MCP tool`).toBe(true);
    for (const id of SPRITE_MCP_TOOL_IDS) expect(named.has(id), `${id} is missing from the skill`).toBe(true);
  });
});
