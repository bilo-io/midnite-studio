import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

import {
  estimateSpriteRequests,
  MAP_NEEDS_TILESET,
  MCP_CONTENT_KEY,
  MCP_MAX_RESPONSE_BYTES,
  MapSpecSchema,
  mapSpecIssues,
  presetClips,
  readTmj,
  recommendSpriteMethod,
  SPRITE_BADGE_RULES,
  SPRITE_GROUP_IDS,
  SPRITE_MCP_MAX_REQUESTS,
  SPRITE_METHODS,
  SPRITE_SPEC_FILE,
  SpriteAssetSpecSchema,
  SpriteSheetSpecSchema,
  spriteGroupOf,
  spriteRequestCapMessage,
  type GitOpResult,
  type MapPatchOp,
  type MapSpec,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type SpriteAssetSpec,
  type SpriteGroupId,
  type SpriteKind,
  type SpriteOpenEvent,
  type SpriteTarget,
  type SpriteToolIssue,
} from '@midnite/studio-shared';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { confineToRoot, joinWithin } from '../../fs-scope';
import { McpToolError } from '../../mcp/errors';
import type { SpriteService } from './sprite-service';
import { renderSpritePreview } from './sprite-preview';

/**
 * The sprite MCP tools' implementations (Media ▸ Sprites, Phase 106 Theme K).
 *
 * Deliberately **ungated**: the app's global MCP server wraps the write tools in the `allowSprites`
 * switch (`main/mcp/sprite-tools.ts`). Every tool is a thin adapter over `SpriteService` — the same
 * implementation the IPC handlers call — so the one-job-per-asset rule, the spec validation and the
 * write queue live in one place. What is added here is what an agent needs and a window does not:
 * addressing by `repoPath`, creating an asset from a spec as a job starts, the provider-spend cap
 * ({@link SPRITE_MCP_MAX_REQUESTS}), structured validation errors, and pictures.
 *
 * Every dependency is injected, so the whole surface is tested without Electron.
 */
export type SpriteMcpDeps = {
  service: Pick<SpriteService, 'library' | 'get' | 'setSpec' | 'setReference' | 'generate' | 'jobStatus' | 'cancel' | 'patchFrames' | 'export'>;
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string; repoRoot: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  /** The sprite tab's root for a repo, or `null` before it exists. */
  rootFor: (repoId: string) => Promise<string | null>;
  listFiles: (scope: { repoId: string; tab: 'sprite'; project: string }) => Promise<GitOpResult<{ path: string; mtimeMs: number }[]>>;
  /** `sprite_open` asks the window to show an asset. */
  emitOpen: (event: SpriteOpenEvent) => void;
  /** How long `map_patch` waits for its refill (default 30 s). */
  refillTimeoutMs?: number;
};

const LIST_LIMIT = 200;
const REPORT_LIMIT = 200;
const PREVIEW_BUDGET_BYTES = Math.floor(MCP_MAX_RESPONSE_BYTES * 0.85);
/** Keys a patch may not set: the library, the reference card and the jobs own them. */
const PROTECTED_KEYS = ['version', 'kind', 'reference', 'lastReport', 'createdAt', 'updatedAt', 'oneShot'];
const POLL_HINT = 'Poll sprite_job_status with this jobId about every 10 s until it is no longer running.';

/** The kinds each starting tool may run on. */
const KINDS_FOR = {
  sprite_generate: ['sheet', 'prop-sheet'],
  tileset_generate: ['tileset'],
  background_generate: ['background'],
  map_generate: ['map'],
} as const satisfies Record<string, readonly SpriteKind[]>;

const text = (value: string): McpContentBlock => ({ type: 'text', text: value });

const fail = (result: { ok: false; kind: string } & Partial<{ message: string }>): never => {
  throw new McpToolError('error', result.message ?? 'The sprite operation failed.');
};

