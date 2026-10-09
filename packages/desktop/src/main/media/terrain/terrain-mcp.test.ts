// vitest (node): the terrain_* tools over a real TerrainService with an in-process build — no
// Electron, no browser capability. Covers the gate (via mcp/terrain-tools), the spec/input
// validation, the repo jail and the build -> preview -> export round trip.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { MCP_CONTENT_KEY, TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE, TERRAINS_OFF_MESSAGE, TerrainManifestSchema, TERRAIN_MANIFEST_FILE } from '@midnite/studio-shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { McpToolError } from '../../mcp/errors';
import { setTerrainTools, terrainBuild, terrainSetSpec } from '../../mcp/terrain-tools';
import { setMcpAllowTerrainsState } from '../../mcp/ui-gate';
import { encodePngRgba8 } from '../png/png-codec';
import { runTerrainBuild } from './build-pipeline';
import { createTerrainTools, INPUT_OUTSIDE_REPO_MESSAGE } from './terrain-mcp';
import { createTerrainService } from './terrain-service';
import { readFile } from 'node:fs/promises';

let repo: string;
let root: string;
let tools: ReturnType<typeof createTerrainTools>;
let target: { repoPath: string; project: string; terrain: string };
const emitted: unknown[] = [];

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'terrain-mcp-'));
  root = join(repo, '.midnite', 'media', 'terrain');
  await mkdir(root, { recursive: true });
  const service = createTerrainService({
    rootFor: async () => root,
    writeBytes: async ({ project, path, data }) => {
      const abs = join(root, project, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, data);
      return { ok: true, value: undefined };
    },
    trash: async (abs) => {
      await rm(abs, { recursive: true, force: true });
    },
    toPng: async () => null,
    broker: {
      build: (request: { dir: string; outDir: string; spec: Parameters<typeof runTerrainBuild>[0]['spec'] }) => ({
        buildId: 'b',
        done: runTerrainBuild({ dir: request.dir, outDir: request.outDir, spec: request.spec }).then(
          (stats) => ({ ok: true as const, stats }),
          (error: Error) => ({ ok: false as const, message: error.message }),
        ),
        cancel: () => undefined,
      }),
      cancel: () => true,
      dispose: () => undefined,
    } as never,
    onChanged: () => undefined,
    emitProgress: () => undefined,
    emitChanged: () => undefined,
    log: () => undefined,
  });
  tools = createTerrainTools({
    service,
    resolveRepo: async (p) => (p === repo ? { ok: true, repoId: 'r', repoRoot: repo } : { ok: false, kind: 'not-found', message: 'No such repository.' }),
    listProjects: async () => ({ ok: true, value: [{ name: 'terrains' }] as never }),
    listFiles: async () => ({ ok: true, value: [] }),
    emitOpen: (e) => emitted.push(e),
  });
  setTerrainTools(tools);
  const created = await service.library({ op: 'create', repoId: 'r', name: 'Fixture' });
  if (!created.ok || !created.value.terrain) throw new Error('create failed');
  target = { repoPath: repo, project: created.value.project!, terrain: created.value.terrain };
  // A small low-res terrain keeps the build and the renders quick.
  await mkdir(join(repo, 'imgs'), { recursive: true });
  await writeFile(join(repo, 'imgs', 'sat.png'), encodePngRgba8(new Uint8Array(16 * 16 * 4).fill(120), 16, 16));
}, 60_000);

afterAll(async () => {
  setTerrainTools(null);
  await rm(repo, { recursive: true, force: true });
});

beforeEach(() => setMcpAllowTerrainsState(true));

describe('terrain gate', () => {
  it('refuses writes with the named reason while the switch is off, but still reads', async () => {
    setMcpAllowTerrainsState(false);
    const refusal = { kind: 'refused', message: TERRAINS_OFF_MESSAGE };
    await expect(terrainSetSpec({ ...target, patch: { name: 'x' } })).rejects.toMatchObject(refusal);
    await expect(terrainBuild(target)).rejects.toMatchObject(refusal);
    await expect(terrainBuild(target)).rejects.toBeInstanceOf(McpToolError);
    expect((await tools.terrain_get_spec(target)).built).toBe(false);
  });
});

describe('terrain_set_spec', () => {
  it('names the path of an invalid value', async () => {
    const r = await tools.terrain_set_spec({ ...target, patch: { resolution: 500 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.path)).toContain('resolution');
  });

  it('refuses the keys the app manages', async () => {
    const r = await tools.terrain_set_spec({ ...target, patch: { inputs: {} } });
    expect(r).toMatchObject({ ok: false, errors: [{ path: 'inputs' }] });
  });
});

describe('terrain_set_input', () => {
  it('refuses a path outside the repository', async () => {
    await expect(tools.terrain_set_input({ ...target, slot: 'satellite', path: '../outside.png' })).rejects.toMatchObject({
      kind: 'refused',
      message: INPUT_OUTSIDE_REPO_MESSAGE,
    });
  });
});

describe('build, preview, export', () => {
  it('will not silently pick noise when nothing shapes the ground', async () => {
    expect(await tools.terrain_build(target)).toEqual({ status: 'needs-height-source', message: TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE });
  });

  it('round-trips spec -> build -> preview -> export', async () => {
    const set = await tools.terrain_set_spec({ ...target, patch: { resolution: 129, noise: { seed: 3, erosion: { iterations: 0 } } } });
    expect(set.ok).toBe(true);
    const input = await tools.terrain_set_input({ ...target, slot: 'satellite', path: 'imgs/sat.png' });
    expect(input).toMatchObject({ slot: 'satellite', attached: true });
    const built = await tools.terrain_build(target);
    expect(built.status).toBe('built');
    expect((await tools.terrain_get_stats(target)).built).toBe(true);

    const preview = await tools.terrain_render_preview({ ...target, size: 128 });
    const blocks = preview[MCP_CONTENT_KEY] as { type: string }[];
    expect(blocks.filter((b) => b.type === 'image')).toHaveLength(5);

    const exported = await tools.terrain_export(target);
    expect(exported.relativePath).toMatch(/export/);
    const manifest = TerrainManifestSchema.parse(JSON.parse(await readFile(join(exported.path, TERRAIN_MANIFEST_FILE), 'utf8')));
    expect(manifest.version).toBe(1);
  }, 60_000);

  it('jails an export destination to the repository', async () => {
    await expect(tools.terrain_export({ ...target, dest: '../elsewhere' })).rejects.toMatchObject({ kind: 'refused' });
  });

  it('asks the window to open a terrain', async () => {
    expect(await tools.terrain_open(target)).toEqual({ opened: true, terrain: target.terrain });
    expect(emitted).toHaveLength(1);
  });
});
