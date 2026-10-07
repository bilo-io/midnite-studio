import { SCULPT_FALLOFFS, type ModelSpec, type SculptBrushKind, type SculptFalloff } from '@midnite/studio-shared';
import { useState, type Dispatch } from 'react';
import {
  LuBrush,
  LuCirclePlus,
  LuEqual,
  LuEraser,
  LuFlipHorizontal2,
  LuGrid3X3,
  LuHand,
  LuLayers,
  LuLogOut,
  LuPaintbrush,
  LuPencil,
  LuShrink,
  LuSlash,
  LuWaves,
} from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import type { EditorAction, EditorState } from './editor-state';
import { NumberField, SECTION, SelectField, SliderField } from './fields';
import type { ConvertFn } from './mesh-panel';
import { SCREEN_RADIUS_RANGE, WORLD_RADIUS_RANGE, type SculptController, type SculptSettings, type SculptSnapshot } from './sculpt/sculpt-controller';
import { ensureIds } from './spec-edit';

/**
 * The Sculpt tab (Phase 104 Theme D): enter sculpt mode on a `sculpt` part, pick a brush and its
 * settings, symmetry, the mask, multires levels and voxel remesh. The viewport does the sculpting; this
 * panel is everything that is not a pointer drag, so the #717 toolbar stays compact and nothing covers
 * the top-centre viewport widgets.
 */
export const BRUSHES: readonly { kind: SculptBrushKind; label: string; icon: IconComponent; hint: string }[] = [
  { kind: 'draw', label: 'Draw', icon: LuPencil, hint: 'Raise the surface along its normal' },
  { kind: 'clay', label: 'Clay', icon: LuLayers, hint: 'Build up flat strips of clay' },
  { kind: 'inflate', label: 'Inflate', icon: LuCirclePlus, hint: 'Swell along each vertex normal' },
  { kind: 'smooth', label: 'Smooth', icon: LuWaves, hint: 'Relax bumps (or hold Shift with any brush)' },
  { kind: 'grab', label: 'Grab', icon: LuHand, hint: 'Drag a region with the pointer' },
  { kind: 'crease', label: 'Crease', icon: LuSlash, hint: 'Cut a sharp groove' },
  { kind: 'flatten', label: 'Flatten', icon: LuEqual, hint: 'Press the surface onto a plane' },
  { kind: 'pinch', label: 'Pinch', icon: LuShrink, hint: 'Pull the surface toward the stroke' },
  { kind: 'mask', label: 'Mask', icon: LuPaintbrush, hint: 'Paint where brushes may not reach' },
];

const FALLOFF_LABELS: Record<SculptFalloff, string> = { smooth: 'Smooth', sphere: 'Sphere', root: 'Root', sharp: 'Sharp', linear: 'Linear', constant: 'Constant' };
const BUTTON = 'flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50';

