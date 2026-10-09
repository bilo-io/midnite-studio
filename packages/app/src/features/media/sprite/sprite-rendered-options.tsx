import {
  describeRenderedClip,
  planRenderedClips,
  resolveRenderSettings,
  SPRITE_CAMERAS,
  SPRITE_SHADINGS,
  spriteClipNameFor,
  type SpriteClip,
  type SpriteRenderSettings,
} from '@midnite/studio-shared';
import { LuPlus } from 'react-icons/lu';

import type { SheetForm } from './sprite-form';
import type { RiggedModel } from './sprite-rig';

const FIELD = 'h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';
const LABEL = 'flex flex-col gap-1 text-[11px] font-medium text-muted-foreground';

const CAMERA_LABEL: Record<SpriteRenderSettings['camera'], string> = {
  side: 'Side',
  'top-down': 'Top-down (60°)',
  isometric: 'Isometric (2:1, 26.565°)',
  custom: 'Custom',
};

const SHADING_LABEL: Record<SpriteRenderSettings['shading'], string> = { lit: 'Lit', toon: 'Toon', flat: 'Flat' };

/**
 * Phase 106 Theme E: the Rendered-from-3D options. The model picker lists Models assets with a rig and
 * animations; once one is chosen, the clip mapping shows what each sprite clip will render
 * ("walk: 12 frames at 10 fps from the model's 1.2 s clip"), which sprite clips have no matching
 * animation (skipped), and offers the model's unused clips as new sprite clips.
 */
export function SpriteRenderedOptions({
  form,
  rigged,
  loading,
  onPatch,
  onAddClip,
}: {
  form: SheetForm;
  rigged: readonly RiggedModel[];
  loading: boolean;
  onPatch: (patch: Partial<SheetForm>) => void;
  onAddClip: (clip: SpriteClip) => void;
}) {
  const key = (m: { project: string; path: string }) => `${m.project}/${m.path}`;
  const selected = form.rig ? rigged.find((m) => key(m) === key(form.rig!)) : undefined;
  const mapping = selected ? planRenderedClips(form.clips, selected.clips) : null;
  const settings = resolveRenderSettings({ render: form.render, targetPerspective: form.perspective });
  const setRender = (patch: Partial<SheetForm['render']>, chosen = false) => onPatch({ render: { ...form.render, ...patch }, ...(chosen ? { cameraChosen: true } : {}) });
  const taken = new Set(form.clips.map((c) => c.name));

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 p-2" data-testid="rendered-options">
      <label className={LABEL}>
        Rigged model
        <select
          aria-label="Rigged model"
          data-testid="sprite-rig-picker"
          className={FIELD}
          value={form.rig ? key(form.rig) : ''}
          onChange={(e) => {
            const model = rigged.find((m) => key(m) === e.target.value);
            onPatch(model ? { rig: { project: model.project, path: model.path } } : { rig: undefined });
          }}
        >
          <option value="">{loading ? 'Loading Models…' : rigged.length === 0 ? 'No rigged models yet' : 'Attach a rigged model…'}</option>
          {rigged.map((m) => (
            <option key={key(m)} value={key(m)}>
              {m.label} — {m.clips.length} {m.clips.length === 1 ? 'clip' : 'clips'}
            </option>
          ))}
          {form.rig && !selected ? <option value={key(form.rig)}>{key(form.rig)}</option> : null}
        </select>
      </label>
      {!loading && rigged.length === 0 ? (
        <p className="text-[10px] text-muted-foreground">Rig a model and add animations in Media ▸ Models; it shows up here.</p>
      ) : null}

      {mapping ? (
        <div className="flex flex-col gap-1" data-testid="clip-mapping">
          {mapping.plans.map((plan) => (
            <p key={plan.clip.name} className="text-[11px] tabular-nums text-foreground">
              {describeRenderedClip(plan)}
            </p>
          ))}
          {mapping.unmatched.length > 0 ? (
            <p role="status" className="text-[11px] text-amber-600 dark:text-amber-400">
              No matching animation: {mapping.unmatched.join(', ')}
            </p>
          ) : null}
          {mapping.unused.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Also on the model:</span>
              {mapping.unused.map((clip) => {
                const name = spriteClipNameFor(clip);
                if (!name || taken.has(name)) return null;
                return (
                  <button
                    key={clip.name}
                    type="button"
                    onClick={() => onAddClip({ name, frames: 8, fps: 8, loop: clip.loop === false ? 'once' : 'loop' })}
                    className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground hover:border-primary/60"
                  >
                    <LuPlus aria-hidden className="h-3 w-3" />
                    {name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <label className={LABEL}>
          Camera
          <select aria-label="Camera" className={FIELD} value={form.render.camera} onChange={(e) => setRender({ camera: e.target.value as SpriteRenderSettings['camera'] }, true)}>
            {SPRITE_CAMERAS.map((c) => (
              <option key={c} value={c}>{CAMERA_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Shading
          <select aria-label="Shading" className={FIELD} value={form.render.shading} onChange={(e) => setRender({ shading: e.target.value as SpriteRenderSettings['shading'] })}>
            {SPRITE_SHADINGS.map((c) => (
              <option key={c} value={c}>{SHADING_LABEL[c]}</option>
            ))}
          </select>
        </label>
        {form.render.camera === 'custom' ? (
          <>
            <label className={LABEL}>
              Elevation°
              <input aria-label="Elevation" type="number" min={-89} max={89} className={FIELD} value={form.render.elevationDeg} onChange={(e) => setRender({ elevationDeg: clamp(e.target.value, -89, 89) })} />
            </label>
            <label className={LABEL}>
              Azimuth°
              <input aria-label="Azimuth" type="number" min={-360} max={360} className={FIELD} value={form.render.azimuthDeg} onChange={(e) => setRender({ azimuthDeg: clamp(e.target.value, -360, 360) })} />
            </label>
          </>
        ) : null}
        <label className={LABEL}>
          Supersample
          <select aria-label="Supersample" className={FIELD} value={form.render.supersample} onChange={(e) => setRender({ supersample: Number(e.target.value) as 2 | 3 | 4 })}>
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}×</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 self-end pb-1.5 text-[11px] text-foreground">
          <input type="checkbox" checked={form.render.outline} onChange={(e) => setRender({ outline: e.target.checked })} className="accent-[hsl(var(--primary))]" />
          Outline
        </label>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Orthographic, {Math.round(settings.elevationDeg * 1000) / 1000}° down; one scale for every frame and direction. Rendered in this window — keep it open while the job runs.
      </p>
    </div>
  );
}

const clamp = (raw: string, min: number, max: number): number => Math.min(max, Math.max(min, Number(raw) || 0));
