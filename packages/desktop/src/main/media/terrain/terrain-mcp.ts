import { readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative } from 'node:path';

import {
  MCP_CONTENT_KEY,
  MCP_MAX_RESPONSE_BYTES,
  needsHeightSource,
  TERRAIN_BUILD_CANCELLED,
  TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE,
  TERRAIN_PREVIEW_VIEWS,
  TERRAIN_SPEC_FILE,
  TerrainSpecSchema,
  type GitOpResult,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type MediaProject,
  type TerrainOpenEvent,
} from '@midnite/studio-shared';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { confineToRoot, joinWithin } from '../../fs-scope';
import { McpToolError } from '../../mcp/errors';
import type { TerrainService } from './terrain-service';
import { renderTerrainPreviews } from './terrain-preview';

/**
 * The `terrain_*` MCP tools' implementations (Media ▸ Terrain, Phase 105 Theme J).
 *
 * Deliberately **ungated**: whether a caller may use them is the dispatcher's decision, not this
 * file's — the app's global MCP server wraps the write tools in the `allowTerrains` switch
 * (`main/mcp/terrain-tools.ts`). Every one is a thin adapter over `TerrainService`, the same
 * implementation the IPC handlers call, so the needs-height-source rule, the spec validation and the
 * per-terrain write queue live in one place. What is added here is only what an agent needs and a
 * window does not: addressing by `repoPath`, confining image paths to the repository, and pictures.
 *
 * Every dependency is injected, so the whole surface is tested without Electron.
 */

type Scope = { repoId: string; tab: 'terrain'; project: string };