const issuesOf = (error: { issues: Array<{ path: Array<string | number>; message: string }> }): SpriteToolIssue[] =>
  error.issues.map((i) => ({ path: i.path.map((p) => (typeof p === 'number' ? `[${p}]` : p)).join('.').replace(/\.\[/g, '['), message: i.message }));

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

async function nearestExisting(abs: string): Promise<string> {
  let current = abs;
  while (!(await exists(current))) {
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export function createSpriteTools(deps: SpriteMcpDeps) {
  async function repoFor(repoPath: string): Promise<{ repoId: string; repoRoot: string }> {
    const resolved = await deps.resolveRepo(repoPath);
    if (!resolved.ok) throw new McpToolError(resolved.kind, resolved.message);
    return { repoId: resolved.repoId, repoRoot: await realpath(resolved.repoRoot).catch(() => resolved.repoRoot) };
  }

  /** A target resolved to its ids, folder and spec; an asset that is not there is a not-found. */
  async function locate(target: { repoPath: string; group: SpriteGroupId; asset: string }) {
    const { repoId, repoRoot } = await repoFor(target.repoPath);
    const ref: SpriteTarget = { repoId, group: target.group, asset: target.asset };
    const got = await deps.service.get(ref);
    if (!got.ok) throw new McpToolError('not-found', `No asset "${target.asset}" in ${target.group}. Call sprite_list for the assets that exist.`);
    const root = await deps.rootFor(repoId);
    const dir = root ? await confineToRoot(root, `${target.group}/${target.asset}`) : null;
    if (!root || !dir) throw new McpToolError('not-found', `No asset "${target.asset}" in ${target.group}.`);
    return { ref, repoRoot, root, dir, spec: got.value.spec, frames: got.value.frames };
  }

  // --- reads -------------------------------------------------------------------------

  async function sprite_list(input: McpToolInput<'sprite_list'>): Promise<McpToolOutput<'sprite_list'>> {
    const { repoId } = await repoFor(input.repoPath);
    const groups: McpToolOutput<'sprite_list'>['groups'] = [];
    let budget = LIST_LIMIT;
    for (const group of SPRITE_GROUP_IDS.filter((g) => !input.group || g === input.group)) {
      const files = await deps.listFiles({ repoId, tab: 'sprite', project: group });
      const specs = files.ok ? files.value.filter((f) => /^[^/]+\/sprite\.json$/.test(f.path)).slice(0, Math.max(0, budget)) : [];
      budget -= specs.length;
      const assets: McpToolOutput<'sprite_list'>['groups'][number]['assets'] = [];
      for (const file of specs) {
        const asset = file.path.slice(0, -`/${SPRITE_SPEC_FILE}`.length);
        const got = await deps.service.get({ repoId, group, asset });
        if (got.ok) assets.push({ asset, name: got.value.spec.name, kind: got.value.spec.kind, built: got.value.spec.lastReport !== undefined, mtimeMs: file.mtimeMs });
      }
      groups.push({ group, assets });
    }
    return { groups };
  }

  function hintFor(spec: SpriteAssetSpec): string {
    switch (spec.kind) {
      case 'sheet':
        if (spec.method === 'hand-drawn' && !(spec.reference?.kind === 'image' && spec.reference.approved))
          return 'Hand-drawn: call sprite_generate with turnaround: true, look at it, then sprite_generate with approveReference: true to draw the frames.';
        return spec.lastReport ? 'Built. sprite_get_report for the badges, sprite_render_preview to see it, sprite_export to ship it.' : 'Not generated yet. Call sprite_recommend_method, then sprite_generate.';
      case 'tileset':
        return spec.lastReport ? 'Built. sprite_render_preview shows tileset.png; maps use it via map_generate.' : 'Call tileset_generate.';
      case 'background':
        return spec.lastReport ? 'Built. sprite_render_preview shows the layers composited.' : 'Call background_generate.';
      case 'prop-sheet':
        return spec.lastReport ? 'Built. Maps scatter it as decorations.' : 'Call sprite_generate to draw the props.';
      case 'map':
        if (spec.imported) return 'Imported from a .tmj; map_get reads it and sprite_export ships it.';
        if (!spec.tileset) return 'Set a tileset first: sprite_set_spec with { tileset: "<tilesets asset>" }.';
        return spec.mapSpec ? 'Laid out. map_get reads it, map_patch edits it, sprite_render_preview draws it.' : 'Call map_generate.';
    }
  }

  async function sprite_get_spec(input: McpToolInput<'sprite_get_spec'>): Promise<McpToolOutput<'sprite_get_spec'>> {
    const t = await locate(input);
    return {
      spec: t.spec as unknown as Record<string, unknown>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- zod 3.25's dual type identities; see mcp-shim/index.ts
      schema: zodToJsonSchema(SpriteAssetSpecSchema as any, { target: 'jsonSchema7', $refStrategy: 'none' }),
      hint: hintFor(t.spec),
    };
  }

  async function sprite_recommend_method(input: McpToolInput<'sprite_recommend_method'>): Promise<McpToolOutput<'sprite_recommend_method'>> {
    let sheet;
    if (input.group && input.asset) {
      const t = await locate({ repoPath: input.repoPath, group: input.group, asset: input.asset });
      if (t.spec.kind !== 'sheet') throw new McpToolError('error', `${input.asset} is a ${t.spec.kind}; methods are for sprite sheets.`);
      sheet = t.spec;
    } else {
      await repoFor(input.repoPath);
      const parsed = SpriteSheetSpecSchema.safeParse({ name: 'draft', ...input.spec, kind: 'sheet' });
      if (!parsed.success) throw new McpToolError('error', `The draft spec is not valid: ${issuesOf(parsed.error).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
      sheet = parsed.data;
    }
    const pick = recommendSpriteMethod(sheet);
    return { method: pick.method, reason: pick.reason, alternatives: SPRITE_METHODS.filter((m) => m !== pick.method).map((m) => (m === 'one-shot' ? 'one-shot: one image sliced into the grid — fast, least consistent, at most 8 × 8' : m === 'rendered' ? 'rendered: needs a rigged Models character (reference kind model)' : 'hand-drawn: frame by frame against an approved reference')) };
  }

  async function sprite_get_report(input: McpToolInput<'sprite_get_report'>): Promise<McpToolOutput<'sprite_get_report'>> {
    const t = await locate(input);
    const entries = Object.entries(t.frames.frames);
    const flagged = entries
      .filter(([, meta]) => meta.badges.length > 0)
      .slice(0, REPORT_LIMIT)
      .map(([key, meta]) => ({ key, badges: meta.badges, rules: meta.badges.map((b) => SPRITE_BADGE_RULES[b]), ...(meta.score !== undefined ? { score: meta.score } : {}), ...(meta.issues ? { issues: meta.issues } : {}) }));
    return {
      kind: t.spec.kind,
      report: t.spec.lastReport ?? null,
      frames: entries.length,
      flagged,
      hint: flagged.length > 0 ? 'Re-roll the flagged frames with sprite_regenerate_frames (unchecked only means no vision model was available).' : 'Nothing flagged.',
    };
  }

  async function sprite_render_preview(input: McpToolInput<'sprite_render_preview'>): Promise<McpToolOutput<'sprite_render_preview'>> {
    const t = await locate(input);
    const result = await renderSpritePreview({ dir: t.dir, spec: t.spec, frames: t.frames, ...(input.clips ? { clips: input.clips } : {}), ...(input.dir ? { direction: input.dir } : {}), ...(input.animate ? { animate: input.animate } : {}) });
    const content: McpContentBlock[] = [text(`${t.spec.name} (${t.spec.kind}). ${result.pictures.length} picture${result.pictures.length === 1 ? '' : 's'}.`)];
    let bytes = 0;
    let dropped = 0;
    for (const picture of result.pictures) {
      const size = Math.ceil((picture.png.length * 4) / 3);
      if (bytes + size > PREVIEW_BUDGET_BYTES) {
        dropped += 1;
        continue;
      }
      bytes += size;
      content.push(text(picture.label), { type: 'image', data: picture.png.toString('base64'), mimeType: picture.mimeType });
    }
    if (dropped > 0) content.push(text(`${dropped} more picture${dropped === 1 ? '' : 's'} did not fit in one answer; ask for fewer clips.`));
    for (const note of result.notes) content.push(text(note));
    return { [MCP_CONTENT_KEY]: content };
  }

  function sprite_job_status(input: McpToolInput<'sprite_job_status'>): McpToolOutput<'sprite_job_status'> {
    const status = deps.service.jobStatus(input.jobId);
    if (!status) throw new McpToolError('not-found', `No sprite job "${input.jobId}" (jobs are forgotten when the app restarts).`);
    return status;
  }

  async function terrainsOf(root: string, tileset: string | undefined): Promise<Array<{ id: string; label: string; collision: 'walkable' | 'solid' | 'water' }>> {
    if (!tileset) return [];
    const dir = joinWithin(root, `tilesets/${tileset}`);
    try {
      const spec = SpriteAssetSpecSchema.parse(JSON.parse(await readFile(join(dir!, SPRITE_SPEC_FILE), 'utf8')));
      return spec.kind === 'tileset' ? spec.terrains.map((t) => ({ id: t.id, label: t.label, collision: t.collision })) : [];
    } catch {
      return [];
    }
  }

  async function mapLayers(dir: string) {
    const raw = await readFile(join(dir, 'map.tmj'), 'utf8').catch(() => null);
    const map = raw ? readTmj(JSON.parse(raw)) : null;
    return {
      map,
      layers: (map?.layers ?? []).map((l) =>
        l.type === 'tilelayer' ? { name: l.name, type: l.type, width: l.width, height: l.height, tiles: l.data.filter((g) => g > 0).length } : { name: l.name, type: l.type, objects: l.objects.length },
      ),
    };
  }

  async function map_get(input: McpToolInput<'map_get'>): Promise<McpToolOutput<'map_get'>> {
    const t = await locate(input);
    if (t.spec.kind !== 'map') throw new McpToolError('error', `${input.asset} is a ${t.spec.kind}, not a map.`);
    const { map, layers } = await mapLayers(t.dir);
    return {
      mapSpec: (t.spec.mapSpec as unknown as Record<string, unknown>) ?? null,
      tileset: t.spec.tileset?.asset ?? null,
      terrains: (await terrainsOf(t.root, t.spec.tileset?.asset)).map((x) => x.id),
      built: map !== null,
      orientation: map?.orientation ?? null,
      width: map?.width ?? null,
      height: map?.height ?? null,
      layers,
    };
  }

  // --- writes --------------------------------------------------------------------------

  async function sprite_open(input: McpToolInput<'sprite_open'>): Promise<McpToolOutput<'sprite_open'>> {
    const t = await locate(input);
    deps.emitOpen({ repoId: t.ref.repoId, group: t.ref.group, asset: t.ref.asset });
    return { opened: true, asset: input.asset };
  }

  async function sprite_set_spec(input: McpToolInput<'sprite_set_spec'>): Promise<McpToolOutput<'sprite_set_spec'>> {
    const t = await locate(input);
    const errors: SpriteToolIssue[] = PROTECTED_KEYS.filter((key) => key in input.patch).map((key) => ({
      path: key,
      message: key === 'reference' ? 'Draw and approve a reference with sprite_generate (turnaround, then approveReference).' : `"${key}" is managed by Midnite Studio and cannot be set.`,
    }));
    if (errors.length > 0) return { ok: false, errors };
    const parsed = SpriteAssetSpecSchema.safeParse({ ...t.spec, ...input.patch });
    if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) };
    if (parsed.data.kind === 'map' && parsed.data.mapSpec && 'mapSpec' in input.patch) {
      const terrains = await terrainsOf(t.root, parsed.data.tileset?.asset);
      if (terrains.length > 0) {
        const issues = mapSpecIssues(parsed.data.mapSpec, terrains);
        if (issues.length > 0) return { ok: false, errors: issues.map((i) => ({ path: `mapSpec.${i.path}`, message: i.message })) };
      }
    }
    const saved = await deps.service.setSpec({ ...t.ref, patch: input.patch });
    if (!saved.ok) return { ok: false, errors: [{ path: '', message: saved.kind === 'error' ? saved.message : 'The spec changed underneath this call; try again.' }] };
    return { ok: true, asset: input.asset, spec: saved.value.spec as unknown as Record<string, unknown> };
  }

  /** Refuses a job whose worst case is over the cap — before anything is created or spent. */
  function capped(requests: number): void {
    if (requests > SPRITE_MCP_MAX_REQUESTS) throw new McpToolError('refused', spriteRequestCapMessage(requests));
  }

  type StartOpts = { clips?: string[]; turnaround?: boolean; method?: 'hand-drawn'; approveReference?: boolean; keepLayout?: boolean };

  /** Resolves an existing asset or creates one from a spec, checks the kind and the cap, then starts the job. */
  async function start(tool: keyof typeof KINDS_FOR, input: { repoPath: string; group?: SpriteGroupId; asset?: string; spec?: Record<string, unknown> }, opts: StartOpts): Promise<McpToolOutput<'sprite_generate'>> {
    const kinds: readonly SpriteKind[] = KINDS_FOR[tool];
    const req = { ...(opts.clips ? { clips: opts.clips } : {}), ...(opts.turnaround ? { turnaround: true as const } : {}), ...(opts.method ? { method: opts.method } : {}), ...(opts.keepLayout ? { keepLayout: true } : {}) };
    let ref: SpriteTarget;
    let spec: SpriteAssetSpec;
    if (input.asset) {
      if (!input.group) throw new McpToolError('error', 'Give `group` with `asset` (sprite_list returns both).');
      const t = await locate({ repoPath: input.repoPath, group: input.group, asset: input.asset });
      ref = t.ref;
      spec = t.spec;
      if (!kinds.includes(spec.kind)) throw new McpToolError('error', `${input.asset} is a ${spec.kind}; ${tool} runs on ${kinds.join(' or ')}.`);
    } else if (input.spec) {
      const { repoId } = await repoFor(input.repoPath);
      const draft = { ...input.spec, kind: input.spec.kind ?? kinds[0] };
      const parsed = SpriteAssetSpecSchema.safeParse(draft);
      if (!parsed.success) throw new McpToolError('error', `The spec is not valid: ${issuesOf(parsed.error).slice(0, 8).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
      if (!kinds.includes(parsed.data.kind)) throw new McpToolError('error', `${tool} creates a ${kinds.join(' or ')}, not a ${parsed.data.kind}.`);
      // A sheet created with no clips gets its perspective's presets — count those.
      const planned = parsed.data.kind === 'sheet' && parsed.data.clips.length === 0 ? { ...parsed.data, clips: presetClips(parsed.data.targetPerspective) } : parsed.data;
      capped(estimateSpriteRequests(planned, req));
      const created = await deps.service.library({ op: 'create', repoId, spec: draft });
      if (!created.ok) return fail(created);
      ref = { repoId, group: created.value.group ?? spriteGroupOf(parsed.data), asset: created.value.asset! };
      const got = await deps.service.get(ref);
      if (!got.ok) return fail(got);
      spec = got.value.spec;
    } else {
      throw new McpToolError('error', 'Give an existing `group` + `asset`, or a `spec` to create one.');
    }
    const requests = estimateSpriteRequests(spec, req);
    capped(requests);
    if (opts.approveReference) {
      const approved = await deps.service.setReference({ ...ref, approve: true, frames: 'keep' });
      if (!approved.ok) return fail(approved);
    }
    const started = await deps.service.generate({ ...ref, ...(opts.clips ? { clips: opts.clips } : {}), ...(opts.turnaround ? { turnaround: true } : {}), ...(opts.method ? { method: opts.method } : {}), ...(opts.keepLayout ? { layout: 'keep' as const } : {}) });
    if (!started.ok) return fail(started);
    return { jobId: started.value.jobId, group: ref.group, asset: ref.asset, requests, hint: POLL_HINT };
  }

  const sprite_generate = (input: McpToolInput<'sprite_generate'>) =>
    start('sprite_generate', input, { ...(input.clips ? { clips: input.clips } : {}), ...(input.turnaround ? { turnaround: true } : {}), ...(input.method ? { method: input.method } : {}), ...(input.approveReference ? { approveReference: true } : {}) });
  const tileset_generate = (input: McpToolInput<'tileset_generate'>) => start('tileset_generate', input, {});
  const background_generate = (input: McpToolInput<'background_generate'>) => start('background_generate', input, {});
  const map_generate = (input: McpToolInput<'map_generate'>) => start('map_generate', input, input.keepLayout ? { keepLayout: true } : {});

  async function sprite_regenerate_frames(input: McpToolInput<'sprite_regenerate_frames'>): Promise<McpToolOutput<'sprite_regenerate_frames'>> {
    const t = await locate(input);
    if (t.spec.kind !== 'sheet') throw new McpToolError('error', `${input.asset} is a ${t.spec.kind}; only sheets have frames to re-roll.`);
    const requests = estimateSpriteRequests(t.spec, { frames: input.frames });
    capped(requests);
    const clips = [...new Set(input.frames.map((key) => key.split('/')[0]!))];
    const started = await deps.service.generate({ ...t.ref, clips, frames: input.frames });
    if (!started.ok) return fail(started);
    return { jobId: started.value.jobId, group: t.ref.group, asset: t.ref.asset, requests, hint: POLL_HINT };
  }

  async function sprite_patch_frames(input: McpToolInput<'sprite_patch_frames'>): Promise<McpToolOutput<'sprite_patch_frames'>> {
    const t = await locate(input);
    const rerolls = input.ops.flatMap((op) => (op.op === 'reroll' ? op.keys : []));
    if (rerolls.length > 0 && t.spec.kind === 'sheet') capped(estimateSpriteRequests(t.spec, { frames: rerolls }));
    const patched = await deps.service.patchFrames({ ...t.ref, ops: input.ops });
    if (!patched.ok) return fail(patched);
    return { applied: input.ops.length, ...(patched.value.jobId ? { jobId: patched.value.jobId } : {}) };
  }

  function sprite_cancel(input: McpToolInput<'sprite_cancel'>): McpToolOutput<'sprite_cancel'> {
    const cancelled = deps.service.cancel(input.jobId);
    if (!cancelled.ok) throw new McpToolError('not-found', cancelled.kind === 'error' ? cancelled.message : 'No such running job.');
    return { cancelled: true };
  }

  /** Applies map edits to a layout; answers the new layout or the edits that were wrong. */
  function applyMapOps(layout: MapSpec, ops: readonly MapPatchOp[]): { ok: true; spec: MapSpec } | { ok: false; errors: SpriteToolIssue[] } {
    const next: MapSpec = { ...layout, objects: [...layout.objects], cells: [...(layout.cells ?? [])] };
    const errors: SpriteToolIssue[] = [];
    ops.forEach((op, i) => {
      if (op.op === 'refill') return;
      if (op.x < 0 || op.y < 0 || op.x >= layout.width || op.y >= layout.height) {
        errors.push({ path: `ops[${i}]`, message: `(${op.x}, ${op.y}) is outside the ${layout.width} × ${layout.height} map` });
        return;
      }
      if (op.op === 'set') next.cells = [...next.cells!.filter((c) => c.x !== op.x || c.y !== op.y), { x: op.x, y: op.y, terrain: op.terrain }];
      else next.objects = [...next.objects.filter((o) => o.name !== op.name), { type: op.type, name: op.name, x: op.x, y: op.y }];
    });
    if (errors.length > 0) return { ok: false, errors };
    const parsed = MapSpecSchema.safeParse(next);
    return parsed.success ? { ok: true, spec: parsed.data } : { ok: false, errors: issuesOf(parsed.error) };
  }

  async function map_patch(input: McpToolInput<'map_patch'>): Promise<McpToolOutput<'map_patch'>> {
    const t = await locate(input);
    if (t.spec.kind !== 'map') throw new McpToolError('error', `${input.asset} is a ${t.spec.kind}, not a map.`);
    if (!t.spec.mapSpec) return { ok: false, errors: [{ path: '', message: t.spec.imported ? 'An imported map has no layout to patch.' : 'This map has no layout yet. Call map_generate first.' }] };
    if (!t.spec.tileset) return { ok: false, errors: [{ path: 'tileset', message: MAP_NEEDS_TILESET }] };
    const applied = applyMapOps(t.spec.mapSpec, input.ops);
    if (!applied.ok) return applied;
    const issues = mapSpecIssues(applied.spec, await terrainsOf(t.root, t.spec.tileset.asset));
    if (issues.length > 0) return { ok: false, errors: issues.map((i) => ({ path: i.path.startsWith('cells[') ? `ops (${i.path})` : i.path, message: i.message })) };
    const saved = await deps.service.setSpec({ ...t.ref, patch: { mapSpec: applied.spec } });
    if (!saved.ok) return { ok: false, errors: [{ path: '', message: saved.kind === 'error' ? saved.message : 'The map changed underneath this call; try again.' }] };
    const started = await deps.service.generate({ ...t.ref, layout: 'keep' });
    if (!started.ok) return { ok: false, errors: [{ path: '', message: started.kind === 'error' ? started.message : 'Could not refill the map.' }] };
    // A refill is a fill and a few file writes — no provider call — so wait for it.
    const deadline = Date.now() + (deps.refillTimeoutMs ?? 30_000);
    let status = deps.service.jobStatus(started.value.jobId);
    while (status?.state === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      status = deps.service.jobStatus(started.value.jobId);
    }
    if (status?.state !== 'done') return { ok: false, errors: [{ path: '', message: status?.message ?? 'The refill did not finish.' }] };
    return { ok: true, applied: input.ops.length, layers: (await mapLayers(t.dir)).layers };
  }

  async function sprite_export(input: McpToolInput<'sprite_export'>): Promise<McpToolOutput<'sprite_export'>> {
    const t = await locate(input);
    let dest: string | undefined;
    if (input.dest !== undefined) {
      const rel = isAbsolute(input.dest) ? relative(t.repoRoot, input.dest) : input.dest;
      const joined = rel.startsWith('..') ? null : joinWithin(t.repoRoot, rel);
      if (!joined) throw new McpToolError('refused', 'Exports must be written inside the repository.');
      const anchorRel = relative(t.repoRoot, await nearestExisting(joined));
      if (anchorRel !== '' && !(await confineToRoot(t.repoRoot, anchorRel))) throw new McpToolError('refused', 'Exports must be written inside the repository.');
      dest = joined;
    }
    const written = await deps.service.export({ ...t.ref, ...(dest ? { dest } : {}), ...(input.pack ? { pack: input.pack } : {}) });
    if (!written.ok) return fail(written);
    const rel = relative(t.repoRoot, written.value.path);
    return { ...written.value, ...(!rel.startsWith('..') && !isAbsolute(rel) ? { relativePath: rel } : {}) };
  }

  return {
    sprite_list,
    sprite_open,
    sprite_get_spec,
    sprite_set_spec,
    sprite_recommend_method,
    sprite_generate,
    sprite_regenerate_frames,
    sprite_patch_frames,
    sprite_render_preview,
    sprite_get_report,
    sprite_job_status,
    sprite_cancel,
    tileset_generate,
    background_generate,
    map_generate,
    map_get,
    map_patch,
    sprite_export,
  };
}

export type SpriteTools = ReturnType<typeof createSpriteTools>;
