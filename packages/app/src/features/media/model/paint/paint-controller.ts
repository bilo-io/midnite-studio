import {
  addPbrLayer,
  channelInUse,
  createPaintImage,
  decodeMeshBin,
  emptyPbr,
  flattenChannel,
  hexToUnit,
  modelAssetHash,
  ormSize,
  packOrmInto,
  PaintHistory,
  PaintStroke,
  PaintSurface,
  PBR_CHANNELS,
  pbrSizes,
  registerModelTexture,
  resizePaintImage,
  resolveMaterial,
  stampPattern,
  unionRect,
  type DirtyRect,
  type FlattenInput,
  type GitOpResult,
  type ModelMapFile,
  type ModelMeshResult,
  type ModelPbr,
  type ModelSculptPart,
  type ModelSpec,
  type PaintBrushKind,
  type PaintImage,
  type PaintTarget,
  type PbrBakes,
  type PbrChannel,
  type SculptFalloff,
  type StampPattern,
  type UvRect,
} from '@midnite/studio-shared';
import { BufferAttribute, BufferGeometry, DataTexture, LinearMipmapLinearFilter, LinearFilter, NoColorSpace, RGBAFormat, SRGBColorSpace, UnsignedByteType } from 'three';

import type { EditorAction } from '../editor-state';
import { decodePng, encodePng } from './png';

/**
 * Paint mode's brain (Phase 104 Theme G), outside React so it is unit-tested with a fake IO.
 *
 * It opens an unwrapped `sculpt` part: the mesh (for the brush's BVH and the display geometry), every paint
 * layer's channel images, and the part's Theme F bakes (for the masks). It keeps one flattened image per channel
 * plus the packed ORM image, and the viewport draws them as `DataTexture`s on a `MeshStandardMaterial` — so what
 * is on screen is exactly what will be exported.
 *
 * **A stroke** paints one layer image (the active layer, the chosen channel). Every dab saves the tiles it is
 * about to touch (per-stroke undo) and re-flattens only the rectangle it changed, so a dab on a 2K map costs a
 * small patch, not a 16 MB recomposite. Strokes stay in memory until {@link PaintController.flush}.
 *
 * **The layer stack** lives in the design (`part.pbr`), edited through the reducer like any other part field,
 * so adding, reordering or retuning a layer is an ordinary undo step; {@link PaintController.sync} notices the
 * change and re-flattens. Painted pixels have their own history here ({@link PaintController.undo}), as sculpt
 * strokes live in the worker.
 *
 * **Saving** encodes each painted layer image and the flattened set as content-named PNGs beside the design,
 * repoints the part at them without a history step (`paintFlushed`), and registers them so the ordinary scene
 * draws the painted part once paint mode closes.
 */
export type PaintIO = {
  stem: string;
  readMesh: (src: string) => Promise<GitOpResult<ModelMeshResult>>;
  /** A file of the model's folder (a layer image, a bake), or `null` when it cannot be read. */
  readFile: (src: string) => Promise<Uint8Array | null>;
  writeTexture: (src: string, data: Uint8Array) => Promise<GitOpResult<ModelMeshResult>>;
};

export type PaintSettings = {
  brush: PaintBrushKind;
  channel: PaintTarget;
  /** Colour for albedo and emissive; for the normal channel, an encoded normal (`#8080ff` is flat). */
  color: string;
  /** Value for roughness, metalness, ao and the mask. */
  value: number;
  radiusUnit: 'screen' | 'world';
  screenRadius: number;
  worldRadius: number;
  strength: number;
  falloff: SculptFalloff;
  spacing: number;
  frontFacesOnly: boolean;
  pressure: boolean;
  stamp: StampPattern;
  stampAngle: number;
};

export const DEFAULT_PAINT_SETTINGS: PaintSettings = {
  brush: 'brush',
  channel: 'albedo',
  color: '#c0392b',
  value: 1,
  radiusUnit: 'screen',
  screenRadius: 24,
  worldRadius: 0.05,
  strength: 0.8,
  falloff: 'smooth',
  spacing: 0.15,
  frontFacesOnly: true,
  pressure: true,
  stamp: 'dots',
  stampAngle: 0,
};

export type PaintTextures = { baseColor: DataTexture; orm: DataTexture; normal: DataTexture; emissive: DataTexture };
type V3 = [number, number, number];