export function SculptPanel({
  state,
  dispatch,
  controller,
  snapshot,
  onConvert,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  controller: SculptController;
  snapshot: SculptSnapshot;
  onConvert?: ConvertFn;
}) {
  const { spec, selected } = state;
  const [voxel, setVoxel] = useState<number | undefined>(undefined);
  const [converting, setConverting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const s = snapshot.settings;
  const set = (patch: Partial<SculptSettings>) => controller.setSettings(patch);

  if (snapshot.status === 'idle' || snapshot.status === 'error' || snapshot.status === 'loading') {
    const sculptParts = spec.parts.flatMap((p, i) => (p.shape === 'sculpt' && !p.hidden ? [{ name: p.name, index: i }] : []));
    const chosen = selected !== null && spec.parts[selected]?.shape === 'sculpt' ? selected : (sculptParts[0]?.index ?? null);
    const convertAndSculpt = async () => {
      if (!onConvert) return;
      setConverting(true);
      setMessage(null);
      const withIds = ensureIds(spec);
      const outcome = await onConvert({ spec: withIds, targetVertices: 20_000 }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
      setConverting(false);
      if (!outcome.ok) return setMessage(outcome.error);
      dispatch({ type: 'convert', spec: outcome.spec, partId: outcome.partId });
      const index = outcome.spec.parts.findIndex((p) => p.id === outcome.partId);
      if (index >= 0) await controller.enter(outcome.spec, index);
    };
    return (
      <div className="flex flex-col gap-2" role="group" aria-label="Sculpt">
        <p className="text-[11px] text-muted-foreground">
          Sculpt a mesh with brushes: draw, clay, inflate, smooth, grab, crease, flatten, pinch and a mask, mirrored across the axes you pick. Left-drag sculpts; orbit with the right button,
          pan with the middle one.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {chosen !== null ? (
            <button type="button" className={BUTTON} disabled={snapshot.status === 'loading'} onClick={() => void controller.enter(spec, chosen)}>
              <LuBrush aria-hidden className="h-3.5 w-3.5" />
              {snapshot.status === 'loading' ? 'Opening…' : `Sculpt ${spec.parts[chosen]?.name ?? 'part'}`}
            </button>
          ) : null}
          {chosen === null && onConvert ? (
            <button type="button" className={BUTTON} disabled={converting} onClick={() => void convertAndSculpt()}>
              <LuBrush aria-hidden className="h-3.5 w-3.5" />
              {converting ? 'Converting…' : 'Convert the design and sculpt'}
            </button>
          ) : null}
          {chosen === null && !onConvert ? <p className="text-[11px] text-muted-foreground">There is no sculpt part yet. Convert the design in the Mesh tab first.</p> : null}
        </div>
        {snapshot.error || message ? (
          <p role="alert" className="text-[11px] text-destructive">
            {snapshot.error ?? message}
          </p>
        ) : null}
      </div>
    );
  }

  const partName = spec.parts.find((p) => p.id === snapshot.partId)?.name ?? 'part';
  const exit = async () => {
    const out = await controller.exit(state.spec);
    if (!out.ok) setMessage(out.error);
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Sculpt">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-muted-foreground" data-testid="sculpt-status" role="status">
          Sculpting <span className="font-medium text-foreground">{partName}</span> · {snapshot.vertices.toLocaleString()} verts · level {snapshot.level}
          {snapshot.unsaved ? ' · unsaved' : ''}
          {snapshot.busy ? ` · ${snapshot.busy}` : ''}
          {snapshot.lastStroke ? ` · last stroke moved ${snapshot.lastStroke.moved.toLocaleString()} verts` : ''}
        </p>
        <button type="button" className={`${BUTTON} ml-auto`} onClick={() => void exit()}>
          <LuLogOut aria-hidden className="h-3.5 w-3.5" />
          Done sculpting
        </button>
      </div>
      {snapshot.error || message ? (
        <p role="alert" className="text-[11px] text-destructive">
          {snapshot.error ?? message}
        </p>
      ) : null}

      <div role="radiogroup" aria-label="Brush" className="flex flex-wrap gap-1">
        {BRUSHES.map((b) => {
          const Icon = b.icon;
          return (
            <button
              key={b.kind}
              type="button"
              role="radio"
              aria-checked={s.brush === b.kind}
              title={b.hint}
              onClick={() => set({ brush: b.kind })}
              className={`flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] ${s.brush === b.kind ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'}`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {b.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-2">
        <div className="flex items-center gap-1.5">
          <span className="w-24 shrink-0 text-[11px] text-muted-foreground">Radius (F)</span>
          {s.radiusUnit === 'screen' ? (
            <NumberField label="Radius" value={s.screenRadius} step={2} min={SCREEN_RADIUS_RANGE[0]} max={SCREEN_RADIUS_RANGE[1]} integer onCommit={(v) => v !== undefined && set({ screenRadius: v })} />
          ) : (
            <NumberField label="Radius" value={s.worldRadius} step={0.01} min={WORLD_RADIUS_RANGE[0]} max={WORLD_RADIUS_RANGE[1]} onCommit={(v) => v !== undefined && set({ worldRadius: v })} />
          )}
          <SelectField
            label="Unit"
            value={s.radiusUnit}
            options={[
              { value: 'screen', label: 'px' },
              { value: 'world', label: 'm' },
            ]}
            onChange={(radiusUnit) => set({ radiusUnit })}
          />
        </div>
        <SliderField label="Strength (Shift+F)" value={s.strength} min={0} max={1} step={0.05} onCommit={(strength) => set({ strength })} />
        <SelectField label="Falloff" value={s.falloff} options={SCULPT_FALLOFFS.map((f) => ({ value: f, label: FALLOFF_LABELS[f] }))} onChange={(falloff) => set({ falloff })} />
        <SliderField label="Spacing" value={s.spacing} min={0.02} max={1} step={0.02} onCommit={(spacing) => set({ spacing })} />
        <SliderField label="Lazy mouse" value={s.lazy} min={0} max={1} step={0.05} onCommit={(lazy) => set({ lazy })} />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={s.frontFacesOnly} onChange={(e) => set({ frontFacesOnly: e.target.checked })} />
            Front faces only
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={s.pressure} onChange={(e) => set({ pressure: e.target.checked })} />
            Pen pressure
          </label>
        </div>
      </div>

      <p className={SECTION}>Symmetry</p>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Symmetry">
        <LuFlipHorizontal2 aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button
            key={axis}
            type="button"
            aria-pressed={s.symmetry[axis]}
            aria-label={`Mirror ${axis.toUpperCase()}`}
            onClick={() => set({ symmetry: { ...s.symmetry, [axis]: !s.symmetry[axis] } })}
            className={`h-6 w-7 rounded-md border text-[11px] font-medium ${s.symmetry[axis] ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-card text-muted-foreground hover:bg-accent'}`}
          >
            {axis.toUpperCase()}
          </button>
        ))}
        <SelectField
          label="Space"
          value={s.symmetry.space}
          options={[
            { value: 'local', label: 'Local' },
            { value: 'world', label: 'World' },
          ]}
          onChange={(space) => set({ symmetry: { ...s.symmetry, space } })}
        />
      </div>

      <p className={SECTION}>Mask</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={BUTTON} onClick={() => void controller.maskOp('invert')}>
          <LuPaintbrush aria-hidden className="h-3.5 w-3.5" />
          Invert mask
        </button>
        <button type="button" className={BUTTON} onClick={() => void controller.maskOp('clear')}>
          <LuEraser aria-hidden className="h-3.5 w-3.5" />
          Clear mask
        </button>
      </div>

      <p className={SECTION}>Multires and remesh</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={BUTTON} disabled={!!snapshot.busy} onClick={() => void controller.subdivide()}>
          <LuGrid3X3 aria-hidden className="h-3.5 w-3.5" />
          Subdivide
        </button>
        <SelectField
          label="Level"
          value={String(snapshot.level)}
          options={snapshot.levels.map((l) => ({ value: String(l), label: l === 0 ? '0 (base)' : String(l) }))}
          onChange={(level) => void controller.setLevel(Number(level))}
        />
        <span className="mx-1 h-4 w-px bg-border" aria-hidden />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Voxel
          <NumberField label="Remesh voxel size" value={voxel} placeholder="auto" step={0.005} min={0.001} onCommit={setVoxel} />
        </label>
        <button
          type="button"
          className={BUTTON}
          disabled={!!snapshot.busy}
          onClick={() => void controller.remesh(voxel !== undefined ? { voxelSize: voxel } : { targetVertices: Math.max(5000, snapshot.vertices) })}
        >
          Voxel remesh
        </button>
      </div>
    </div>
  );
}

/** The spec a save should write: the live sculpt mesh flushed first when sculpt mode is on. */
export async function specForSave(controller: SculptController | null, spec: ModelSpec): Promise<{ ok: true; spec: ModelSpec } | { ok: false; error: string }> {
  return controller ? controller.flush(spec) : { ok: true, spec };
}
