import {
  addPbrLayer,
  applyPbrPreset,
  emptyPbr,
  findPbrLayer,
  flattenPbr,
  hexToUnit,
  MCP_CONTENT_KEY,
  modelAssetHash,
  modelAssetPath,
  outputsFor,
  PaintStroke,
  PaintSurface,
  PBR_CHANNELS,
  PBR_OUTPUTS,
  pbrSizes,
  registerModelTexture,
  removePbrLayer,
  resizePaintImage,
  resolveMaterial,
  resolveTarget,
  stampPattern,
  uniformScale,
  updatePbrLayer,
  worldMatrices,
  createPaintImage,
  type AimContext,
  type AimView,
  type FlattenInput,
  type LayerPatch,
  type McpContentBlock,
  type McpToolInput,
  type McpToolOutput,
  type MeshBin,
  type ModelEditResult,
  type ModelMapFile,
  type ModelPbr,
  type ModelSculptPart,
  type ModelSidecar,
  type ModelSpec,
  type PaintImage,
  type PaintTarget,
  type PbrBakes,
  type PbrLayer,
  type PbrOutput,
  type PreviewCamera,
  type SculptDocument,
} from '@midnite/studio-shared';

import { McpToolError } from '../../mcp/errors';
import { decodePng, encodePngRgba8 } from '../png/png-codec';
import { designDir } from './model-assets';
import type { LoadedModel, MeshToolEnv } from './sculpt-tools';

/**
 * PBR materials and texture painting over MCP (Phase 104 Theme G): `model_layer_list`, `model_material_set`,
 * `model_layer_add` / `_update` / `_remove` and `model_paint_stroke`.
 *
 * Every write lands the same way: changed paint-layer pixels are written as content-named PNGs
 * (`<stem>.<part>.<layer>-<channel>.<hash8>.png`), the stack is flattened into the outputs the change can affect
 * (`<stem>.<part>.pbr-<output>.<hash8>.png`), both are registered for the exporters and the preview, an op-log
 * line is appended, and the design is written. Older files stay on disk, like the mesh files, so an undo in the
 * editor still finds them.
 *
 * Decoded images are cached by content hash, so a run of strokes decodes each layer once; the paint surface (the
 * mesh's texel maps and BVH) is cached per mesh file.
 */
type EditOk = Extract<ModelEditResult, { ok: true }>;
type Fail = { ok: false; errors: { path: string; message: string }[] };
type Ctx = { l: LoadedModel; sidecar: ModelSidecar; spec: ModelSpec; index: number; part: ModelSculptPart; session: { doc: SculptDocument; hash: string } };

export type PaintHelpers = {
  withSculpt: <T>(input: { repoPath: string; project: string; model: string; part?: string | undefined }, options: { allowUnwrapped?: boolean }, run: (ctx: Ctx) => Promise<T>) => Promise<T | Fail>;
  aimContext: (l: LoadedModel, spec: ModelSpec, index: number, doc: SculptDocument, radius: number) => AimContext;
  aimCamera: (l: LoadedModel, spec: ModelSpec) => (view: AimView, size: number) => PreviewCamera | null;
  defaultRadius: (doc: SculptDocument, toWorld: number[]) => number;
  thumbnail: (spec: ModelSpec, view: AimView | undefined, size: number | undefined) => Promise<McpContentBlock[]>;
  readMesh: (l: LoadedModel, part: ModelSculptPart) => Promise<{ bytes: Uint8Array; mesh: MeshBin }>;
  okNoWrite: (l: LoadedModel, spec: ModelSpec, extra: Partial<EditOk>) => EditOk;
  findSculptPart: (spec: ModelSpec, ref?: string) => { ok: true; index: number; part: ModelSculptPart } | { ok: false; error: string };
};

const fail = (path: string, message: string): Fail => ({ ok: false, errors: [{ path, message }] });
const text = (value: string): McpContentBlock => ({ type: 'text', text: value });
const NOT_UNWRAPPED = (part: ModelSculptPart): string => `"${part.name}" has no UV layout, so it cannot hold textures — call model_unwrap on it first (after model_decimate or model_retopo for a dense sculpt).`;

/** The channels a layer touches, for summaries. */
function layerChannels(layer: PbrLayer): string[] {
  if (layer.kind === 'fill') return Object.keys(layer.fill ?? {}).filter((k) => k !== 'noise');
  return Object.keys(layer.maps ?? {}).filter((k) => k !== 'mask');
}

