import {
  applyPoint,
  assetSkin,
  buildScene,
  decimateMesh,
  decodeMeshBin,
  EditableMesh,
  encodeMeshBin,
  freshPartId,
  lassoVertices,
  MCP_CONTENT_KEY,
  maskVertices,
  MESH_GROUP_NONE,
  modelAssetHash,
  modelAssetPath,
  previewCamera,
  registerModelTexture,
  registerSculptMesh,
  RemeshError,
  resizeMask,
  resolveLandmarks,
  resolveRef,
  resolveRig,
  resolveTarget,
  regionVertices,
  retopologize,
  runAimedStroke,
  sceneBounds,
  SculptBrushSchema,
  SculptDocument,
  SculptSymmetrySchema,
  sdfMeshSrcFor,
  skinDrift,
  skinIsNormalised,
  transferSkinWeights,
  uniformScale,
  unwrapMesh,
  weldVertices,
  bakeMaps,
  indexParts,
  worldMatrices,
  withPartIds,
  type AimContext,
  type AimView,
  type BakeKind,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type MeshBin,
  type ModelEditResult,
  type ModelOpEntry,
  type ModelSculptPart,
  type ModelSidecar,
  type ModelSpec,
  type PreviewCamera,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { designDir } from './model-assets';
import type { ModelMcpDeps } from './model-mcp';
import { encodePng, renderPreviews } from './preview';
import { describeEdit } from './spec-ops';

/**
 * Sculpting over MCP and the mesh pipeline (Phase 104 Themes E and F): the tool bodies that work on a design's
 * `sculpt` parts. `model-mcp.ts` owns loading, locking and writing a design; it hands those in as a
 * {@link MeshToolEnv}, so these functions are read-modify-write steps and nothing here touches a disk or window.
 *
 * **A live document per sculpt part.** A stroke needs the mesh's BVH, mask and history, none of which survive a
 * file round trip, so each (model, part) keeps one {@link SculptDocument} for the session, keyed to the content
 * hash of the file it last wrote. If anything else changes the part (the editor, `model_sdf_*`, a pipeline op)
 * the hash no longer matches and the next call reloads from disk — history starts over, never goes stale.
 *
 * **Every call that changes the mesh writes it.** Like the SDF tools, each edit lands as a content-named
 * `<stem>.<part>.<hash8>.mesh.bin` plus an op-log line, so the open editor can fetch it and undo past a save
 * still finds its file. Superseded files are not garbage-collected yet (see `outstanding.md`).
 */

export type LoadedModel = { repoId: string; scope: { repoId: string; tab: 'model'; project: string }; project: string; stem: string; sidecar: ModelSidecar | null };
type Target = { repoPath: string; project: string; model: string };
type EditOk = Extract<ModelEditResult, { ok: true }>;

export type MeshToolEnv = {
  deps: ModelMcpDeps;
  now: () => Date;
  load: (target: Target) => Promise<LoadedModel>;
  need: (loaded: LoadedModel, target: Target) => ModelSidecar;
  locked: <T>(key: string, run: () => Promise<T>) => Promise<T>;
  keyOf: (loaded: LoadedModel) => string;
  /** Writes the design; `keepCameras` leaves the last previews' cameras valid (a sculpt edit moves no bounds an agent aimed by). */
  writeEdit: (loaded: LoadedModel, sidecar: ModelSidecar, spec: ModelSpec, options?: { keepCameras?: boolean }) => Promise<EditOk>;
  /** The cameras `model_render_preview` last used for this model, by view. */
  cameras: (loaded: LoadedModel) => Map<string, PreviewCamera>;
  /** The current revision without bumping it. */
  revision: (loaded: LoadedModel) => number;
};

type Session = { doc: SculptDocument; hash: string };

const fail = (path: string, message: string): { ok: false; errors: { path: string; message: string }[] } => ({ ok: false, errors: [{ path, message }] });
const text = (value: string): McpContentBlock => ({ type: 'text', text: value });
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A part (id, or unique name) that is a sculpt part; with no ref, the design's only one (or only visible one). */
export function findSculptPart(spec: ModelSpec, ref?: string): { ok: true; index: number; part: ModelSculptPart } | { ok: false; error: string } {
  const sculpts = spec.parts.map((part, index) => ({ part, index })).filter((entry): entry is { part: ModelSculptPart; index: number } => entry.part.shape === 'sculpt');
  if (ref === undefined) {
    const visible = sculpts.filter((entry) => !entry.part.hidden);
    const pool = sculpts.length === 1 ? sculpts : visible;
    if (pool.length === 1) return { ok: true, ...pool[0]! };
    return {
      ok: false,
      error: sculpts.length === 0 ? 'The design has no sculpt part yet — create one with model_sdf_set or model_convert_to_mesh.' : `The design has ${pool.length} candidate sculpt parts; name one: ${sculpts.map((s) => s.part.name).join(', ')}.`,
    };
  }
  const byId = sculpts.find((entry) => entry.part.id === ref);
  const byName = sculpts.filter((entry) => entry.part.name === ref);
  const hit = byId ?? (byName.length === 1 ? byName[0] : undefined);
  if (!hit) return { ok: false, error: `No sculpt part has id "${ref}" or a unique name "${ref}". Sculpt parts: ${sculpts.map((s) => `${s.part.id} (${s.part.name})`).join(', ') || '(none)'}.` };
  return { ok: true, ...hit };
}

const UNWRAPPED = (part: ModelSculptPart): string =>
  `"${part.name}" is unwrapped (its seams are split vertices, so a brush would tear them). Call model_unwrap with clear: true to drop the UVs and baked maps first.`;

const uniqueName = (spec: ModelSpec, base: string): string => {
  const names = new Set(spec.parts.map((p) => p.name));
  if (!names.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 56)} ${n}`;
    if (!names.has(candidate)) return candidate;
  }
};

export function createMeshTools(env: MeshToolEnv) {
  const { deps } = env;
  const sessions = new Map<string, Session>();
  const sessionKey = (l: LoadedModel, part: ModelSculptPart): string => `${env.keyOf(l)}#${part.id}`;

  async function readMesh(l: LoadedModel, part: ModelSculptPart): Promise<{ bytes: Uint8Array; mesh: MeshBin }> {
    const read = await deps.readBytes({ ...l.scope, path: modelAssetPath(designDir(l.stem), part.src) });
    if (!read.ok) throw new McpToolError('error', `The sculpt mesh "${part.src}" is missing from the model's folder.`);
    const bytes = new Uint8Array(read.value.buffer, read.value.byteOffset, read.value.byteLength);
    try {
      return { bytes, mesh: decodeMeshBin(bytes) };
    } catch (error) {
      throw new McpToolError('error', error instanceof Error ? error.message : String(error));
    }
  }

  async function sessionFor(l: LoadedModel, part: ModelSculptPart): Promise<Session> {
    const key = sessionKey(l, part);
    const live = sessions.get(key);
    if (live && live.hash === part.hash) return live;
    const { bytes } = await readMesh(l, part);
    const session = { doc: SculptDocument.fromMeshBin(bytes, part.revision ?? 0), hash: part.hash };
    sessions.set(key, session);
    return session;
  }

  /** Writes `bytes` as the part's new mesh file and returns the part with its new fields. */
  async function writeMeshFile(l: LoadedModel, part: ModelSculptPart, bytes: Uint8Array, ops: ModelOpEntry[]): Promise<{ src: string; hash: string }> {
    const hash = modelAssetHash(bytes);
    const base = l.stem.split('/').pop()!;
    const src = sdfMeshSrcFor(base, part.id ?? 'p', hash);
    const wrote = await deps.writeMesh({ op: 'write', repoId: l.repoId, project: l.project, dir: designDir(l.stem), src, data: bytes, ops });
    if (!wrote.ok) throw new McpToolError('error', wrote.kind === 'error' ? wrote.message : 'Could not write the sculpt mesh.');
    registerSculptMesh(hash, bytes);
    return { src, hash };
  }

  const replacePart = (spec: ModelSpec, index: number, part: ModelSculptPart): ModelSpec => ({ ...spec, parts: spec.parts.map((p, i) => (i === index ? part : p)) });
  const withoutSdf = (part: ModelSculptPart): ModelSculptPart => {
    const { sdf: _sdf, ...rest } = part;
    return rest as ModelSculptPart;
  };

  const history = (doc: SculptDocument) => ({ undoable: doc.revision - doc.reachable.min, redoable: doc.reachable.max - doc.revision });

  function sculptInfo(doc: SculptDocument, part: ModelSculptPart, summary: Record<string, number | string | boolean>): NonNullable<EditOk['sculpt']> {
    return { part: part.id ?? part.name, vertices: doc.mesh.vertexCount, triangles: doc.mesh.faceCount, level: doc.multires.levelNumber, revision: doc.revision, ...history(doc), summary };
  }

  /** Persist the document's current mesh as the part's file and land the design. */
  async function commitDoc(
    l: LoadedModel,
    sidecar: ModelSidecar,
    spec: ModelSpec,
    index: number,
    doc: SculptDocument,
    session: Session,
    ops: ModelOpEntry[],
    summary: Record<string, number | string | boolean>,
  ): Promise<{ result: EditOk; spec: ModelSpec }> {
    const part = spec.parts[index] as ModelSculptPart;
    const bytes = doc.serialize();
    const file = await writeMeshFile(l, part, bytes, ops);
    session.hash = file.hash;
    const next: ModelSculptPart = { ...withoutSdf(part), src: file.src, hash: file.hash, vertices: doc.mesh.vertexCount, triangles: doc.mesh.faceCount, multiresLevel: doc.multires.levelNumber, revision: doc.revision };
    const landed = replacePart(spec, index, next);
    const written = await env.writeEdit(l, sidecar, landed, { keepCameras: true });
    return { result: { ...written, sculpt: sculptInfo(doc, next, summary) }, spec: landed };
  }

  const okNoWrite = (l: LoadedModel, spec: ModelSpec, extra: Partial<EditOk>): EditOk => ({ ok: true, model: `${l.stem}.obj`, revision: env.revision(l), ...describeEdit(spec), ...extra });

  const aimCamera = (l: LoadedModel, spec: ModelSpec) => (view: AimView, size: number): PreviewCamera | null => {
    const last = env.cameras(l).get(view);
    if (last) {
      // The preview's camera depends on the image size only by scale; reuse the one the agent saw.
      const k = size / last.size;
      return { ...last, size, scale: last.scale * k, offsetX: last.offsetX * k, offsetY: last.offsetY * k };
    }
    return previewCamera(buildScene(spec), view, size);
  };

  function aimContext(l: LoadedModel, spec: ModelSpec, index: number, doc: SculptDocument, radius: number): AimContext {
    const part = spec.parts[index] as ModelSculptPart;
    const scene = buildScene(spec);
    return {
      doc,
      toWorld: worldMatrices(spec.parts)[index]!,
      camera: aimCamera(l, spec),
      rig: resolveRig(spec),
      landmarks: Object.fromEntries(resolveLandmarks(spec, scene).map((m) => [m.name, m.position])),
      groupNames: (part.groups ?? []).map((g) => g.name),
      partBounds: (ref) => {
        const at = resolveRef(indexParts(spec.parts), ref);
        if (at === null) return null;
        // Build just that part's subtree, shown even when a conversion hid it.
        const keep = new Set<number>([at]);
        spec.parts.forEach((p, i) => {
          let walk: string | undefined = p.parent;
          const seen = new Set<string>();
          while (walk !== undefined && !seen.has(walk)) {
            seen.add(walk);
            const pi = resolveRef(indexParts(spec.parts), walk);
            if (pi === at) keep.add(i);
            walk = pi === null ? undefined : spec.parts[pi]!.parent;
          }
        });
        const only: ModelSpec = { ...spec, parts: spec.parts.map((p, i) => (keep.has(i) ? { ...p, hidden: false } : { ...p, hidden: true })) };
        const parts = buildScene(only);
        return parts.length === 0 ? null : sceneBounds(parts);
      },
      radius,
    };
  }

  const defaultRadius = (doc: SculptDocument, toWorld: number[]): number => {
    const b = doc.mesh.bounds();
    const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    return Math.max(1e-4, diag * 0.06 * (uniformScale(toWorld) || 1)) / (uniformScale(toWorld) || 1);
  };

  /** Common prologue: lock, reload, find the part, refuse an unwrapped one, and open its document. */
  async function withSculpt<T>(
    input: Target & { part?: string | undefined },
    options: { allowUnwrapped?: boolean },
    run: (ctx: { l: LoadedModel; sidecar: ModelSidecar; spec: ModelSpec; index: number; part: ModelSculptPart; session: Session }) => Promise<T>,
  ): Promise<T | ReturnType<typeof fail>> {
    const l = await env.load(input);
    return env.locked(env.keyOf(l), async () => {
      const fresh = await env.load(input);
      const sidecar = env.need(fresh, input);
      const spec = withPartIds(sidecar.spec);
      const found = findSculptPart(spec, input.part);
      if (!found.ok) return fail('part', found.error);
      if (found.part.uv && !options.allowUnwrapped) return fail('part', UNWRAPPED(found.part));
      const session = await sessionFor(fresh, found.part);
      return run({ l: fresh, sidecar, spec, index: found.index, part: found.part, session });
    });
  }

  async function thumbnail(spec: ModelSpec, view: AimView | undefined, size: number | undefined): Promise<McpContentBlock[]> {
    const shot = renderPreviews(buildScene(spec), { views: [view ?? 'front'], size: size ?? 256 })[0];
    return shot ? [text(`${shot.view} (${shot.size} px)`), { type: 'image', data: shot.png.toString('base64'), mimeType: 'image/png' }] : [];
  }

  // --- Theme E ---------------------------------------------------------------------------

  async function modelGetLandmarks(input: McpToolInput<'model_get_landmarks'>): Promise<McpToolOutput<'model_get_landmarks'>> {
    const l = await env.load(input);
    const spec = env.need(l, input).spec;
    const landmarks = resolveLandmarks(spec, buildScene(spec));
    return { facing: resolveRig(spec)?.facing ?? spec.rig?.facing ?? '+z', landmarks: landmarks.map((m) => ({ name: m.name, position: m.position, source: m.source })) };
  }

  async function modelSculptStroke(input: McpToolInput<'model_sculpt_stroke'>): Promise<McpToolOutput<'model_sculpt_stroke'>> {
    const out = await withSculpt(input, {}, async ({ l, sidecar, spec, index, session }) => {
      const { doc } = session;
      const toWorld = worldMatrices(spec.parts)[index]!;
      const scale = uniformScale(toWorld) || 1;
      let radius = input.radius !== undefined ? input.radius / scale : defaultRadius(doc, toWorld);
      if (input.target.mode === 'screen' && input.target.radiusPixels !== undefined) {
        const camera = aimCamera(l, spec)(input.target.view, input.target.size ?? 384);
        if (camera) radius = input.target.radiusPixels / camera.scale / scale;
      }
      const brush = SculptBrushSchema.parse({
        brush: input.brush,
        radius,
        strength: input.strength ?? 0.5,
        falloff: input.falloff ?? 'smooth',
        spacing: input.spacing ?? 0.1,
        ...(input.invert ? { invert: true } : {}),
        ...((input.frontFacesOnly ?? input.target.mode === 'screen') ? { frontFacesOnly: true } : {}),
      });
      const planned = resolveTarget(aimContext(l, spec, index, doc, radius), input.target);
      if (!planned.ok) return { ok: false as const, errors: planned.errors };
      const summary = runAimedStroke(doc, brush, planned.plan, { symmetry: SculptSymmetrySchema.parse(input.symmetry ?? {}), toWorld });
      if (!summary) {
        const result = okNoWrite(l, spec, { sculpt: sculptInfo(doc, spec.parts[index] as ModelSculptPart, { moved: 0, note: 'the stroke moved nothing — masked, out of reach, or a zero-strength brush' }) });
        return { [MCP_CONTENT_KEY]: [text(JSON.stringify(result))] };
      }
      const entry: ModelOpEntry = {
        kind: 'stroke',
        at: env.now().toISOString(),
        by: 'agent',
        data: { brush: input.brush, target: input.target.mode, radius: Number(radius.toFixed(5)), strength: brush.strength, moved: summary.moved, maxDisplacement: Number(summary.maxDisplacement.toFixed(5)) },
      };
      const committed = await commitDoc(l, sidecar, spec, index, doc, session, [entry], {
        brush: input.brush,
        aim: planned.plan.note,
        dabs: summary.dabs,
        moved: summary.moved,
        masked: summary.masked,
        maxDisplacement: Number(summary.maxDisplacement.toFixed(5)),
      });
      const view = input.preview === false ? undefined : (input.preview?.view ?? (input.target.mode === 'screen' ? input.target.view : 'front'));
      const shot = input.preview === false ? [] : await thumbnail(committed.spec, view, input.preview?.size);
      return { [MCP_CONTENT_KEY]: [text(JSON.stringify(committed.result)), ...shot] };
    });
    return out as McpToolOutput<'model_sculpt_stroke'>;
  }

  async function modelMask(input: McpToolInput<'model_mask'>): Promise<McpToolOutput<'model_mask'>> {
    return (await withSculpt(input, {}, async ({ l, spec, index, part, session }) => {
      const { doc } = session;
      const toWorld = worldMatrices(spec.parts)[index]!;
      const before = doc.mask.reduce((n, m) => n + (m > 0 ? 1 : 0), 0);
      let changed = false;
      let note: string = input.op;
      if (input.op === 'invert' || input.op === 'clear') changed = doc.maskOp(input.op);
      else if (input.op === 'grow' || input.op === 'shrink') changed = resizeMask(doc, input.steps ?? 1, input.op);
      else {
        let vertices: number[] = [];
        if (input.lasso) {
          const camera = aimCamera(l, spec)(input.lasso.view, input.lasso.size ?? 384);
          if (!camera) return fail('lasso', 'There is nothing to look at.');
          vertices = lassoVertices(doc, toWorld, camera, input.lasso.points);
          note = `lasso on ${input.lasso.view}: ${vertices.length} visible vertices`;
        } else if (input.region) {
          const radius = input.region.radius ?? defaultRadius(doc, toWorld);
          const ctx = aimContext(l, spec, index, doc, radius);
          const found = regionVertices(ctx, input.region, radius * (uniformScale(toWorld) || 1));
          if (!found.ok) return fail('region', found.error);
          vertices = found.vertices;
          note = found.note;
        } else return fail('op', 'op "set" needs a region or a lasso.');
        if (vertices.length === 0) return fail('region', 'That selects no vertices.');
        changed = maskVertices(doc, vertices, input.value ?? 1);
      }
      const after = doc.mask.reduce((n, m) => n + (m > 0 ? 1 : 0), 0);
      if (changed) {
        await deps.writeMesh({ op: 'appendOps', repoId: l.repoId, project: l.project, dir: designDir(l.stem), src: part.src, ops: [{ kind: 'mask', at: env.now().toISOString(), by: 'agent', data: { op: input.op, masked: after } }] });
      }
      return okNoWrite(l, spec, { sculpt: sculptInfo(doc, part, { op: input.op, aim: note, maskedBefore: before, masked: after, changed }) });
    })) as McpToolOutput<'model_mask'>;
  }

  async function modelSubdivide(input: McpToolInput<'model_subdivide'>): Promise<McpToolOutput<'model_subdivide'>> {
    return (await withSculpt(input, {}, async ({ l, sidecar, spec, index, session }) => {
      const { doc } = session;
      try {
        for (let i = 0; i < (input.levels ?? 1); i += 1) doc.subdivide();
      } catch (error) {
        return fail('levels', error instanceof Error ? error.message : String(error));
      }
      const entry: ModelOpEntry = { kind: 'subdivide', at: env.now().toISOString(), by: 'agent', data: { levels: input.levels ?? 1, level: doc.multires.levelNumber, vertices: doc.mesh.vertexCount } };
      return (await commitDoc(l, sidecar, spec, index, doc, session, [entry], { levelsAdded: input.levels ?? 1 })).result;
    })) as McpToolOutput<'model_subdivide'>;
  }

  async function modelRemesh(input: McpToolInput<'model_remesh'>): Promise<McpToolOutput<'model_remesh'>> {
    return (await withSculpt(input, {}, async ({ l, sidecar, spec, index, session }) => {
      const { doc } = session;
      let info: { voxelSize: number; coarsened: boolean };
      try {
        info = doc.remesh({ ...(input.voxelSize !== undefined ? { voxelSize: input.voxelSize } : {}), ...(input.targetVertices !== undefined ? { targetVertices: input.targetVertices } : {}) });
      } catch (error) {
        if (error instanceof RemeshError) return fail('part', error.message);
        throw error;
      }
      const entry: ModelOpEntry = { kind: 'remesh', at: env.now().toISOString(), by: 'agent', data: { voxelSize: Number(info.voxelSize.toFixed(5)), vertices: doc.mesh.vertexCount } };
      return (await commitDoc(l, sidecar, spec, index, doc, session, [entry], { voxelSize: Number(info.voxelSize.toFixed(5)), coarsened: info.coarsened })).result;
    })) as McpToolOutput<'model_remesh'>;
  }

  async function modelSculptUndo(input: McpToolInput<'model_sculpt_undo'>): Promise<McpToolOutput<'model_sculpt_undo'>> {
    return (await withSculpt(input, { allowUnwrapped: false }, async ({ l, sidecar, spec, index, session }) => {
      const { doc } = session;
      const steps = input.steps ?? 1;
      const target = input.redo ? doc.revision + steps : doc.revision - steps;
      const { min, max } = doc.reachable;
      if (target < min || target > max) {
        return fail('steps', `This session can ${input.redo ? 'redo' : 'undo'} ${input.redo ? max - doc.revision : doc.revision - min} more edit(s); history starts when the mesh is first edited here and holds 100.`);
      }
      doc.seek(target);
      const entry: ModelOpEntry = { kind: 'stroke', at: env.now().toISOString(), by: 'agent', data: { [input.redo ? 'redo' : 'undo']: steps, revision: doc.revision } };
      const committed = await commitDoc(l, sidecar, spec, index, doc, session, [entry], { [input.redo ? 'redone' : 'undone']: steps });
      return { [MCP_CONTENT_KEY]: [text(JSON.stringify(committed.result)), ...(await thumbnail(committed.spec, 'front', 256))] };
    })) as McpToolOutput<'model_sculpt_undo'>;
  }

  // --- Theme F ---------------------------------------------------------------------------

  /** The skeleton survives a topology edit: skin is derived per vertex, so re-derive it and compare with the transfer. */
  function rigReport(spec: ModelSpec, index: number, oldMesh: { positions: Float32Array; indices: Uint32Array }, nextMesh: { positions: Float32Array; indices: Uint32Array }) {
    const rig = resolveRig(spec);
    if (!rig) return undefined;
    const world = worldMatrices(spec.parts)[index]!;
    const toWorld = (p: Float32Array): number[] => {
      const out: number[] = [];
      for (let i = 0; i < p.length; i += 3) out.push(...applyPoint(world, [p[i]!, p[i + 1]!, p[i + 2]!]));
      return out;
    };
    const oldW = toWorld(oldMesh.positions);
    const newW = toWorld(nextMesh.positions);
    const oldSkin = assetSkin(rig, oldW);
    const derived = assetSkin(rig, newW);
    const moved = transferSkinWeights({ positions: oldW, indices: oldMesh.indices, skin: oldSkin }, newW, { dstIndices: nextMesh.indices });
    const count = newW.length / 3;
    return { kept: true, normalised: skinIsNormalised(derived, count) && skinIsNormalised(moved, count), influences: 4, drift: { mean: Number(skinDrift(moved, derived, count).mean.toFixed(4)), max: Number(skinDrift(moved, derived, count).max.toFixed(4)) } };
  }

  const triangleGroups = (mesh: MeshBin): Uint16Array | undefined => {
    if (!mesh.groups) return undefined;
    const out = new Uint16Array(mesh.indices.length / 3);
    for (let t = 0; t < out.length; t += 1) out[t] = mesh.groups[mesh.indices[t * 3]!] ?? MESH_GROUP_NONE;
    return out;
  };

  /** Lands a new low-poly mesh as a copy (original hidden, kept as the bake source) or in place. */
  async function landMesh(
    l: LoadedModel,
    sidecar: ModelSidecar,
    spec: ModelSpec,
    index: number,
    part: ModelSculptPart,
    mesh: { positions: Float32Array; indices: Uint32Array; groups?: Uint16Array; uvs?: Float32Array; normals?: Float32Array },
    op: { kind: 'decimate' | 'retopo' | 'unwrap'; data: Record<string, unknown> },
    options: { replace: boolean; name?: string | undefined; uv?: ModelSculptPart['uv'] | null; keepMaps?: boolean },
  ): Promise<{ spec: ModelSpec; part: ModelSculptPart; index: number; vertices: number; triangles: number }> {
    const normals = mesh.normals ?? new EditableMesh({ positions: mesh.positions, indices: mesh.indices }).normals;
    const bytes = encodeMeshBin({ positions: mesh.positions, normals, indices: mesh.indices, multiresLevel: 0, ...(mesh.groups ? { groups: mesh.groups } : {}), ...(mesh.uvs ? { uvs: mesh.uvs } : {}) });
    const vertices = mesh.positions.length / 3;
    const triangles = mesh.indices.length / 3;
    const target = options.replace ? part : { ...part, id: freshPartId(new Set(spec.parts.map((p) => p.id!))), name: uniqueName(spec, options.name ?? `${part.name} low`) };
    const file = await writeMeshFile(l, target, bytes, [{ kind: op.kind, at: env.now().toISOString(), by: 'agent', hash: modelAssetHash(bytes), data: op.data }]);
    const { maps: _maps, uv: _uv, bakeFrom: _bake, ...rest } = withoutSdf(target);
    const next: ModelSculptPart = {
      ...rest,
      src: file.src,
      hash: file.hash,
      vertices,
      triangles,
      multiresLevel: 0,
      ...(options.replace ? {} : { bakeFrom: part.id!, sources: undefined }),
      ...(options.replace && part.bakeFrom ? { bakeFrom: part.bakeFrom } : {}),
      ...(options.keepMaps && part.maps ? { maps: part.maps } : {}),
      ...(options.uv === undefined ? (part.uv && options.replace ? { uv: part.uv } : {}) : options.uv ? { uv: options.uv } : {}),
    };
    if (next.sources === undefined) delete (next as { sources?: unknown }).sources;
    let parts = spec.parts.slice();
    if (options.replace) parts[index] = next;
    else {
      parts = parts.map((p, i) => (i === index ? { ...p, hidden: true } : p));
      parts.push(next);
    }
    let out: ModelSpec = { ...spec, parts };
    // The copy inherits the original's explicit rig binding.
    const bind = spec.rig?.bind;
    if (!options.replace && bind && out.rig) {
      const bone = bind[part.id!] ?? bind[part.name];
      if (bone) out = { ...out, rig: { ...out.rig!, bind: { ...bind, [next.id!]: bone } } };
    }
    return { spec: out, part: next, index: options.replace ? index : parts.length - 1, vertices, triangles };
  }

  async function pipeline(
    input: Target & { part?: string | undefined },
    allowUnwrapped: boolean,
    run: (ctx: { l: LoadedModel; sidecar: ModelSidecar; spec: ModelSpec; index: number; part: ModelSculptPart; mesh: MeshBin }) => Promise<EditOk | ReturnType<typeof fail>>,
  ) {
    const l = await env.load(input);
    return env.locked(env.keyOf(l), async () => {
      const fresh = await env.load(input);
      const sidecar = env.need(fresh, input);
      const spec = withPartIds(sidecar.spec);
      const found = findSculptPart(spec, input.part);
      if (!found.ok) return fail('part', found.error);
      if (found.part.uv && !allowUnwrapped) return fail('part', UNWRAPPED(found.part));
      const { mesh } = await readMesh(fresh, found.part);
      return run({ l: fresh, sidecar, spec, index: found.index, part: found.part, mesh });
    });
  }

  async function modelDecimate(input: McpToolInput<'model_decimate'>): Promise<McpToolOutput<'model_decimate'>> {
    return (await pipeline(input, true, async ({ l, sidecar, spec, index, part, mesh }) => {
      const faces = mesh.indices.length / 3;
      const result = decimateMesh(
        { positions: mesh.positions, indices: mesh.indices, ...(mesh.groups ? { groups: mesh.groups } : {}), ...(mesh.uvs ? { uvs: mesh.uvs } : {}) },
        { ...(input.targetTriangles !== undefined ? { targetTriangles: input.targetTriangles } : { ratio: input.ratio ?? 0.5 }), lockBorders: input.lockBorders ?? true },
      );
      const landed = await landMesh(l, sidecar, spec, index, part, { positions: result.positions, indices: result.indices, ...(result.groups ? { groups: result.groups } : {}), ...(result.uvs ? { uvs: result.uvs } : {}) }, { kind: 'decimate', data: { before: faces, after: result.after, target: result.target, maxError: Number(result.maxError.toExponential(3)) } }, { replace: input.replace ?? false, name: input.name, uv: part.uv && result.uvs ? part.uv : null, keepMaps: false });
      const written = await env.writeEdit(l, sidecar, landed.spec);
      const rig = rigReport(landed.spec, landed.index, mesh, { positions: result.positions, indices: result.indices });
      const warnings = result.reachedTarget ? [] : [{ path: 'targetTriangles', message: `Stopped at ${result.after} triangles: the remaining collapses would cross a border, break the surface or flip a face.` }];
      return {
        ...written,
        warnings: [...(written.warnings ?? []), ...warnings],
        pipeline: { op: 'decimate', part: landed.part.id!, vertices: landed.vertices, triangles: landed.triangles, summary: { before: faces, after: result.after, target: result.target, reachedTarget: result.reachedTarget, borderVertices: result.borderVertices, original: input.replace ? 'replaced' : (part.id ?? '') }, ...(rig ? { rig } : {}) },
      };
    })) as McpToolOutput<'model_decimate'>;
  }

  async function modelRetopo(input: McpToolInput<'model_retopo'>): Promise<McpToolOutput<'model_retopo'>> {
    return (await pipeline(input, false, async ({ l, sidecar, spec, index, part, mesh }) => {
      let result: ReturnType<typeof retopologize>;
      try {
        const groups = triangleGroups(mesh);
        result = retopologize({ positions: mesh.positions, indices: mesh.indices, ...(groups ? { groups } : {}) }, { targetFaces: input.targetFaces });
      } catch (error) {
        if (error instanceof RemeshError) return fail('targetFaces', error.message);
        throw error;
      }
      const landed = await landMesh(l, sidecar, spec, index, part, { positions: result.positions, indices: result.indices, ...(mesh.groups ? { groups: result.groups } : {}) }, { kind: 'retopo', data: { target: result.targetFaces, faces: result.faces, quadShare: Number(result.quadShare.toFixed(3)) } }, { replace: input.replace ?? false, name: input.name, uv: null });
      const written = await env.writeEdit(l, sidecar, landed.spec);
      const rig = rigReport(landed.spec, landed.index, mesh, { positions: result.positions, indices: result.indices });
      return {
        ...written,
        warnings: [...(written.warnings ?? []), ...(result.coarsened ? [{ path: 'targetFaces', message: 'The grid was coarsened to stay within its cap; the mesh has fewer faces than asked.' }] : [])],
        pipeline: { op: 'retopo', part: landed.part.id!, vertices: landed.vertices, triangles: landed.triangles, summary: { target: result.targetFaces, faces: result.faces, quadShare: Number(result.quadShare.toFixed(3)), looseTriangles: result.looseTriangles, maxSnap: Number(result.maxSnap.toFixed(5)), aligned: 'axis (not field-aligned)' }, ...(rig ? { rig } : {}) },
      };
    })) as McpToolOutput<'model_retopo'>;
  }

  async function modelUnwrap(input: McpToolInput<'model_unwrap'>): Promise<McpToolOutput<'model_unwrap'>> {
    return (await pipeline(input, true, async ({ l, sidecar, spec, index, part, mesh }) => {
      let base = { positions: mesh.positions, indices: mesh.indices, normals: mesh.normals, groups: mesh.groups };
      if (part.uv) {
        const w = weldVertices(base);
        base = { positions: w.positions, indices: w.indices, normals: w.normals!, groups: w.groups };
      }
      if (input.clear) {
        if (!part.uv) return okNoWrite(l, spec, { pipeline: { op: 'unwrap', part: part.id!, vertices: base.positions.length / 3, triangles: base.indices.length / 3, summary: { cleared: false, note: 'the part has no unwrap' } } });
        const landed = await landMesh(l, sidecar, spec, index, part, { positions: base.positions, indices: base.indices, ...(base.groups ? { groups: base.groups } : {}), normals: base.normals }, { kind: 'unwrap', data: { cleared: true } }, { replace: true, uv: null });
        const written = await env.writeEdit(l, sidecar, landed.spec);
        return { ...written, pipeline: { op: 'unwrap', part: landed.part.id!, vertices: landed.vertices, triangles: landed.triangles, summary: { cleared: true } } };
      }
      const size = input.textureSize ?? 2048;
      const out = unwrapMesh({ positions: base.positions, indices: base.indices, ...(base.groups ? { groups: base.groups } : {}) }, { ...(input.angle !== undefined ? { angle: input.angle } : {}), ...(input.curvature !== undefined ? { curvature: input.curvature } : {}), textureSize: size });
      const normals = new Float32Array(out.positions.length);
      for (let v = 0; v < out.source.length; v += 1) normals.set([base.normals[out.source[v]! * 3]!, base.normals[out.source[v]! * 3 + 1]!, base.normals[out.source[v]! * 3 + 2]!], v * 3);
      const uv = { charts: out.charts, density: { mean: Math.round(out.density.mean), min: Math.round(out.density.min), max: Math.round(out.density.max) }, textureSize: size, coverage: Number(Math.min(1, out.coverage).toFixed(3)) };
      const landed = await landMesh(l, sidecar, spec, index, part, { positions: out.positions, indices: out.indices, uvs: out.uvs, normals, ...(out.groups ? { groups: out.groups } : {}) }, { kind: 'unwrap', data: { charts: out.charts, planar: out.planarCharts, coverage: uv.coverage } }, { replace: true, uv });
      const written = await env.writeEdit(l, sidecar, landed.spec);
      return {
        ...written,
        warnings: [...(written.warnings ?? []), ...(out.planarCharts > 0 ? [{ path: 'part', message: `${out.planarCharts} of ${out.charts} chart(s) could not be flattened conformally and were projected flat; lower the angle for smaller charts.` }] : []), ...(uv.coverage < 0.3 ? [{ path: 'part', message: `The charts cover only ${Math.round(uv.coverage * 100)}% of the texture; much of it will be empty.` }] : [])],
        pipeline: { op: 'unwrap', part: landed.part.id!, vertices: landed.vertices, triangles: landed.triangles, summary: { charts: out.charts, planarCharts: out.planarCharts, texelsPerMetreMean: uv.density.mean, texelsPerMetreMin: uv.density.min, texelsPerMetreMax: uv.density.max, textureSize: size, coverage: uv.coverage } },
      };
    })) as McpToolOutput<'model_unwrap'>;
  }

  async function modelBake(input: McpToolInput<'model_bake'>): Promise<McpToolOutput<'model_bake'>> {
    return (await pipeline(input, true, async ({ l, sidecar, spec, index, part, mesh }) => {
      if (!part.uv || !mesh.uvs) return fail('part', `"${part.name}" has no UVs — call model_unwrap first.`);
      const fromRef = input.from ?? part.bakeFrom;
      if (!fromRef) return fail('from', 'Name the high-resolution sculpt part to bake from (`from`); model_decimate and model_retopo record it when they make a low-poly copy.');
      const high = findSculptPart(spec, fromRef);
      if (!high.ok) return fail('from', high.error);
      if (high.index === index) return fail('from', 'The high-resolution part must be a different part from the one being baked onto.');
      const highMesh = (await readMesh(l, high.part)).mesh;
      const worlds = worldMatrices(spec.parts);
      const transform = (m: MeshBin, matrix: number[]): { positions: Float32Array; normals: Float32Array } => {
        const positions = new Float32Array(m.positions.length);
        const normals = new Float32Array(m.normals.length);
        const rot = (n: [number, number, number]): [number, number, number] => {
          const r = [matrix[0]! * n[0] + matrix[1]! * n[1] + matrix[2]! * n[2], matrix[4]! * n[0] + matrix[5]! * n[1] + matrix[6]! * n[2], matrix[8]! * n[0] + matrix[9]! * n[1] + matrix[10]! * n[2]] as [number, number, number];
          const len = Math.hypot(...r) || 1;
          return [r[0] / len, r[1] / len, r[2] / len];
        };
        for (let i = 0; i < m.positions.length; i += 3) {
          positions.set(applyPoint(matrix, [m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]), i);
          normals.set(rot([m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!]), i);
        }
        return { positions, normals };
      };
      const lowW = transform(mesh, worlds[index]!);
      const highW = transform(highMesh, worlds[high.index]!);
      const kinds = (input.maps ?? ['normal', 'ao', 'curvature', 'cavity']) as BakeKind[];
      const baked = await bakeMaps({
        high: { positions: highW.positions, indices: highMesh.indices, normals: highW.normals },
        low: { positions: lowW.positions, indices: mesh.indices, normals: lowW.normals, uvs: mesh.uvs },
        size: input.size ?? 2048,
        kinds,
        ...(input.cage !== undefined ? { cage: input.cage } : {}),
        ...(input.aoSamples !== undefined ? { aoSamples: input.aoSamples } : {}),
        padding: 4,
        yieldNow: tick,
      });
      const base = l.stem.split('/').pop()!;
      const maps: NonNullable<ModelSculptPart['maps']> = { ...(part.maps ?? {}) };
      const written: string[] = [];
      for (const kind of kinds) {
        const raw = baked[kind];
        if (!raw) continue;
        const rgb = kind === 'normal' ? raw : (() => { const out = new Uint8Array(raw.length * 3); for (let i = 0; i < raw.length; i += 1) out.fill(raw[i]!, i * 3, i * 3 + 3); return out; })();
        const png = encodePng(baked.size, baked.size, rgb);
        const data = new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
        const hash = modelAssetHash(data);
        const src = `${base}.${part.id}.${kind}.${hash.slice(0, 8)}.png`;
        if (!deps.writeFile) throw new McpToolError('error', 'Writing baked maps is not available here.');
        const wrote = await deps.writeFile({ ...l.scope, path: modelAssetPath(designDir(l.stem), src), data: png });
        if (!wrote.ok) throw new McpToolError('error', wrote.kind === 'error' ? wrote.message : `Could not write ${src}.`);
        registerModelTexture(hash, { mime: 'image/png', data });
        maps[kind] = { src, hash };
        written.push(src);
      }
      await deps.writeMesh({ op: 'appendOps', repoId: l.repoId, project: l.project, dir: designDir(l.stem), src: part.src, ops: [{ kind: 'bake', at: env.now().toISOString(), by: 'agent', data: { kinds, size: baked.size, hitRate: Number(baked.hitRate.toFixed(3)), from: high.part.id! } }] });
      const next: ModelSculptPart = { ...part, maps, bakeFrom: high.part.id! };
      const result = await env.writeEdit(l, sidecar, replacePart(spec, index, next));
      const warnings = [
        ...(baked.hitRate < 0.5 ? [{ path: 'cage', message: `Only ${Math.round(baked.hitRate * 100)}% of texels found the high-poly surface; raise \`cage\` or check the two parts overlap.` }] : []),
        ...(baked.coverage < 0.1 ? [{ path: 'part', message: 'The UV layout covers under 10% of the texture.' }] : []),
      ];
      return {
        ...result,
        warnings: [...(result.warnings ?? []), ...warnings],
        pipeline: { op: 'bake', part: part.id!, vertices: mesh.positions.length / 3, triangles: mesh.indices.length / 3, summary: { size: baked.size, maps: kinds, files: written, coverage: Number(baked.coverage.toFixed(3)), hitRate: Number(baked.hitRate.toFixed(3)), from: high.part.id! } },
      };
    })) as McpToolOutput<'model_bake'>;
  }

  async function modelExport(input: McpToolInput<'model_export'>): Promise<McpToolOutput<'model_export'>> {
    const l = await env.load(input);
    const sidecar = env.need(l, input);
    if (!deps.exportModel) throw new McpToolError('error', 'Export is not available here.');
    const formats = input.formats ?? ['glb', 'obj', 'fbx'];
    const exported = await deps.exportModel({ repoId: l.repoId, project: l.project, path: `${l.stem}.obj`, spec: sidecar.spec, formats });
    if (!exported.ok) throw new McpToolError('error', exported.kind === 'error' ? exported.message : 'Could not export.');
    return okNoWrite(l, sidecar.spec, { pipeline: { op: 'export', part: '', vertices: 0, triangles: describeEdit(sidecar.spec).triangles, summary: { files: exported.value.files, formats } } });
  }

  return {
    model_get_landmarks: modelGetLandmarks,
    model_sculpt_stroke: modelSculptStroke,
    model_mask: modelMask,
    model_subdivide: modelSubdivide,
    model_remesh: modelRemesh,
    model_sculpt_undo: modelSculptUndo,
    model_decimate: modelDecimate,
    model_retopo: modelRetopo,
    model_unwrap: modelUnwrap,
    model_bake: modelBake,
    model_export: modelExport,
  };
}

