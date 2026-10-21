import {
  modelAssetHash,
  registerSculptMesh,
  sdfMeshSrcFor,
  worldMatrices,
  MODEL_MESH_OPS_BATCH_MAX,
  type GitOpResult,
  type Mat4,
  type ModelMeshResult,
  type ModelOpEntry,
  type ModelSculptPart,
  type ModelSpec,
  type RemeshOptions,
  type SculptBrush,
  type SculptBrushKind,
  type SculptFalloff,
  type SculptSymmetry,
  type StrokeSummary,
} from '@midnite/studio-shared';
import type { BufferGeometry } from 'three';

import type { EditorAction } from '../editor-state';
import { withSculptFile } from './sculpt-file';
import type { SculptSession } from './sculpt-client';
import { applySculptDelta, applySculptMask, createSculptGeometry } from './sculpt-display';
import type { SculptHit, SculptLoaded, SculptMaskDelta, SculptDelta, Vec3 } from './sculpt-protocol';

/**
 * Sculpt mode's brain (Phase 104 Theme D), outside React so it is unit-tested against the real worker
 * host: it opens a `sculpt` part in the worker, owns the display geometry, runs strokes, and keeps the
 * live mesh and the editor's undo history in step.
 *
 * **Undo.** Every stroke, mask edit, subdivide, level step or remesh is one `sculptEdit` in the
 * editor's reducer, which bumps the part's `revision`. When the spec changes (undo, redo, an agent's
 * edit) {@link SculptController.sync} compares the part's revision with the worker's and seeks the
 * worker there; only a part whose `hash` this session has never seen is reloaded from disk.
 *
 * **Saving.** Strokes live in the worker until {@link SculptController.flush}: the mesh is serialised,
 * written to a content-named `.mesh.bin` beside the design (with the op log carried over plus this
 * session's strokes), registered so the ordinary scene draws it, and the part is repointed at it
 * without a history step. Every older file stays on disk, so undo past a save still has its mesh.
 */

export type SculptIO = {
  /** The design's file stem (`fox`), which names mesh files. */
  stem: string;
  read: (src: string) => Promise<GitOpResult<ModelMeshResult>>;
  write: (req: { src: string; data: Uint8Array; ops: ModelOpEntry[] }) => Promise<GitOpResult<ModelMeshResult>>;
  readOps: (src: string) => Promise<GitOpResult<ModelMeshResult>>;
  /** Paint mode (Theme G): a texture PNG beside the design. */
  writeTexture?: (src: string, data: Uint8Array) => Promise<GitOpResult<ModelMeshResult>>;
  /** Paint mode (Theme G): any file of the model's folder, or `null`. */
  readFile?: (src: string) => Promise<Uint8Array | null>;
};

export type SculptSettings = {
  brush: SculptBrushKind;
  /** `screen`: `screenRadius` pixels at the surface; `world`: `worldRadius` in model units. */
  radiusUnit: 'screen' | 'world';
  screenRadius: number;
  worldRadius: number;
  strength: number;
  falloff: SculptFalloff;
  spacing: number;
  frontFacesOnly: boolean;
  /** Lazy mouse: 0 (off) – 1 (the pointer trails by a full radius). */
  lazy: number;
  /** Use a tablet's pressure. */
  pressure: boolean;
  symmetry: SculptSymmetry;
  /** Draw the mesh with a clay matcap instead of its material (Theme G), so forms read under any light. */
  matcap: boolean;
};

export const DEFAULT_SCULPT_SETTINGS: SculptSettings = {
  brush: 'draw',
  radiusUnit: 'screen',
  screenRadius: 48,
  worldRadius: 0.1,
  strength: 0.5,
  falloff: 'smooth',
  spacing: 0.1,
  frontFacesOnly: true,
  lazy: 0,
  pressure: true,
  symmetry: { x: true, y: false, z: false, space: 'local' },
  matcap: false,
};

