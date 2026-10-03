import {
  buildScene,
  MCP_CONTENT_KEY,
  MODEL_MAX_PARTS,
  modelSidecarPath,
  parseModelSidecar,
  type GitOpResult,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type MediaProject,
  type ModelChangedEvent,
  type ModelOpenEvent,
  type ModelSidecar,
  type ModelSpec,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { renderPreviews } from './preview';
import { applyPatchOps, describeEdit, ensurePartIds, validateDesign } from './spec-ops';
import { modelSpecJsonSchema, modelSpecReference } from './spec-reference';

/**
 * The `model_*` MCP tools' implementations (Media ▸ Models, Phase 99 Theme G).
 *
 * Deliberately **ungated**: whether a caller may use them is the dispatcher's
 * decision, not this file's. The app's global MCP server wraps the write tools
 * in the `allowModels` switch (`main/mcp/model-tools.ts`); an in-app iterative
 * run talks to its own private, single-model server (`iterative.ts`) whose
 * consent is the user pressing Generate. Both call these same functions, so an
 * edit behaves identically whoever makes it.
 *
 * Every dependency is injected — the media store, the repo resolver, the event
 * seams — so the whole surface is tested without Electron or a disk.
 */

type Scope = { repoId: string; tab: 'model'; project: string };

export type ModelMcpDeps = {
  /** `repoPath` → the open repository, or the refusal to answer with. */
  resolveRepo: (repoPath: string) => Promise<{ ok: true; repoId: string } | { ok: false; kind: 'not-found' | 'refused'; message: string }>;
  listProjects: (repoId: string) => Promise<GitOpResult<MediaProject[]>>;
  listFiles: (scope: Scope) => Promise<GitOpResult<{ path: string; mtimeMs: number }[]>>;
  readBytes: (req: Scope & { path: string }) => Promise<GitOpResult<Buffer>>;
  /** Persist a design into an existing model: rewrites the sidecar and the obj/mtl/fbx trio. */
  saveSpec: (req: { repoId: string; project: string; path: string; spec: ModelSpec }) => Promise<GitOpResult<{ files: string[] }>>;
  /** Rewrite only the sidecar — an agent's intermediate edits, cheap enough to do per call. */
  writeSidecar: (req: Scope & { path: string; sidecar: ModelSidecar }) => Promise<GitOpResult<unknown>>;
  /** Start a new model: sidecar plus the trio, so it shows up in the explorer. */
  createModel: (req: { repoId: string; project: string; stem: string; spec: ModelSpec; engine: string }) => Promise<GitOpResult<{ primary: string }>>;
  emitChanged: (event: ModelChangedEvent) => void;
  emitOpen: (event: ModelOpenEvent) => void;
  /** Shrink a picture to fit an MCP response (`nativeImage` in production). */
  shrinkImage?: (data: Buffer, mime: string) => Promise<{ data: Buffer; mime: string }>;
  now?: () => Date;
};

/** Raw reference bytes served as they are; anything larger is shrunk first so the base64 fits an MCP response. */
export const REFERENCE_IMAGE_RAW_LIMIT = 2 * 1024 * 1024;
/** Models listed per call — a project of thousands is not a thing a prompt can hold. */
const LIST_LIMIT = 200;

const MODEL_EXT = /\.(obj|mtl|fbx|json)$/i;
/** `chair-2026.obj` → `chair-2026`. A bare name (no known extension) stays as it is. */
export const modelStem = (model: string): string => model.replace(MODEL_EXT, '');
const MIME_BY_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

const slugOf = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'model';

const stamp = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const text = (value: string): McpContentBlock => ({ type: 'text', text: value });

export function createModelTools(deps: ModelMcpDeps) {
  const now = deps.now ?? (() => new Date());
  const revisions = new Map<string, number>();
  const locks = new Map<string, Promise<unknown>>();

  /** Serialise read-modify-write per model: an agent firing parallel calls must not interleave. */
  function locked<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    const next = previous.then(run, run);
    locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  async function repoIdFor(repoPath: string): Promise<string> {
    const resolved = await deps.resolveRepo(repoPath);
    if (!resolved.ok) throw new McpToolError(resolved.kind, resolved.message);
    return resolved.repoId;
  }

  type Loaded = { repoId: string; scope: Scope; project: string; stem: string; sidecar: ModelSidecar | null };

  async function load(target: { repoPath: string; project: string; model: string }): Promise<Loaded> {
    const repoId = await repoIdFor(target.repoPath);
    let stem = modelStem(target.model);
    const scope: Scope = { repoId, tab: 'model', project: target.project };
    let read = await deps.readBytes({ ...scope, path: modelSidecarPath(`${stem}.obj`) });
    // A bare name can also be a model's folder (`<stem>/<stem>.json`), the layout every new generation uses.
    if (!read.ok && !stem.includes('/')) {
      const inFolder = await deps.readBytes({ ...scope, path: `${stem}/${stem}.json` });
      if (inFolder.ok) {
        read = inFolder;
        stem = `${stem}/${stem}`;
      }
    }
    return { repoId, scope, project: target.project, stem, sidecar: read.ok ? parseModelSidecar(read.value.toString('utf8')) : null };
  }

  const need = (loaded: Loaded, target: { project: string; model: string }): ModelSidecar => {
    if (!loaded.sidecar) {
      throw new McpToolError(
        'not-found',
        `No model "${target.model}" with a saved design in project "${target.project}". Call model_list for the models that exist, or model_set_spec with a bare name to start one.`,
      );
    }
    return loaded.sidecar;
  };

  const keyOf = (l: Loaded): string => `${l.repoId}/${l.project}/${l.stem}`;
  const objPath = (l: Loaded): string => `${l.stem}.obj`;
  const bump = (key: string): number => {
    const next = (revisions.get(key) ?? 0) + 1;
    revisions.set(key, next);
    return next;
  };

  function announce(l: Loaded, spec: ModelSpec, saved: boolean, revision: number): void {
    deps.emitChanged({ repoId: l.repoId, project: l.project, path: objPath(l), spec, saved, revision });
  }

  async function writeEdit(l: Loaded, sidecar: ModelSidecar, spec: ModelSpec): Promise<McpToolOutput<'model_set_spec'>> {
    const wrote = await deps.writeSidecar({ ...l.scope, path: `${l.stem}.json`, sidecar: { ...sidecar, spec } });
    if (!wrote.ok) throw new McpToolError('error', wrote.kind === 'error' ? wrote.message : 'Could not write the design.');
    const revision = bump(keyOf(l));
    announce(l, spec, false, revision);
    return { ok: true, model: objPath(l), revision, ...describeEdit(spec) };
  }

  // --- reads -----------------------------------------------------------------

  async function modelList(input: McpToolInput<'model_list'>): Promise<McpToolOutput<'model_list'>> {
    const repoId = await repoIdFor(input.repoPath);
    const listed = await deps.listProjects(repoId);
    if (!listed.ok) throw new McpToolError('error', listed.kind === 'error' ? listed.message : 'Could not list projects.');
    const names = listed.value.map((p) => p.name).filter((name) => input.project === undefined || name === input.project);
    const projects: McpToolOutput<'model_list'>['projects'] = [];
    let budget = LIST_LIMIT;
    for (const name of names) {
      const files = await deps.listFiles({ repoId, tab: 'model', project: name });
      const objs = files.ok ? files.value.filter((f) => f.path.endsWith('.obj')).slice(0, Math.max(0, budget)) : [];
      budget -= objs.length;
      const models = await Promise.all(
        objs.map(async (file) => {
          const side = await deps.readBytes({ repoId, tab: 'model', project: name, path: modelSidecarPath(file.path) });
          const sidecar = side.ok ? parseModelSidecar(side.value.toString('utf8')) : null;
          return { model: file.path, name: sidecar?.spec.name ?? file.path.replace(MODEL_EXT, ''), parts: sidecar?.spec.parts.length ?? null, mtimeMs: file.mtimeMs };
        }),
      );
      projects.push({ name, models });
    }
    return { projects };
  }

  async function modelGetSpec(input: McpToolInput<'model_get_spec'>): Promise<McpToolOutput<'model_get_spec'>> {
    const l = await load(input);
    const sidecar = need(l, input);
    return {
      spec: ensurePartIds(sidecar.spec),
      revision: revisions.get(keyOf(l)) ?? 0,
      schema: modelSpecJsonSchema(),
      reference: modelSpecReference(),
      limits: { maxParts: MODEL_MAX_PARTS },
    };
  }

  async function modelRenderPreview(input: McpToolInput<'model_render_preview'>): Promise<McpToolOutput<'model_render_preview'>> {
    const l = await load(input);
    const sidecar = need(l, input);
    const spec = ensurePartIds(sidecar.spec);
    const rendered = renderPreviews(buildScene(spec), { views: input.views, size: input.size });
    const info = describeEdit(spec);
    const content: McpContentBlock[] = [
      text(
        `${spec.name}: ${info.partCount} parts, ${info.bounds.size.join(' x ')} m (x y z), lowest point y=${info.bounds.min[1]}. ` +
          `Views: ${rendered.map((r) => r.view).join(', ')}. Front looks along -Z (x to the right); side looks along -X; top looks down (front at the bottom); iso from front-right-above.`,
      ),
    ];
    for (const view of rendered) {
      content.push(text(`${view.view}`), { type: 'image', data: view.png.toString('base64'), mimeType: 'image/png' });
    }
    return { [MCP_CONTENT_KEY]: content };
  }

  async function modelGetReferenceImage(input: McpToolInput<'model_get_reference_image'>): Promise<McpToolOutput<'model_get_reference_image'>> {
    const l = await load(input);
    const sidecar = need(l, input);
    if (!sidecar.reference) throw new McpToolError('not-found', 'No reference picture is attached to this model.');
    // `reference` is relative to the model's own folder (flat legacy models: to the project, same thing).
    const dir = l.stem.includes('/') ? `${l.stem.split('/').slice(0, -1).join('/')}/` : '';
    const read = await deps.readBytes({ ...l.scope, path: `${dir}${sidecar.reference}` });
    if (!read.ok) throw new McpToolError('not-found', 'The reference picture file is missing.');
    let data = read.value;
    let mime = MIME_BY_EXT[sidecar.reference.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/png';
    if (data.length > REFERENCE_IMAGE_RAW_LIMIT) {
      if (!deps.shrinkImage) throw new McpToolError('refused', 'The reference picture is too large to return.');
      ({ data, mime } = await deps.shrinkImage(data, mime));
    }
    return { [MCP_CONTENT_KEY]: [text('Reference picture attached by the user.'), { type: 'image', data: data.toString('base64'), mimeType: mime }] };
  }

  // --- writes ----------------------------------------------------------------

  async function modelSetSpec(input: McpToolInput<'model_set_spec'>): Promise<McpToolOutput<'model_set_spec'>> {
    const validated = validateDesign(input.spec);
    if (!validated.ok) return { ok: false, errors: validated.errors };
    const repoId = await repoIdFor(input.repoPath);
    const hasExt = MODEL_EXT.test(input.model);
    const l = await load(input);

    return locked(keyOf(l), async () => {
      if (l.sidecar) return writeEdit(l, l.sidecar, validated.spec);
      if (hasExt) need(l, input);
      // A bare name starts a new model.
      const stem = `${slugOf(input.model)}-${stamp(now())}`;
      const created = await deps.createModel({ repoId, project: input.project, stem, spec: validated.spec, engine: 'mcp' });
      if (!created.ok) throw new McpToolError('error', created.kind === 'error' ? created.message : 'Could not create the model.');
      const fresh: Loaded = { ...l, stem: created.value.primary.replace(/\.obj$/, ''), sidecar: null };
      const revision = bump(keyOf(fresh));
      announce(fresh, validated.spec, true, revision);
      return { ok: true, model: created.value.primary, revision, ...describeEdit(validated.spec) };
    });
  }

  async function modelPatchParts(input: McpToolInput<'model_patch_parts'>): Promise<McpToolOutput<'model_patch_parts'>> {
    const l = await load(input);
    return locked(keyOf(l), async () => {
      // Re-read inside the lock: a call queued behind another must patch the design that call left.
      const fresh = await load(input);
      const sidecar = need(fresh, input);
      const patched = applyPatchOps(sidecar.spec, input.ops);
      if (!patched.ok) return { ok: false, errors: patched.errors };
      return writeEdit(fresh, sidecar, patched.spec);
    });
  }

  async function modelOpen(input: McpToolInput<'model_open'>): Promise<McpToolOutput<'model_open'>> {
    const l = await load(input);
    need(l, input);
    deps.emitOpen({ repoId: l.repoId, project: l.project, path: objPath(l) });
    return { opened: true, model: objPath(l) };
  }

  async function modelSave(input: McpToolInput<'model_save'>): Promise<McpToolOutput<'model_save'>> {
    const l = await load(input);
    const sidecar = need(l, input);
    return locked(keyOf(l), async () => {
      const saved = await deps.saveSpec({ repoId: l.repoId, project: l.project, path: objPath(l), spec: sidecar.spec });
      if (!saved.ok) throw new McpToolError('error', saved.kind === 'error' ? saved.message : 'Could not write the model files.');
      announce(l, sidecar.spec, true, revisions.get(keyOf(l)) ?? 0);
      return { saved: true, files: saved.value.files };
    });
  }

  return {
    model_list: modelList,
    model_open: modelOpen,
    model_get_spec: modelGetSpec,
    model_set_spec: modelSetSpec,
    model_patch_parts: modelPatchParts,
    model_render_preview: modelRenderPreview,
    model_get_reference_image: modelGetReferenceImage,
    model_save: modelSave,
  };
}

export type ModelTools = ReturnType<typeof createModelTools>;