export type PaintSnapshot = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  partId: string | null;
  /** The layer strokes paint (a paint layer, or any layer while painting its mask). */
  layerId: string | null;
  settings: PaintSettings;
  undo: number;
  redo: number;
  /** Painted, or the stack changed, since the last flush. */
  unsaved: boolean;
  /** Bumps whenever a texture changed — a redraw cue. */
  epoch: number;
  geometry: BufferGeometry | null;
  textures: PaintTextures | null;
  hover: { point: V3; normal: V3 } | null;
  /** Clone source (mesh space), set with Alt-click. */
  cloneSource: V3 | null;
  busy: string | null;
  /** Whether the flattened normal and emissive maps carry anything. */
  uses: { normal: boolean; emissive: boolean };
};

const INITIAL: PaintSnapshot = {
  status: 'idle',
  error: null,
  partId: null,
  layerId: null,
  settings: DEFAULT_PAINT_SETTINGS,
  undo: 0,
  redo: 0,
  unsaved: false,
  epoch: 0,
  geometry: null,
  textures: null,
  hover: null,
  cloneSource: null,
  busy: null,
  uses: { normal: false, emissive: false },
};

const keyOf = (layerId: string, target: PaintTarget): string => `${layerId}:${target}`;
const toUv = (rect: DirtyRect, size: number): UvRect => ({ u0: rect.x0 / size, v0: rect.y0 / size, u1: (rect.x1 + 1) / size, v1: (rect.y1 + 1) / size });

/** What a stack change must re-flatten: everything but the layer files (painted pixels are in memory). */
function stackKey(part: ModelSculptPart): string {
  const material = resolveMaterial(part.material);
  const layers = (part.pbr?.layers ?? []).map(({ maps: _maps, ...rest }) => rest);
  return JSON.stringify({ layers, color: part.color, material, sizes: part.pbr?.sizes ?? null, uv: part.uv?.textureSize ?? null, maps: part.maps ?? null });
}

const findPart = (spec: ModelSpec, id: string | null): { part: ModelSculptPart; index: number } | null => {
  if (!id) return null;
  const index = spec.parts.findIndex((p) => p.id === id);
  const part = spec.parts[index];
  return part && part.shape === 'sculpt' ? { part, index } : null;
};

export class PaintController {
  private snapshot: PaintSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private part: { id: string; hash: string } | null = null;
  private surface: PaintSurface | null = null;
  private pbr: ModelPbr = emptyPbr();
  private base: FlattenInput['base'] = { color: '#b0b0b0', roughness: 0.6, metalness: 0, emissive: '#000000', emissiveIntensity: 1 };
  private sizes: Record<PbrChannel, number> = pbrSizes(undefined);
  private bakes: PbrBakes = {};
  /** Layer channel images by `layer:channel`. */
  private readonly images = new Map<string, PaintImage>();
  /** The file hash each loaded image came from. */
  private readonly loaded = new Map<string, string>();
  /** Images painted since the last flush. */
  private readonly dirty = new Set<string>();
  private flat: Record<PbrChannel, PaintImage> | null = null;
  private orm: PaintImage | null = null;
  private history = new PaintHistory();
  private lastKey = '';
  private savedKey = '';
  private stroke: { stroke: PaintStroke; key: string; image: PaintImage; pending: DirtyRect | null } | null = null;
  pointerX = 0;