export const SCREEN_RADIUS_RANGE = [4, 400] as const;
export const WORLD_RADIUS_RANGE = [0.001, 10] as const;

/** An `F` / `Shift+F` drag in progress: the pointer's x when it started and the value then. */
export type SculptAdjust = { kind: 'radius' | 'strength'; startX: number; startValue: number };

export type SculptSnapshot = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  partId: string | null;
  vertices: number;
  triangles: number;
  levels: number[];
  level: number;
  revision: number;
  busy: string | null;
  geometry: BufferGeometry | null;
  /** Bumps when the geometry object is replaced (a topology change). */
  geometryEpoch: number;
  /** Bumps on every in-place patch — a redraw cue. */
  editEpoch: number;
  settings: SculptSettings;
  hover: SculptHit | null;
  adjust: SculptAdjust | null;
  lastStroke: StrokeSummary | null;
  /** Something changed since the last flush. */
  unsaved: boolean;
};

const INITIAL: SculptSnapshot = {
  status: 'idle',
  error: null,
  partId: null,
  vertices: 0,
  triangles: 0,
  levels: [],
  level: 0,
  revision: 0,
  busy: null,
  geometry: null,
  geometryEpoch: 0,
  editEpoch: 0,
  settings: DEFAULT_SCULPT_SETTINGS,
  hover: null,
  adjust: null,
  lastStroke: null,
  unsaved: false,
};

const findPart = (spec: ModelSpec, id: string | null): { part: ModelSculptPart; index: number } | null => {
  if (!id) return null;
  const index = spec.parts.findIndex((p) => p.id === id);
  const part = spec.parts[index];
  return part && part.shape === 'sculpt' ? { part, index } : null;
};

/** The part's world matrix (row-major), parents applied. */
export const sculptWorldMatrix = (spec: ModelSpec, index: number): Mat4 => worldMatrices(spec.parts)[index] ?? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Uniform scale of a matrix (the cube root of its 3×3 determinant), for world → mesh-space radii. */
export function uniformScale(m: Mat4): number {
  const det =
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) - m[1]! * (m[4]! * m[10]! - m[6]! * m[8]!) + m[2]! * (m[4]! * m[9]! - m[5]! * m[8]!);
  const s = Math.cbrt(Math.abs(det));
  return s > 0 ? s : 1;
}

/** The world-space size of one screen pixel at `distance` from a perspective camera, or for an orthographic zoom. */
export function worldPerPixel(camera: { fovDeg?: number; zoom?: number; ortho: boolean }, distance: number, viewportHeight: number): number {
  if (camera.ortho) return 1 / Math.max(1e-6, camera.zoom ?? 1);
  const fov = ((camera.fovDeg ?? 40) * Math.PI) / 180;
  return (2 * distance * Math.tan(fov / 2)) / Math.max(1, viewportHeight);
}

export class SculptController {
  private snapshot: SculptSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private session: SculptSession | null = null;
  /** Mesh hashes this session can stand for, and the revision each one holds. */
  private readonly lineage = new Map<string, number>();
  private pendingOps: ModelOpEntry[] = [];
  /** A stroke in flight: the brush it began with, and pointer samples waiting for the worker. */
  private stroke: { brush: SculptBrush; inFlight: boolean; queued: { origin: Vec3; dir: Vec3; pressure?: number } | null; ending: boolean } | null = null;
  /** The worker queue: every request after the first waits for the one before it to settle. */
  private chain: Promise<unknown> = Promise.resolve();
  private part: { id: string; src: string } | null = null;
  /** The pointer's last x over the viewport (the layer keeps it current) — where an `F` drag starts. */
  pointerX = 0;