export type TerrainMcpDeps = {
  service: Pick<TerrainService, 'get' | 'setSpec' | 'setInput' | 'build' | 'export' | 'dirOf'>;
  /** `repoPath` → the open repository (its id and the root input paths are confined to), or the refusal to answer with. */
  resolveRepo: (
    repoPath: string,
  ) => Promise<{ ok: true; repoId: string; repoRoot: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  listProjects: (repoId: string) => Promise<GitOpResult<MediaProject[]>>;
  listFiles: (scope: Scope) => Promise<GitOpResult<{ path: string; mtimeMs: number }[]>>;
  /** `terrain_open` asks the window to show a terrain. */
  emitOpen: (event: TerrainOpenEvent) => void;
};

export const INPUT_OUTSIDE_REPO_MESSAGE = 'Input images must be inside the repository.';
export const NOT_BUILT_FOR_PREVIEW = 'This terrain has no build yet. Call terrain_build first.';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
/** Terrains listed per call — a project of thousands is not a thing a prompt can hold. */
const LIST_LIMIT = 200;
/** Keys a patch may not set: the build, the library and `terrain_set_input` own them. */
const PROTECTED_KEYS = ['version', 'inputs', 'lastBuild', 'createdAt', 'updatedAt'];
/** Headroom under the MCP response cap (base64 inflates by a third, and the text blocks ride along). */
const PREVIEW_BUDGET_BYTES = Math.floor(MCP_MAX_RESPONSE_BYTES * 0.85);

const text = (value: string): McpContentBlock => ({ type: 'text', text: value });

const fail = (result: { ok: false; kind: string } & Partial<{ message: string }>): never => {
  throw new McpToolError('error', result.message ?? 'The terrain operation failed.');
};

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

/** The nearest ancestor of `abs` that exists — a destination folder that is not there yet is still jailed by its parent. */
async function nearestExisting(abs: string): Promise<string> {
  let current = abs;
  while (!(await exists(current))) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export function createTerrainTools(deps: TerrainMcpDeps) {
  const revisions = new Map<string, number>();

  async function repoFor(repoPath: string): Promise<{ repoId: string; repoRoot: string }> {
    const resolved = await deps.resolveRepo(repoPath);
    if (!resolved.ok) throw new McpToolError(resolved.kind, resolved.message);
    // Real path: the media jail answers in real paths, so a symlinked checkout must compare like with like.
    return { repoId: resolved.repoId, repoRoot: await realpath(resolved.repoRoot).catch(() => resolved.repoRoot) };
  }

  /** A target resolved to ids and the terrain's folder; a terrain that is not there is a not-found, never a throw from deeper in. */
  async function locate(target: { repoPath: string; project: string; terrain: string }) {
    const { repoId, repoRoot } = await repoFor(target.repoPath);
    const ref = { repoId, project: target.project, terrain: target.terrain };
    const got = await deps.service.get(ref);
    if (!got.ok) {
      throw new McpToolError(
        'not-found',
        `No terrain "${target.terrain}" in project "${target.project}". Call terrain_list for the terrains that exist.`,
      );
    }
    const dir = await deps.service.dirOf(ref);
    if (!dir.ok) return fail(dir);
    return { ref, repoRoot, dir: dir.value, spec: got.value.spec, built: got.value.built };
  }

  // --- reads -----------------------------------------------------------------

  async function terrain_list(input: McpToolInput<'terrain_list'>): Promise<McpToolOutput<'terrain_list'>> {
    const { repoId } = await repoFor(input.repoPath);
    const listed = await deps.listProjects(repoId);
    if (!listed.ok) throw new McpToolError('error', listed.kind === 'error' ? listed.message : 'Could not list projects.');
    const names = listed.value.map((p) => p.name).filter((name) => input.project === undefined || name === input.project);
    const projects: McpToolOutput<'terrain_list'>['projects'] = [];
    let budget = LIST_LIMIT;
    for (const name of names) {
      const files = await deps.listFiles({ repoId, tab: 'terrain', project: name });
      const specs = files.ok ? files.value.filter((f) => f.path.endsWith(`/${TERRAIN_SPEC_FILE}`)).slice(0, Math.max(0, budget)) : [];
      budget -= specs.length;
      const terrains: McpToolOutput<'terrain_list'>['projects'][number]['terrains'] = [];
      for (const file of specs) {
        const terrain = file.path.slice(0, -`/${TERRAIN_SPEC_FILE}`.length);
        const got = await deps.service.get({ repoId, project: name, terrain });
        if (got.ok) terrains.push({ terrain, name: got.value.spec.name, built: got.value.built, resolution: got.value.spec.resolution, mtimeMs: file.mtimeMs });
      }
      projects.push({ name, terrains });
    }
    return { projects };
  }

  async function terrain_get_spec(input: McpToolInput<'terrain_get_spec'>): Promise<McpToolOutput<'terrain_get_spec'>> {
    const t = await locate(input);
    const attached = (['heightmap', 'satellite', 'roads'] as const).filter((slot) => t.spec.inputs[slot]);
    const hint = needsHeightSource(t.spec)
      ? TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE
      : t.built
        ? 'Built. Call terrain_render_preview to look at it, terrain_set_spec to adjust, terrain_export to ship it.'
        : `Not built yet (inputs attached: ${attached.join(', ') || 'none'}). Call terrain_build.`;
    return {
      spec: t.spec as unknown as Record<string, unknown>,
      built: t.built,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod 3.25's dual type identities; see mcp-shim/index.ts
      schema: zodToJsonSchema(TerrainSpecSchema as any, { target: 'jsonSchema7', $refStrategy: 'none' }),
      hint,
    };
  }

  async function terrain_get_stats(input: McpToolInput<'terrain_get_stats'>): Promise<McpToolOutput<'terrain_get_stats'>> {
    const t = await locate(input);
    const stats = t.spec.lastBuild?.stats;
    return t.built && stats ? { built: true, stats } : { built: false };
  }

  async function terrain_render_preview(input: McpToolInput<'terrain_render_preview'>): Promise<McpToolOutput<'terrain_render_preview'>> {
    const t = await locate(input);
    const views = input.views ?? [...TERRAIN_PREVIEW_VIEWS];
    let size = input.size;
    // Five full-size PNGs can outgrow one MCP response: step the size down until they fit.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const pictures = await renderTerrainPreviews({ dir: t.dir, spec: t.spec, views, size });
      if (!pictures) throw new McpToolError('not-found', NOT_BUILT_FOR_PREVIEW);
      const bytes = pictures.reduce((sum, p) => sum + Math.ceil((p.png.length * 4) / 3), 0);
      const edge = pictureEdge(pictures[0]?.png);
      if (bytes > PREVIEW_BUDGET_BYTES && edge > 128) {
        size = Math.max(128, Math.floor(edge * 0.75));
        continue;
      }
      const stats = t.spec.lastBuild?.stats;
      const content: McpContentBlock[] = [
        text(
          `${t.spec.name}: ${t.spec.resolution}² heights over ${t.spec.worldSize} m, height ${stats ? `${stats.minHeight.toFixed(1)}–${stats.maxHeight.toFixed(1)}` : `${t.spec.heightRange[0]}–${t.spec.heightRange[1]}`} m. ` +
            `Views: ${pictures.map((p) => p.view).join(', ')}. Top, landcover and roads are maps (north up, x to the right); oblique looks from the front-right-above, horizon from the front; oblique and horizon are coloured in six height bands.`,
        ),
      ];
      for (const picture of pictures) {
        content.push(text(picture.view), { type: 'image', data: picture.png.toString('base64'), mimeType: 'image/png' });
        if (picture.note) content.push(text(`${picture.view}: ${picture.note}`));
      }
      return { [MCP_CONTENT_KEY]: content };
    }
    throw new McpToolError('error', 'The preview is too large to return; ask for fewer views or a smaller size.');
  }

  // --- writes ----------------------------------------------------------------

  async function terrain_open(input: McpToolInput<'terrain_open'>): Promise<McpToolOutput<'terrain_open'>> {
    const t = await locate(input);
    deps.emitOpen(t.ref);
    return { opened: true, terrain: input.terrain };
  }

  async function terrain_set_spec(input: McpToolInput<'terrain_set_spec'>): Promise<McpToolOutput<'terrain_set_spec'>> {
    const t = await locate(input);
    const errors: { path: string; message: string }[] = [];
    for (const key of PROTECTED_KEYS) {
      if (key in input.patch) {
        errors.push({
          path: key,
          message: key === 'inputs' ? 'Attach or remove images with terrain_set_input, not through the spec.' : `"${key}" is managed by Midnite Studio and cannot be set.`,
        });
      }
    }
    if (errors.length > 0) return { ok: false, errors };
    const patch = Object.fromEntries(Object.entries(input.patch).filter(([key]) => !PROTECTED_KEYS.includes(key)));
    const parsed = TerrainSpecSchema.safeParse({ ...t.spec, ...patch });
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) };
    }
    const saved = await deps.service.setSpec({ ...t.ref, patch });
    if (!saved.ok) return { ok: false, errors: [{ path: '', message: saved.kind === 'error' ? saved.message : 'The spec changed underneath this call; try again.' }] };
    const key = `${t.ref.repoId}/${t.ref.project}/${t.ref.terrain}`;
    const revision = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, revision);
    return { ok: true, terrain: input.terrain, revision, spec: saved.value.spec as unknown as Record<string, unknown> };
  }

  /** A repo-relative image path resolved inside the repository, symlinks included, or the refusal. */
  async function confinedImage(repoRoot: string, requested: string): Promise<string> {
    let rel = requested;
    if (isAbsolute(rel)) {
      rel = relative(repoRoot, rel);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new McpToolError('refused', INPUT_OUTSIDE_REPO_MESSAGE);
    }
    if (!IMAGE_EXTENSIONS.has(extname(rel).toLowerCase())) throw new McpToolError('refused', INPUT_OUTSIDE_REPO_MESSAGE);
    const joined = joinWithin(repoRoot, rel);
    if (!joined) throw new McpToolError('refused', INPUT_OUTSIDE_REPO_MESSAGE);
    if (!(await exists(joined))) throw new McpToolError('not-found', `No image at "${requested}".`);
    const real = await confineToRoot(repoRoot, rel);
    if (!real) throw new McpToolError('refused', INPUT_OUTSIDE_REPO_MESSAGE);
    return real;
  }

  async function terrain_set_input(input: McpToolInput<'terrain_set_input'>): Promise<McpToolOutput<'terrain_set_input'>> {
    const t = await locate(input);
    const { slot } = input;
    let result: GitOpResult<{ input?: { width: number; height: number }; warnings: string[] }>;
    if (input.remove) {
      result = await deps.service.setInput({ ...t.ref, slot, remove: true });
      if (!result.ok) return fail(result);
      return { slot, attached: false, warnings: result.value.warnings };
    }
    if (input.path !== undefined) {
      const real = await confinedImage(t.repoRoot, input.path);
      const bytes = await readFile(real);
      result = await deps.service.setInput({ ...t.ref, slot, bytes: new Uint8Array(bytes), name: basename(real).slice(0, 255) });
    } else if (input.prompt !== undefined) {
      if (slot !== 'heightmap') throw new McpToolError('error', 'Only the heightmap can be generated from a prompt.');
      if (!input.provider || !input.model) throw new McpToolError('error', 'A prompted heightmap needs `provider` and `model` (an image provider the user has configured).');
      result = await deps.service.setInput({ ...t.ref, slot: 'heightmap', prompt: input.prompt, provider: input.provider, model: input.model });
    } else {
      throw new McpToolError('error', 'Give a `path` to an image inside the repository, a `prompt` (heightmap only), or `remove: true`.');
    }
    if (!result.ok) return fail(result);
    const attached = result.value.input;
    return { slot, attached: true, ...(attached ? { width: attached.width, height: attached.height } : {}), warnings: result.value.warnings };
  }

  async function terrain_build(input: McpToolInput<'terrain_build'>): Promise<McpToolOutput<'terrain_build'>> {
    const t = await locate(input);
    // The no-heightmap rule holds over MCP too: never silently pick noise.
    if (needsHeightSource(t.spec)) return { status: 'needs-height-source', message: TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE };
    const built = await deps.service.build({ ...t.ref });
    if (!built.ok) {
      if (built.kind === 'error' && built.message === TERRAIN_BUILD_CANCELLED) throw new McpToolError('error', 'The build was cancelled in the app.');
      return fail(built);
    }
    if (built.value.status === 'needs-height-source') return { status: 'needs-height-source', message: TERRAIN_NEEDS_HEIGHT_SOURCE_MESSAGE };
    return { status: 'built', stats: built.value.stats };
  }

  async function terrain_export(input: McpToolInput<'terrain_export'>): Promise<McpToolOutput<'terrain_export'>> {
    const t = await locate(input);
    // Default: the terrain's own `export/` folder; otherwise a repo-relative folder, jailed by its nearest existing parent.
    let dest = join(t.dir, 'export');
    if (input.dest !== undefined) {
      const rel = isAbsolute(input.dest) ? relative(t.repoRoot, input.dest) : input.dest;
      const joined = rel.startsWith('..') ? null : joinWithin(t.repoRoot, rel);
      if (!joined) throw new McpToolError('refused', 'Exports must be written inside the repository.');
      const anchor = await nearestExisting(joined);
      const anchorRel = relative(t.repoRoot, anchor);
      if (anchorRel !== '' && !(await confineToRoot(t.repoRoot, anchorRel))) throw new McpToolError('refused', 'Exports must be written inside the repository.');
      dest = joined;
    }
    const written = await deps.service.export({
      ...t.ref,
      format: input.format ?? 'terrain-pack',
      dest,
      lod: input.lod ?? 1,
      texture: input.texture ?? 'drape',
      foliage: input.foliage ?? true,
      roads: input.roads ?? true,
      buildings: input.buildings ?? true,
    });
    if (!written.ok) return fail(written);
    const rel = relative(t.repoRoot, written.value.path);
    return { ...written.value, ...(!rel.startsWith('..') && !isAbsolute(rel) ? { relativePath: rel } : {}) };
  }

  return {
    terrain_list,
    terrain_open,
    terrain_get_spec,
    terrain_set_spec,
    terrain_set_input,
    terrain_build,
    terrain_render_preview,
    terrain_get_stats,
    terrain_export,
  };
}

export type TerrainTools = ReturnType<typeof createTerrainTools>;

/** The side of a square PNG, read from its IHDR. */
function pictureEdge(png: Buffer | undefined): number {
  return png && png.length >= 24 ? png.readUInt32BE(16) : 0;
}