export function layerSummary(layer: PbrLayer) {
  return {
    id: layer.id,
    name: layer.name,
    kind: layer.kind,
    ...(layer.hidden ? { hidden: true } : {}),
    opacity: layer.opacity ?? 1,
    blend: layer.blend ?? 'normal',
    channels: layerChannels(layer),
    ...(layer.mask ? { mask: `${layer.mask.invert ? 'inverted ' : ''}${layer.mask.source}` } : {}),
  };
}

const IMAGE_CACHE_LIMIT = 48;

export function createPaintTools(env: MeshToolEnv, helpers: PaintHelpers) {
  const { deps } = env;
  const images = new Map<string, PaintImage>();
  const surfaces = new Map<string, PaintSurface>();

  const cacheImage = (hash: string, image: PaintImage): void => {
    images.delete(hash);
    images.set(hash, image);
    while (images.size > IMAGE_CACHE_LIMIT) images.delete(images.keys().next().value!);
  };

  async function readImage(l: LoadedModel, file: ModelMapFile): Promise<PaintImage> {
    const hit = images.get(file.hash);
    if (hit) return hit;
    const read = await deps.readBytes({ ...l.scope, path: modelAssetPath(designDir(l.stem), file.src) });
    if (!read.ok) throw new McpToolError('error', `The texture "${file.src}" is missing from the model's folder.`);
    const bytes = new Uint8Array(read.value.buffer, read.value.byteOffset, read.value.byteLength);
    if (modelAssetHash(bytes) !== file.hash) throw new McpToolError('error', `The texture "${file.src}" has changed since the design recorded it.`);
    const decoded = decodePng(bytes);
    if (!decoded.ok) throw new McpToolError('error', `The texture "${file.src}" could not be read: ${decoded.message}`);
    const { width, height, channels, bitDepth, data } = decoded.image;
    if (bitDepth !== 8 || width !== height) throw new McpToolError('error', `The texture "${file.src}" must be a square 8-bit PNG.`);
    const image = channels === 4 ? { width, height, data: data as Uint8Array } : resizeTo(width, height, data as Uint8Array, channels);
    cacheImage(file.hash, image);
    return image;
  }

  async function surfaceFor(l: LoadedModel, part: ModelSculptPart): Promise<PaintSurface> {
    const hit = surfaces.get(part.hash);
    if (hit) return hit;
    const { mesh } = await helpers.readMesh(l, part);
    if (!mesh.uvs) throw new McpToolError('error', NOT_UNWRAPPED(part));
    const surface = new PaintSurface({ positions: mesh.positions, indices: mesh.indices, uvs: mesh.uvs, normals: mesh.normals });
    surfaces.clear();
    surfaces.set(part.hash, surface);
    return surface;
  }

  async function bakesOf(l: LoadedModel, part: ModelSculptPart): Promise<PbrBakes> {
    const out: PbrBakes = {};
    for (const kind of ['normal', 'ao', 'curvature', 'cavity'] as const) {
      const file = part.maps?.[kind];
      if (file) out[kind] = await readImage(l, file);
    }
    return out;
  }

  async function writePng(l: LoadedModel, src: (hash8: string) => string, image: PaintImage): Promise<ModelMapFile> {
    const png = encodePngRgba8(image.data, image.width, image.height);
    const data = new Uint8Array(png.buffer, png.byteOffset, png.byteLength);
    const hash = modelAssetHash(data);
    const name = src(hash.slice(0, 8));
    if (!deps.writeFile) throw new McpToolError('error', 'Writing textures is not available here.');
    const wrote = await deps.writeFile({ ...l.scope, path: modelAssetPath(designDir(l.stem), name), data: png });
    if (!wrote.ok) throw new McpToolError('error', wrote.kind === 'error' ? wrote.message : `Could not write ${name}.`);
    registerModelTexture(hash, { mime: 'image/png', data });
    cacheImage(hash, image);
    return { src: name, hash };
  }

  /**
   * Writes the changed layer images, re-flattens the outputs they (or a stack change) affect, and lands the design.
   */
  async function commit(
    ctx: Ctx,
    next: ModelSculptPart,
    change: { images?: Map<string, PaintImage>; outputs: Set<PbrOutput> | 'all'; op: 'material' | 'paint'; data: Record<string, unknown>; summary: Record<string, number | string | boolean> },
  ): Promise<{ result: EditOk; spec: ModelSpec }> {
    const { l, sidecar, spec, index } = ctx;
    const base = l.stem.split('/').pop()!;
    const files: string[] = [];
    const pbr: ModelPbr = structuredClone(next.pbr ?? emptyPbr());
    for (const [key, image] of change.images ?? []) {
      const [layerId, target] = key.split(':') as [string, PaintTarget];
      const layer = pbr.layers.find((x) => x.id === layerId);
      if (!layer) continue;
      const file = await writePng(l, (h) => `${base}.${next.id}.${layerId}-${target}.${h}.png`, image);
      layer.maps = { ...(layer.maps ?? {}), [target]: file };
      files.push(file.src);
    }

    const surface = await surfaceFor(l, next);
    const layerImages = new Map<string, PaintImage>();
    for (const layer of pbr.layers) {
      for (const [target, file] of Object.entries(layer.maps ?? {})) {
        if (file) layerImages.set(`${layer.id}:${target}`, change.images?.get(`${layer.id}:${target}`) ?? (await readImage(l, file)));
      }
    }
    const material = resolveMaterial(next.material);
    const input: FlattenInput = {
      sizes: pbrSizes(pbr, next.uv?.textureSize),
      base: { color: next.color, roughness: material.roughness, metalness: material.metalness, emissive: material.emissive, emissiveIntensity: material.emissiveIntensity },
      bakes: await bakesOf(l, next),
      layers: pbr.layers,
      image: (id, target) => layerImages.get(`${id}:${target}`),
      surface,
    };
    const outputs = change.outputs === 'all' || !pbr.flattened ? new Set<PbrOutput>(PBR_OUTPUTS) : change.outputs;
    const flat = flattenPbr(input, outputs);
    const flattened: NonNullable<ModelPbr['flattened']> = { ...(pbr.flattened ?? {}) };
    for (const output of outputs) {
      const image = flat[output];
      if (!image) {
        delete flattened[output];
        continue;
      }
      const file = await writePng(l, (h) => `${base}.${next.id}.pbr-${output}.${h}.png`, image);
      flattened[output] = file;
      files.push(file.src);
    }
    pbr.flattened = flattened;
    const landedPart: ModelSculptPart = { ...next, pbr };
    const landed: ModelSpec = { ...spec, parts: spec.parts.map((p, i) => (i === index ? landedPart : p)) };
    const written = await env.writeEdit(l, sidecar, landed, { keepCameras: true });
    await deps.writeMesh({ op: 'appendOps', repoId: l.repoId, project: l.project, dir: designDir(l.stem), src: next.src, ops: [{ kind: change.op, at: env.now().toISOString(), by: 'agent', data: change.data }] });
    return { result: { ...written, material: { part: next.id ?? next.name, layers: pbr.layers.map(layerSummary), files, summary: change.summary } }, spec: landed };
  }

  /** The prologue every material tool shares: lock, find the sculpt part, refuse one without UVs. */
  const withPart = <T>(input: { repoPath: string; project: string; model: string; part?: string | undefined }, run: (ctx: Ctx) => Promise<T>) =>
    helpers.withSculpt(input, { allowUnwrapped: true }, async (ctx) => (ctx.part.uv ? run(ctx) : fail('part', NOT_UNWRAPPED(ctx.part))));

  async function modelLayerList(input: McpToolInput<'model_layer_list'>): Promise<McpToolOutput<'model_layer_list'>> {
    const l = await env.load(input);
    const spec = env.need(l, input).spec;
    const found = helpers.findSculptPart(spec, input.part);
    if (!found.ok) throw new McpToolError('not-found', found.error);
    const { part } = found;
    const material = resolveMaterial(part.material);
    return {
      part: part.id ?? part.name,
      unwrapped: !!part.uv,
      ...(part.pbr?.preset ? { preset: part.pbr.preset } : {}),
      base: { color: part.color, roughness: material.roughness, metalness: material.metalness, emissive: material.emissive },
      sizes: pbrSizes(part.pbr, part.uv?.textureSize),
      layers: (part.pbr?.layers ?? []).map(layerSummary),
      bakes: Object.keys(part.maps ?? {}),
      flattened: Object.fromEntries(Object.entries(part.pbr?.flattened ?? {}).map(([k, f]) => [k, f!.src])),
    };
  }

  async function modelMaterialSet(input: McpToolInput<'model_material_set'>): Promise<McpToolOutput<'model_material_set'>> {
    return (await withPart(input, async (ctx) => {
      let part = ctx.part;
      if (input.clear) {
        const { pbr: _pbr, ...rest } = part;
        const landed = { ...ctx.spec, parts: ctx.spec.parts.map((p, i) => (i === ctx.index ? (rest as ModelSculptPart) : p)) };
        const written = await env.writeEdit(ctx.l, ctx.sidecar, landed, { keepCameras: true });
        return { ...written, material: { part: part.id ?? part.name, layers: [], files: [], summary: { cleared: true } } };
      }
      if (input.preset) part = applyPbrPreset(part, input.preset, { keepPaint: input.keepPaint ?? false });
      if (input.color) part = { ...part, color: input.color };
      const material = { ...(part.material ?? {}) };
      if (input.roughness !== undefined) material.roughness = input.roughness;
      if (input.metalness !== undefined) material.metalness = input.metalness;
      if (input.emissive !== undefined) material.emissive = input.emissive;
      if (input.emissiveIntensity !== undefined) material.emissiveIntensity = input.emissiveIntensity;
      part = { ...part, material };
      const pbr = part.pbr ?? emptyPbr();
      if (input.size !== undefined || input.sizes) {
        const sizes = { ...(pbr.sizes ?? {}) };
        if (input.size !== undefined) for (const c of PBR_CHANNELS) sizes[c] = input.size;
        for (const [c, v] of Object.entries(input.sizes ?? {})) if (v !== undefined) sizes[c as keyof typeof sizes] = v;
        part = { ...part, pbr: { ...pbr, sizes } };
      } else part = { ...part, pbr };
      return (
        await commit(ctx, part, {
          outputs: 'all',
          op: 'material',
          data: { preset: input.preset ?? null, color: part.color },
          summary: { ...(input.preset ? { preset: input.preset } : {}), layers: part.pbr!.layers.length },
        })
      ).result;
    })) as McpToolOutput<'model_material_set'>;
  }

  async function modelLayerAdd(input: McpToolInput<'model_layer_add'>): Promise<McpToolOutput<'model_layer_add'>> {
    return (await withPart(input, async (ctx) => {
      const added = addPbrLayer(ctx.part.pbr, {
        kind: input.kind,
        ...(input.name ? { name: input.name } : {}),
        ...(input.fill ? { fill: input.fill } : {}),
        ...(input.mask ? { mask: input.mask } : {}),
        ...(input.blend ? { blend: input.blend } : {}),
        ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
      }, input.index);
      if (!added.ok) return fail('layer', added.error);
      const missingBake = input.mask && input.mask.source !== 'painted' && !ctx.part.maps?.[input.mask.source];
      const { result } = await commit(ctx, { ...ctx.part, pbr: added.value.pbr }, { outputs: 'all', op: 'material', data: { add: added.value.layer.id }, summary: { added: added.value.layer.id } });
      return missingBake
        ? { ...result, warnings: [...(result.warnings ?? []), { path: 'mask.source', message: `The part has no ${input.mask!.source} bake yet, so this layer is hidden until model_bake makes one.` }] }
        : result;
    })) as McpToolOutput<'model_layer_add'>;
  }

  async function modelLayerUpdate(input: McpToolInput<'model_layer_update'>): Promise<McpToolOutput<'model_layer_update'>> {
    return (await withPart(input, async (ctx) => {
      const patch: LayerPatch = {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.hidden !== undefined ? { hidden: input.hidden } : {}),
        ...(input.opacity !== undefined ? { opacity: input.opacity } : {}),
        ...(input.blend !== undefined ? { blend: input.blend } : {}),
        ...(input.fill !== undefined ? { fill: input.fill as LayerPatch['fill'] } : {}),
        ...(input.mask !== undefined ? { mask: input.mask } : {}),
        ...(input.index !== undefined ? { index: input.index } : {}),
      };
      const updated = updatePbrLayer(ctx.part.pbr, input.layer, patch);
      if (!updated.ok) return fail('layer', updated.error);
      return (await commit(ctx, { ...ctx.part, pbr: updated.value }, { outputs: 'all', op: 'material', data: { update: input.layer }, summary: { updated: input.layer } })).result;
    })) as McpToolOutput<'model_layer_update'>;
  }

  async function modelLayerRemove(input: McpToolInput<'model_layer_remove'>): Promise<McpToolOutput<'model_layer_remove'>> {
    return (await withPart(input, async (ctx) => {
      const removed = removePbrLayer(ctx.part.pbr, input.layer);
      if (!removed.ok) return fail('layer', removed.error);
      return (await commit(ctx, { ...ctx.part, pbr: removed.value.pbr }, { outputs: 'all', op: 'material', data: { remove: removed.value.layer.id }, summary: { removed: removed.value.layer.id } })).result;
    })) as McpToolOutput<'model_layer_remove'>;
  }

  async function modelPaintStroke(input: McpToolInput<'model_paint_stroke'>): Promise<McpToolOutput<'model_paint_stroke'>> {
    const out = await withPart(input, async (ctx) => {
      const { l, spec, index, session } = ctx;
      let part = ctx.part;
      const channel: PaintTarget = input.channel ?? 'albedo';

      // The layer: named, else the top paint layer, else a new one.
      let pbr = part.pbr ?? emptyPbr();
      let layerAt: number;
      if (input.layer !== undefined) {
        layerAt = findPbrLayer(pbr, input.layer);
        if (layerAt < 0) return fail('layer', `No layer has id "${input.layer}" or a unique name "${input.layer}". Layers: ${pbr.layers.map((x) => x.id).join(', ') || '(none)'}.`);
        if (pbr.layers[layerAt]!.kind !== 'paint' && channel !== 'mask') return fail('layer', `"${input.layer}" is a fill layer — paint on a paint layer (model_layer_add with kind "paint"), or paint its mask with channel "mask".`);
      } else {
        layerAt = pbr.layers.map((x) => x.kind).lastIndexOf('paint');
        if (layerAt < 0) {
          const added = addPbrLayer(pbr, { kind: 'paint', name: 'Paint' });
          if (!added.ok) return fail('layer', added.error);
          pbr = added.value.pbr;
          layerAt = pbr.layers.length - 1;
        }
      }
      let layer = pbr.layers[layerAt]!;
      if (channel === 'mask' && layer.mask?.source !== 'painted') {
        // Painting a mask gives the layer a painted one.
        layer = { ...layer, mask: { source: 'painted' } };
        pbr = { ...pbr, layers: pbr.layers.map((x, i) => (i === layerAt ? layer : x)) };
      }
      part = { ...part, pbr };

      // What to lay down.
      let color: [number, number, number];
      if (channel === 'albedo' || channel === 'emissive') color = hexToUnit(input.color ?? '#ffffff');
      else if (channel === 'normal') {
        const n = input.normal ?? [0, 0, 1];
        const len = Math.hypot(n[0], n[1], n[2]) || 1;
        color = [n[0] / len / 2 + 0.5, n[1] / len / 2 + 0.5, n[2] / len / 2 + 0.5];
      } else {
        const v = input.value ?? 1;
        color = [v, v, v];
      }

      // Where: the same aiming as a sculpt stroke, on the same mesh.
      const toWorld = worldMatrices(spec.parts)[index]!;
      const scale = uniformScale(toWorld) || 1;
      let radius = input.radius !== undefined ? input.radius / scale : helpers.defaultRadius(session.doc, toWorld);
      if (input.target.mode === 'screen' && input.target.radiusPixels !== undefined) {
        const camera = helpers.aimCamera(l, spec)(input.target.view, input.target.size ?? 384);
        if (camera) radius = input.target.radiusPixels / camera.scale / scale;
      }
      const planned = resolveTarget(helpers.aimContext(l, spec, index, session.doc, radius), input.target);
      if (!planned.ok) return { ok: false as const, errors: planned.errors };

      const sizes = pbrSizes(pbr, part.uv?.textureSize);
      const size = channel === 'mask' ? sizes.albedo : sizes[channel];
      const existing = layer.maps?.[channel];
      const image = existing ? resizePaintImage(await readImage(l, existing), size) : createPaintImage(size);
      const target = existing && image === images.get(existing.hash) ? { width: image.width, height: image.height, data: image.data.slice() } : image;
      let stamp: PaintImage | undefined;
      if (input.brush === 'stamp') {
        if (typeof input.stamp === 'object') {
          const read = await deps.readBytes({ ...l.scope, path: modelAssetPath(designDir(l.stem), input.stamp.image) });
          if (!read.ok) return fail('stamp.image', `"${input.stamp.image}" is not in the model's folder.`);
          const decoded = decodePng(new Uint8Array(read.value.buffer, read.value.byteOffset, read.value.byteLength));
          if (!decoded.ok || decoded.image.bitDepth !== 8) return fail('stamp.image', `"${input.stamp.image}" is not an 8-bit PNG.`);
          const d = decoded.image;
          stamp = d.channels === 4 ? { width: d.width, height: d.height, data: d.data as Uint8Array } : resizeTo(d.width, d.height, d.data as Uint8Array, d.channels);
        } else stamp = stampPattern(input.stamp ?? 'dots', 128);
      }
      const surface = await surfaceFor(l, part);
      const stroke = new PaintStroke(surface, target, {
        brush: input.brush,
        radius,
        strength: input.strength ?? 1,
        falloff: input.falloff ?? 'smooth',
        spacing: input.spacing ?? 0.15,
        ...((input.frontFacesOnly ?? input.target.mode === 'screen') ? { frontFacesOnly: true } : {}),
        color,
        ...(input.cloneOffset ? { cloneOffset: input.cloneOffset.map((v) => v / scale) as [number, number, number] } : {}),
        ...(stamp ? { stamp } : {}),
        ...(input.stampAngle !== undefined ? { stampAngle: input.stampAngle } : {}),
      });
      for (const step of planned.plan.steps) {
        if (step.breakBefore) stroke.break();
        if (step.kind === 'ray') {
          const hit = surface.raycast(step.origin, step.dir);
          if (hit) stroke.to(hit.point, step.dir);
        } else stroke.to(step.point, step.view);
      }
      const summary = { brush: input.brush, layer: layer.id, channel, aim: planned.plan.note, dabs: stroke.dabs, texels: stroke.texels };
      if (stroke.texels === 0) {
        const result = helpers.okNoWrite(l, spec, { material: { part: part.id ?? part.name, layers: (ctx.part.pbr?.layers ?? []).map(layerSummary), files: [], summary: { ...summary, note: 'the stroke painted nothing — out of reach, facing away, or a zero-strength brush' } } });
        return { [MCP_CONTENT_KEY]: [text(JSON.stringify(result))] };
      }
      const { result, spec: landed } = await commit(ctx, part, {
        images: new Map([[`${layer.id}:${channel}`, target]]),
        outputs: outputsFor([channel]),
        op: 'paint',
        data: { brush: input.brush, layer: layer.id, channel, target: input.target.mode, radius: Number(radius.toFixed(5)), dabs: stroke.dabs, texels: stroke.texels },
        summary,
      });
      const view = input.preview === false ? undefined : (input.preview?.view ?? (input.target.mode === 'screen' ? input.target.view : 'front'));
      const shot = input.preview === false ? [] : await helpers.thumbnail(landed, view, input.preview?.size);
      return { [MCP_CONTENT_KEY]: [text(JSON.stringify(result)), ...shot] };
    });
    return out as McpToolOutput<'model_paint_stroke'>;
  }

  return {
    model_layer_list: modelLayerList,
    model_material_set: modelMaterialSet,
    model_layer_add: modelLayerAdd,
    model_layer_update: modelLayerUpdate,
    model_layer_remove: modelLayerRemove,
    model_paint_stroke: modelPaintStroke,
  };
}

/** A grey or RGB image as RGBA (any aspect; the stamp sampler stretches it over the dab). */
function resizeTo(width: number, height: number, data: Uint8Array, channels: number): PaintImage {
  const out = { width, height, data: new Uint8Array(width * height * 4) };
  for (let i = 0; i < width * height; i += 1) {
    const r = data[i * channels]!;
    out.data[i * 4] = r;
    out.data[i * 4 + 1] = channels >= 3 ? data[i * channels + 1]! : r;
    out.data[i * 4 + 2] = channels >= 3 ? data[i * channels + 2]! : r;
    out.data[i * 4 + 3] = channels === 2 || channels === 4 ? data[i * channels + channels - 1]! : 255;
  }
  return out;
}