  constructor(
    private readonly start: () => Promise<SculptSession>,
    private readonly io: SculptIO,
    private readonly dispatch: (action: EditorAction) => void,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = (): SculptSnapshot => this.snapshot;

  private set(patch: Partial<SculptSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  private queue<T>(run: () => Promise<T>): Promise<T> {
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined);
    return next;
  }

  get active(): boolean {
    return this.snapshot.status !== 'idle';
  }

  setSettings(patch: Partial<SculptSettings>): void {
    this.set({ settings: { ...this.snapshot.settings, ...patch } });
  }

  /** Opens the sculpt part at `index` in the worker. */
  async enter(spec: ModelSpec, index: number): Promise<boolean> {
    const part = spec.parts[index];
    if (!part || part.shape !== 'sculpt' || !part.id) {
      this.set({ status: 'error', error: 'Pick a sculpt part (convert the design in the Mesh tab first).' });
      return false;
    }
    if (this.active) await this.exit(spec);
    this.set({ ...INITIAL, settings: this.snapshot.settings, status: 'loading', partId: part.id });
    try {
      const read = await this.io.read(part.src);
      if (!read.ok || !read.value.data) throw new Error(read.ok ? 'The sculpt mesh file is empty.' : read.kind === 'error' ? read.message : 'The sculpt mesh could not be read.');
      const bytes = read.value.data instanceof Uint8Array ? read.value.data : new Uint8Array(read.value.data);
      if (modelAssetHash(bytes) !== part.hash) throw new Error('The sculpt mesh file changed since the design was saved.');
      this.session ??= await this.start();
      const revision = part.revision ?? 0;
      const loaded = await this.queue(() => this.session!.load(bytes, revision));
      this.lineage.clear();
      this.lineage.set(part.hash, revision);
      this.pendingOps = [];
      this.part = { id: part.id, src: part.src };
      this.adopt(loaded, { status: 'ready', error: null, unsaved: false });
      return true;
    } catch (error) {
      this.set({ status: 'error', error: error instanceof Error ? error.message : String(error), partId: null });
      return false;
    }
  }

  private adopt(loaded: SculptLoaded, extra: Partial<SculptSnapshot> = {}): void {
    this.snapshot.geometry?.dispose();
    this.set({
      geometry: createSculptGeometry(loaded),
      geometryEpoch: this.snapshot.geometryEpoch + 1,
      vertices: loaded.vertices,
      triangles: loaded.triangles,
      levels: loaded.levels,
      level: loaded.multiresLevel,
      revision: loaded.revision,
      ...extra,
    });
  }

  private patch(delta: SculptDelta | null, mask: SculptMaskDelta | null, extra: Partial<SculptSnapshot> = {}): void {
    const geometry = this.snapshot.geometry;
    if (geometry && delta) applySculptDelta(geometry, delta);
    if (geometry && mask) applySculptMask(geometry, mask);
    this.set({ editEpoch: this.snapshot.editEpoch + (delta || mask ? 1 : 0), ...extra });
  }

  /** Records an edit as one undo step in the editor (and the op log on the next flush). */
  private commit(revision: number, kind: ModelOpEntry['kind'], data: Record<string, unknown>, patch: { multiresLevel?: number; vertices?: number; triangles?: number } = {}): void {
    if (!this.part) return;
    this.pendingOps.push({ kind, at: new Date().toISOString(), by: 'user', data: { ...data, revision } });
    this.set({ revision, unsaved: true });
    this.dispatch({ type: 'sculptEdit', id: this.part.id, revision, ...patch });
  }

  /**
   * Brings the worker to the part's state in `spec`: seek on undo/redo, reload on an unknown mesh, leave
   * sculpt mode when the part is gone.
   */
  async sync(spec: ModelSpec): Promise<void> {
    if (this.snapshot.status !== 'ready' || !this.part || this.stroke) return;
    const found = findPart(spec, this.part.id);
    if (!found) {
      await this.dispose();
      return;
    }
    const { part, index } = found;
    const target = part.revision ?? 0;
    if (!this.lineage.has(part.hash)) {
      await this.enter(spec, index);
      return;
    }
    if (target === this.snapshot.revision) return;
    const reply = await this.queue(() => this.session!.seek(target));
    if (!reply.ok) {
      await this.enter(spec, index);
      return;
    }
    if (reply.mesh) this.adopt(reply.mesh, { unsaved: this.lineage.get(part.hash) !== target });
    else this.patch(reply.delta, reply.mask, { revision: reply.revision, unsaved: this.lineage.get(part.hash) !== target });
  }

  /** Starts a stroke under a mesh-space ray. `radius` is in mesh units (the caller converts screen pixels). */
  beginStroke(ray: { origin: Vec3; dir: Vec3; pressure?: number }, opts: { radius: number; invert?: boolean; smooth?: boolean; toWorld?: Mat4 }): void {
    if (this.snapshot.status !== 'ready' || !this.session || this.stroke || this.snapshot.busy) return;
    const s = this.snapshot.settings;
    const brush: SculptBrush = {
      brush: opts.smooth ? 'smooth' : s.brush,
      radius: Math.max(1e-6, opts.radius),
      strength: s.strength,
      falloff: s.falloff,
      spacing: s.spacing,
      ...(opts.invert ? { invert: true } : {}),
      ...(s.frontFacesOnly ? { frontFacesOnly: true } : {}),
    };
    const session = this.session;
    this.stroke = { brush, inFlight: true, queued: null, ending: false };
    void this.queue(async () => {
      await session.strokeBegin(brush, s.symmetry, s.symmetry.space === 'world' ? opts.toWorld : undefined);
      await this.sendSample(ray);
    })
      .catch((error: unknown) => this.set({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => this.drain());
  }

  private async sendSample(sample: { origin: Vec3; dir: Vec3; pressure?: number }): Promise<void> {
    const session = this.session;
    if (!session) return;
    const edit = await session.strokeTo(sample.origin, sample.dir, this.snapshot.settings.pressure ? sample.pressure : undefined);
    this.patch(edit.delta, edit.mask, { hover: edit.hit });
  }

  /** A pointer sample during the stroke. Samples arriving while the worker is busy collapse to the newest. */
  moveStroke(ray: { origin: Vec3; dir: Vec3; pressure?: number }): void {
    const stroke = this.stroke;
    if (!stroke || stroke.ending) return;
    if (stroke.inFlight) {
      stroke.queued = ray;
      return;
    }
    stroke.inFlight = true;
    void this.queue(() => this.sendSample(ray))
      .catch((error: unknown) => this.set({ error: error instanceof Error ? error.message : String(error) }))
      .finally(() => this.drain());
  }

  private drain(): void {
    const stroke = this.stroke;
    if (!stroke) return;
    stroke.inFlight = false;
    const next = stroke.queued;
    stroke.queued = null;
    if (next && !stroke.ending) this.moveStroke(next);
  }

  /** Ends the stroke; one undo step when it changed anything. */
  async endStroke(): Promise<StrokeSummary | null> {
    const stroke = this.stroke;
    if (!stroke || !this.session) return null;
    stroke.ending = true;
    const session = this.session;
    const queued = stroke.queued;
    stroke.queued = null;
    let edit: Awaited<ReturnType<SculptSession['strokeEnd']>>;
    try {
      edit = await this.queue(async () => {
        if (queued) await this.sendSample(queued).catch(() => undefined);
        return session.strokeEnd();
      });
    } catch (error) {
      this.stroke = null;
      this.set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
    this.stroke = null;
    this.patch(edit.delta, edit.mask, { lastStroke: edit.summary ?? null });
    if (edit.summary) {
      const { brush, radius, strength, falloff, spacing } = stroke.brush;
      this.commit(edit.revision, edit.summary.brush === 'mask' ? 'mask' : 'stroke', {
        brush,
        radius: Number(radius.toFixed(5)),
        strength,
        falloff,
        spacing,
        ...(stroke.brush.invert ? { invert: true } : {}),
        symmetry: this.snapshot.settings.symmetry,
        dabs: edit.summary.dabs,
        moved: edit.summary.moved,
        maxDisplacement: Number(edit.summary.maxDisplacement.toFixed(6)),
      });
    }
    return edit.summary ?? null;
  }

  /** The surface under a mesh-space ray, for the brush cursor (dropped while a stroke runs). */
  async hover(ray: { origin: Vec3; dir: Vec3 } | null): Promise<void> {
    if (!ray) {
      if (this.snapshot.hover) this.set({ hover: null });
      return;
    }
    if (this.snapshot.status !== 'ready' || !this.session || this.stroke) return;
    const session = this.session;
    const hit = await this.queue(() => session.raycast(ray.origin, ray.dir));
    this.set({ hover: hit ? { point: hit.point, normal: hit.normal } : null });
  }

  async maskOp(op: 'invert' | 'clear'): Promise<void> {
    if (this.snapshot.status !== 'ready' || !this.session || this.stroke) return;
    const session = this.session;
    const edit = await this.queue(() => session.mask(op));
    this.patch(edit.delta, edit.mask);
    if (edit.changed) this.commit(edit.revision, 'mask', { op });
  }

  private async topology(label: string, run: (session: SculptSession) => Promise<{ revision: number; mesh: SculptLoaded; voxelSize?: number }>, kind: ModelOpEntry['kind'], data: Record<string, unknown>): Promise<string | null> {
    if (this.snapshot.status !== 'ready' || !this.session || this.stroke) return null;
    const session = this.session;
    this.set({ busy: label, error: null });
    try {
      const reply = await this.queue(() => run(session));
      this.adopt(reply.mesh, { busy: null });
      this.commit(reply.revision, kind, { ...data, ...(reply.voxelSize ? { voxelSize: Number(reply.voxelSize.toFixed(5)) } : {}), vertices: reply.mesh.vertices }, {
        multiresLevel: reply.mesh.multiresLevel,
        vertices: reply.mesh.vertices,
        triangles: reply.mesh.triangles,
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.set({ busy: null, error: message });
      return message;
    }
  }

  subdivide(): Promise<string | null> {
    return this.topology('Subdividing…', (s) => s.subdivide(), 'subdivide', {});
  }

  setLevel(level: number): Promise<string | null> {
    return this.topology('Changing level…', (s) => s.setLevel(level), 'subdivide', { level });
  }

  remesh(options: RemeshOptions): Promise<string | null> {
    return this.topology('Remeshing…', (s) => s.voxelRemesh(options), 'remesh', { ...options });
  }

  /** Starts an `F` / `Shift+F` drag from the pointer's current x. */
  startAdjust(kind: SculptAdjust['kind'], x: number): void {
    const s = this.snapshot.settings;
    const startValue = kind === 'strength' ? s.strength : s.radiusUnit === 'screen' ? s.screenRadius : s.worldRadius;
    this.set({ adjust: { kind, startX: x, startValue } });
  }

  /** Moves the drag to pointer x: radius follows the pointer one-for-one in pixels, strength by 1 per 300 px. */
  updateAdjust(x: number): void {
    const a = this.snapshot.adjust;
    if (!a) return;
    const dx = x - a.startX;
    const s = this.snapshot.settings;
    if (a.kind === 'strength') this.setSettings({ strength: clamp(a.startValue + dx / 300, 0, 1) });
    else if (s.radiusUnit === 'screen') this.setSettings({ screenRadius: clamp(a.startValue + dx, ...SCREEN_RADIUS_RANGE) });
    else this.setSettings({ worldRadius: clamp(a.startValue * Math.pow(2, dx / 150), ...WORLD_RADIUS_RANGE) });
  }

  /** Ends the drag, keeping the value, or (`cancel`) putting the old one back. */
  endAdjust(cancel = false): void {
    const a = this.snapshot.adjust;
    if (!a) return;
    if (cancel) {
      const s = this.snapshot.settings;
      if (a.kind === 'strength') this.setSettings({ strength: a.startValue });
      else if (s.radiusUnit === 'screen') this.setSettings({ screenRadius: a.startValue });
      else this.setSettings({ worldRadius: a.startValue });
    }
    this.set({ adjust: null });
  }

  /** `[` / `]`: the radius down or up by a step. */
  stepRadius(direction: -1 | 1): void {
    const s = this.snapshot.settings;
    if (s.radiusUnit === 'screen') this.setSettings({ screenRadius: clamp(Math.round(s.screenRadius * (direction > 0 ? 1.15 : 1 / 1.15)), ...SCREEN_RADIUS_RANGE) });
    else this.setSettings({ worldRadius: clamp(s.worldRadius * (direction > 0 ? 1.15 : 1 / 1.15), ...WORLD_RADIUS_RANGE) });
  }

  /**
   * Writes the live mesh beside the design when it differs from the file the part points at, and returns
   * the spec repointed at it (also dispatched, without a history step). Unchanged → the spec as given.
   */
  async flush(spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
    if (this.snapshot.status !== 'ready' || !this.session || !this.part) return { ok: true, spec };
    if (this.stroke) await this.endStroke();
    await this.sync(spec);
    const found = findPart(spec, this.part.id);
    if (!found) return { ok: true, spec };
    const { part, index } = found;
    const revision = part.revision ?? 0;
    if (this.lineage.get(part.hash) === revision) return { ok: true, spec };
    const session = this.session;
    try {
      const out = await this.queue(() => session.serialize());
      const hash = modelAssetHash(out.bytes);
      const src = sdfMeshSrcFor(this.io.stem, part.id ?? this.part.id, hash);
      const fresh = this.pendingOps.filter((op) => typeof op.data?.revision !== 'number' || (op.data.revision as number) <= revision);
      const previous = await this.io.readOps(part.src);
      const carried = previous.ok ? (previous.value.entries ?? []) : [];
      const ops = [...carried, ...fresh, { kind: 'save' as const, at: new Date().toISOString(), by: 'user' as const, hash, data: { revision, vertices: out.vertices } }].slice(-MODEL_MESH_OPS_BATCH_MAX);
      const wrote = await this.io.write({ src, data: out.bytes, ops });
      if (!wrote.ok) return { ok: false, error: wrote.kind === 'error' ? wrote.message : 'The sculpt mesh could not be saved.' };
      registerSculptMesh(hash, out.bytes);
      this.lineage.set(hash, revision);
      this.pendingOps = this.pendingOps.filter((op) => !fresh.includes(op));
      this.part = { id: this.part.id, src };
      const file = { src, hash, vertices: out.vertices, triangles: out.triangles, multiresLevel: out.multiresLevel };
      this.dispatch({ type: 'sculptFlushed', id: this.part.id, file });
      this.set({ unsaved: false });
      const parts = spec.parts.slice();
      parts[index] = withSculptFile(part, file);
      return { ok: true, spec: { ...spec, parts } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /** Leaves sculpt mode, saving the mesh file first so the ordinary scene draws the sculpted shape. */
  async exit(spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
    const flushed = await this.flush(spec);
    if (!flushed.ok) {
      this.set({ error: flushed.error });
      return flushed;
    }
    await this.dispose();
    return flushed;
  }

  /** Drops the session without saving (the part was removed, or the editor is closing). */
  async dispose(): Promise<void> {
    this.stroke = null;
    this.part = null;
    this.lineage.clear();
    this.pendingOps = [];
    this.snapshot.geometry?.dispose();
    this.set({ ...INITIAL, settings: this.snapshot.settings });
  }

  /** Ends the worker for good. */
  terminate(): void {
    void this.dispose();
    this.session?.dispose();
    this.session = null;
  }
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