  constructor(
    private readonly io: PaintIO,
    private readonly dispatch: (action: EditorAction) => void,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = (): PaintSnapshot => this.snapshot;

  private set(patch: Partial<PaintSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  get active(): boolean {
    return this.snapshot.status !== 'idle';
  }

  setSettings(patch: Partial<PaintSettings>): void {
    this.set({ settings: { ...this.snapshot.settings, ...patch } });
  }

  setLayer(layerId: string | null): void {
    this.set({ layerId });
  }

  private async image(file: ModelMapFile): Promise<PaintImage> {
    const bytes = await this.io.readFile(file.src);
    if (!bytes) throw new Error(`The texture "${file.src}" could not be read.`);
    if (modelAssetHash(bytes) !== file.hash) throw new Error(`The texture "${file.src}" changed since the design was saved.`);
    registerModelTexture(file.hash, { mime: 'image/png', data: bytes });
    return decodePng(bytes);
  }

  /** Opens the unwrapped sculpt part at `index` for painting. */
  async enter(spec: ModelSpec, index: number): Promise<boolean> {
    const part = spec.parts[index];
    if (!part || part.shape !== 'sculpt' || !part.id) {
      this.set({ status: 'error', error: 'Pick a sculpt part to paint.' });
      return false;
    }
    if (!part.uv) {
      this.set({ status: 'error', error: `"${part.name}" has no UV layout yet — unwrap it first (model_unwrap), after decimating a dense sculpt.` });
      return false;
    }
    if (this.active) await this.dispose();
    this.set({ ...INITIAL, settings: this.snapshot.settings, status: 'loading', partId: part.id });
    try {
      const read = await this.io.readMesh(part.src);
      if (!read.ok || !read.value.data) throw new Error(read.ok ? 'The mesh file is empty.' : read.kind === 'error' ? read.message : 'The mesh could not be read.');
      const bytes = read.value.data instanceof Uint8Array ? read.value.data : new Uint8Array(read.value.data);
      const mesh = decodeMeshBin(bytes);
      if (!mesh.uvs) throw new Error('The mesh file has no UVs — unwrap it again.');
      this.surface = new PaintSurface({ positions: mesh.positions, indices: mesh.indices, uvs: mesh.uvs, normals: mesh.normals });
      this.part = { id: part.id, hash: part.hash };
      this.images.clear();
      this.loaded.clear();
      this.dirty.clear();
      this.history = new PaintHistory();
      this.bakes = {};
      for (const kind of ['normal', 'ao', 'curvature', 'cavity'] as const) {
        const file = part.maps?.[kind];
        if (file) this.bakes[kind] = await this.image(file);
      }
      await this.loadLayers(part);
      this.adoptStack(part);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(this.surface.positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(this.surface.normals, 3));
      geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
      geometry.setIndex(new BufferAttribute(this.surface.indices, 1));
      geometry.computeBoundingSphere();
      this.flattenAll();
      this.savedKey = this.lastKey;
      const top = this.pbr.layers.map((l) => l.kind).lastIndexOf('paint');
      this.set({ status: 'ready', error: null, geometry, textures: this.makeTextures(), layerId: top >= 0 ? this.pbr.layers[top]!.id : null, unsaved: false, undo: 0, redo: 0 });
      return true;
    } catch (error) {
      this.surface = null;
      this.part = null;
      this.set({ status: 'error', error: error instanceof Error ? error.message : String(error), partId: null });
      return false;
    }
  }

  /** Loads (or reloads) every layer image the stack names that this session does not hold at that hash. */
  private async loadLayers(part: ModelSculptPart): Promise<boolean> {
    let changed = false;
    for (const layer of part.pbr?.layers ?? []) {
      for (const [target, file] of Object.entries(layer.maps ?? {})) {
        if (!file) continue;
        const key = keyOf(layer.id, target as PaintTarget);
        if (this.loaded.get(key) === file.hash || this.dirty.has(key)) continue;
        this.images.set(key, await this.image(file));
        this.loaded.set(key, file.hash);
        changed = true;
      }
    }
    return changed;
  }

  private adoptStack(part: ModelSculptPart): void {
    const material = resolveMaterial(part.material);
    this.pbr = part.pbr ?? emptyPbr();
    this.base = { color: part.color, roughness: material.roughness, metalness: material.metalness, emissive: material.emissive, emissiveIntensity: material.emissiveIntensity };
    this.sizes = pbrSizes(this.pbr, part.uv?.textureSize);
    this.lastKey = stackKey(part);
  }

  private input(): FlattenInput {
    return {
      sizes: this.sizes,
      base: this.base,
      bakes: this.bakes,
      layers: this.pbr.layers,
      image: (id, target) => this.images.get(keyOf(id, target)),
      surface: this.surface,
    };
  }

  /** Recomposes every channel (a stack change, an undo, a load). */
  private flattenAll(): void {
    const input = this.input();
    const flat = {} as Record<PbrChannel, PaintImage>;
    for (const channel of PBR_CHANNELS) {
      const existing = this.flat?.[channel];
      flat[channel] = flattenChannel(input, channel, existing && existing.width === this.sizes[channel] ? existing : undefined);
    }
    const size = ormSize(this.sizes);
    this.orm = packOrmInto(this.orm && this.orm.width === size ? this.orm : createPaintImage(size), flat.ao, flat.roughness, flat.metalness);
    const resized = !this.flat || PBR_CHANNELS.some((c) => this.flat![c] !== flat[c]);
    this.flat = flat;
    if (resized && this.snapshot.textures) {
      for (const t of Object.values(this.snapshot.textures)) t.dispose();
      this.set({ textures: this.makeTextures() });
    } else this.touchTextures();
  }

  /** Recomposes `rect` (texels of a `size` image) of the outputs a `target` feeds. */
  private flattenRect(target: PaintTarget, rect: DirtyRect, size: number): void {
    if (!this.flat || !this.orm) return;
    const uv = toUv(rect, size);
    const input = this.input();
    const channels = target === 'mask' ? PBR_CHANNELS : [target];
    for (const channel of channels) flattenChannel(input, channel, this.flat[channel], uv);
    if (channels.some((c) => c === 'ao' || c === 'roughness' || c === 'metalness')) packOrmInto(this.orm, this.flat.ao, this.flat.roughness, this.flat.metalness, uv);
    this.touchTextures();
  }

  private makeTextures(): PaintTextures | null {
    if (!this.flat || !this.orm) return null;
    const texture = (image: PaintImage, srgb: boolean): DataTexture => {
      const t = new DataTexture(image.data, image.width, image.height, RGBAFormat, UnsignedByteType);
      t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      t.flipY = false;
      t.generateMipmaps = true;
      t.minFilter = LinearMipmapLinearFilter;
      t.magFilter = LinearFilter;
      t.needsUpdate = true;
      return t;
    };
    return { baseColor: texture(this.flat.albedo, true), orm: texture(this.orm, false), normal: texture(this.flat.normal, false), emissive: texture(this.flat.emissive, true) };
  }

  private touchTextures(): void {
    const textures = this.snapshot.textures;
    if (textures) for (const t of Object.values(textures)) t.needsUpdate = true;
    const input = this.input();
    this.set({ epoch: this.snapshot.epoch + 1, uses: { normal: channelInUse(input, 'normal'), emissive: channelInUse(input, 'emissive') } });
  }

  /** Brings the session to the part in `spec`: a stack change re-flattens, a new mesh reopens, a removed part closes. */
  async sync(spec: ModelSpec): Promise<void> {
    if (this.snapshot.status !== 'ready' || !this.part || this.stroke) return;
    const found = findPart(spec, this.part.id);
    if (!found || !found.part.uv) {
      await this.dispose();
      return;
    }
    if (found.part.hash !== this.part.hash) {
      await this.enter(spec, found.index);
      return;
    }
    const reloaded = await this.loadLayers(found.part);
    const key = stackKey(found.part);
    if (key === this.lastKey && !reloaded) {
      this.pbr = found.part.pbr ?? emptyPbr();
      return;
    }
    this.adoptStack(found.part);
    this.flattenAll();
    const layerGone = this.snapshot.layerId !== null && !this.pbr.layers.some((l) => l.id === this.snapshot.layerId);
    this.set({ unsaved: this.dirty.size > 0 || this.lastKey !== this.savedKey, ...(layerGone ? { layerId: null } : {}) });
  }

  /** The surface under a mesh-space ray. */
  pick(ray: { origin: V3; dir: V3 }): { point: V3; normal: V3 } | null {
    const hit = this.surface?.raycast(ray.origin, ray.dir);
    return hit ? { point: hit.point, normal: hit.normal } : null;
  }

  hover(ray: { origin: V3; dir: V3 } | null): void {
    this.set({ hover: ray ? this.pick(ray) : null });
  }

  setCloneSource(ray: { origin: V3; dir: V3 }): void {
    const hit = this.pick(ray);
    if (hit) this.set({ cloneSource: hit.point });
  }

  /** The layer a stroke should paint, making a paint layer when there is none (one reducer step). */
  private paintLayer(spec: ModelSpec): string | null {
    const s = this.snapshot.settings;
    const active = this.pbr.layers.find((l) => l.id === this.snapshot.layerId);
    if (active && (active.kind === 'paint' || s.channel === 'mask')) return active.id;
    const found = findPart(spec, this.part?.id ?? null);
    if (!found) return null;
    const added = addPbrLayer(this.pbr, { kind: 'paint', name: 'Paint' });
    if (!added.ok) {
      this.set({ error: added.error });
      return null;
    }
    this.pbr = added.value.pbr;
    this.dispatch({ type: 'patch', index: found.index, patch: { pbr: added.value.pbr } });
    this.lastKey = stackKey({ ...found.part, pbr: added.value.pbr });
    this.set({ layerId: added.value.layer.id });
    return added.value.layer.id;
  }

  /** Starts a stroke under a mesh-space ray; `radius` is in mesh units. */
  beginStroke(spec: ModelSpec, ray: { origin: V3; dir: V3; pressure?: number }, opts: { radius: number }): boolean {
    if (this.snapshot.status !== 'ready' || !this.surface || this.stroke) return false;
    const hit = this.pick(ray);
    if (!hit) return false;
    const layerId = this.paintLayer(spec);
    if (!layerId) return false;
    const s = this.snapshot.settings;
    if (s.channel === 'mask') {
      const layer = this.pbr.layers.find((l) => l.id === layerId)!;
      if (layer.mask?.source !== 'painted') {
        const found = findPart(spec, this.part!.id)!;
        const pbr = { ...this.pbr, layers: this.pbr.layers.map((l) => (l.id === layerId ? { ...l, mask: { source: 'painted' as const } } : l)) };
        this.pbr = pbr;
        this.dispatch({ type: 'patch', index: found.index, patch: { pbr } });
        this.lastKey = stackKey({ ...found.part, pbr });
      }
    }
    const size = s.channel === 'mask' ? this.sizes.albedo : this.sizes[s.channel];
    const key = keyOf(layerId, s.channel);
    let image = this.images.get(key);
    if (!image || image.width !== size) {
      image = image ? resizePaintImage(image, size) : createPaintImage(size);
      this.images.set(key, image);
    }
    const color: [number, number, number] =
      // Colour channels take the colour; the normal channel takes it as an encoded tangent-space normal (#8080ff is flat).
      s.channel === 'albedo' || s.channel === 'emissive' || s.channel === 'normal' ? hexToUnit(s.color) : [s.value, s.value, s.value];
    this.history.begin(s.brush);
    const target = image;
    const record = { stroke: null as unknown as PaintStroke, key, image: target, pending: null as DirtyRect | null };
    record.stroke = new PaintStroke(
      this.surface,
      target,
      {
        brush: s.brush,
        radius: Math.max(1e-6, opts.radius),
        strength: s.strength,
        falloff: s.falloff,
        spacing: s.spacing,
        ...(s.frontFacesOnly ? { frontFacesOnly: true } : {}),
        color,
        ...(s.brush === 'clone' && this.snapshot.cloneSource
          ? { cloneOffset: [this.snapshot.cloneSource[0] - hit.point[0], this.snapshot.cloneSource[1] - hit.point[1], this.snapshot.cloneSource[2] - hit.point[2]] as V3 }
          : {}),
        ...(s.brush === 'stamp' ? { stamp: stampPattern(s.stamp, 128), stampAngle: s.stampAngle } : {}),
      },
      (rect) => {
        this.history.touch(key, target, rect);
        record.pending = unionRect(record.pending, rect);
      },
    );
    this.stroke = record;
    this.strokeTo(hit.point, ray.dir, ray.pressure);
    return true;
  }

  private strokeTo(point: V3, dir: V3, pressure?: number): void {
    const record = this.stroke;
    if (!record) return;
    record.stroke.to(point, dir, this.snapshot.settings.pressure && pressure !== undefined ? pressure : 1);
    if (record.pending) {
      this.flattenRect(this.snapshot.settings.channel, record.pending, record.image.width);
      record.pending = null;
    }
    this.set({ hover: this.pick({ origin: [point[0] - dir[0], point[1] - dir[1], point[2] - dir[2]], dir }) });
  }

  moveStroke(ray: { origin: V3; dir: V3; pressure?: number }): void {
    if (!this.stroke) return;
    const hit = this.pick(ray);
    if (!hit) {
      this.stroke.stroke.break();
      return;
    }
    this.strokeTo(hit.point, ray.dir, ray.pressure);
  }

  endStroke(): void {
    const record = this.stroke;
    this.stroke = null;
    if (!record) return;
    if (this.history.commit()) {
      this.dirty.add(record.key);
      this.set({ unsaved: true, ...this.historyDepth() });
    }
  }

  private historyDepth(): { undo: number; redo: number } {
    return this.history.depth;
  }

  undo(): void {
    const keys = this.history.undo((key) => this.images.get(key));
    if (!keys) return;
    for (const key of keys) this.dirty.add(key);
    this.flattenAll();
    this.set({ unsaved: true, ...this.historyDepth() });
  }

  redo(): void {
    const keys = this.history.redo((key) => this.images.get(key));
    if (!keys) return;
    for (const key of keys) this.dirty.add(key);
    this.flattenAll();
    this.set({ unsaved: true, ...this.historyDepth() });
  }

  private async write(name: (hash8: string) => string, image: PaintImage): Promise<ModelMapFile> {
    const png = encodePng(image);
    const hash = modelAssetHash(png);
    const src = name(hash.slice(0, 8));
    const wrote = await this.io.writeTexture(src, png);
    if (!wrote.ok) throw new Error(wrote.kind === 'error' ? wrote.message : `Could not save ${src}.`);
    registerModelTexture(hash, { mime: 'image/png', data: png });
    return { src, hash };
  }

  /**
   * Writes painted layer images and the flattened set, and repoints the part at them (no history step). Answers
   * the spec a save should write; unchanged when nothing was painted and the stack is as last written.
   */
  async flush(spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
    if (this.snapshot.status !== 'ready' || !this.part || !this.flat || !this.orm) return { ok: true, spec };
    if (this.stroke) this.endStroke();
    await this.sync(spec);
    const found = findPart(spec, this.part.id);
    if (!found) return { ok: true, spec };
    const { part, index } = found;
    const hasFlattened = !!part.pbr?.flattened && Object.keys(part.pbr.flattened).length > 0;
    if (this.dirty.size === 0 && this.lastKey === this.savedKey && (hasFlattened || !part.pbr)) return { ok: true, spec };
    this.set({ busy: 'Saving textures…' });
    try {
      const stem = `${this.io.stem}.${part.id}`;
      const pbr: ModelPbr = structuredClone(part.pbr ?? emptyPbr());
      for (const key of this.dirty) {
        const [layerId, target] = key.split(':') as [string, PaintTarget];
        const layer = pbr.layers.find((l) => l.id === layerId);
        const image = this.images.get(key);
        if (!layer || !image) continue;
        const file = await this.write((h) => `${stem}.${layerId}-${target}.${h}.png`, image);
        layer.maps = { ...(layer.maps ?? {}), [target]: file };
        this.loaded.set(key, file.hash);
      }
      const input = this.input();
      const flattened: NonNullable<ModelPbr['flattened']> = {
        baseColor: await this.write((h) => `${stem}.pbr-baseColor.${h}.png`, this.flat.albedo),
        orm: await this.write((h) => `${stem}.pbr-orm.${h}.png`, this.orm),
      };
      if (channelInUse(input, 'normal')) flattened.normal = await this.write((h) => `${stem}.pbr-normal.${h}.png`, this.flat.normal);
      if (channelInUse(input, 'emissive')) flattened.emissive = await this.write((h) => `${stem}.pbr-emissive.${h}.png`, this.flat.emissive);
      pbr.flattened = flattened;
      this.dirty.clear();
      this.pbr = pbr;
      this.savedKey = this.lastKey;
      this.dispatch({ type: 'paintFlushed', id: this.part.id, pbr });
      this.set({ unsaved: false, busy: null });
      const parts = spec.parts.slice();
      parts[index] = { ...part, pbr };
      return { ok: true, spec: { ...spec, parts } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.set({ busy: null, error: message });
      return { ok: false, error: message };
    }
  }

  /** Leaves paint mode, saving the textures first so the ordinary scene draws the painted part. */
  async exit(spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
    const flushed = await this.flush(spec);
    if (!flushed.ok) return flushed;
    await this.dispose();
    return flushed;
  }

  async dispose(): Promise<void> {
    this.stroke = null;
    this.part = null;
    this.surface = null;
    this.images.clear();
    this.loaded.clear();
    this.dirty.clear();
    this.flat = null;
    this.orm = null;
    this.snapshot.geometry?.dispose();
    for (const t of Object.values(this.snapshot.textures ?? {})) t.dispose();
    this.set({ ...INITIAL, settings: this.snapshot.settings });
  }

  /** Read access for tests and the panel: a layer channel image held in memory. */
  layerImage(layerId: string, target: PaintTarget): PaintImage | undefined {
    return this.images.get(keyOf(layerId, target));
  }
}
