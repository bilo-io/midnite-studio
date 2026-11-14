import type { ComponentType, ReactElement } from 'react';
import { LuMove3D, LuRotate3D, LuScale3D } from 'react-icons/lu';

import { ANGLE_STEPS, GRID_STEPS, type SnapSettings } from './snap';

export type TransformMode = 'translate' | 'rotate' | 'scale';

/** The 3D editors' gizmo modes and their keys (Models and the level editor read the same table). */
export const TRANSFORM_MODES: readonly { id: TransformMode; key: 'W' | 'E' | 'R'; label: string; icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { id: 'translate', key: 'W', label: 'Move', icon: LuMove3D },
  { id: 'rotate', key: 'E', label: 'Rotate', icon: LuRotate3D },
  { id: 'scale', key: 'R', label: 'Scale', icon: LuScale3D },
];

/** The gizmo mode a bare key picks (W/E/R, any case), or `null`. */
export function transformModeForKey(key: string): TransformMode | null {
  const upper = key.toUpperCase();
  return TRANSFORM_MODES.find((m) => m.key === upper)?.id ?? null;
}

export type TransformModeBarProps = {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
  snap: SnapSettings;
  onSnapChange: (snap: SnapSettings) => void;
  /** Wraps each mode button in the host's tooltip; without one the button carries a `title`. */
  Tip?: ComponentType<{ label: string; children: ReactElement<Record<string, unknown>> }>;
};

/**
 * The gizmo mode radios and the grid / angle snap selects, as the 3D editors' floating viewport bar draws them.
 * Shared from the frame so Models and the level editor stay one look; each editor adds its own toggles beside it.
 */
export function TransformModeBar({ mode, onModeChange, snap, onSnapChange, Tip }: TransformModeBarProps) {
  return (
    <>
      <div role="radiogroup" aria-label="Transform mode" className="flex items-center gap-0.5">
        {TRANSFORM_MODES.map(({ id, key, label, icon: Icon }) => {
          const tip = `${label} (${key})`;
          const button = (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={mode === id}
              aria-label={label}
              title={Tip ? undefined : tip}
              onClick={() => onModeChange(id)}
              className={`flex h-6 w-6 items-center justify-center rounded-md ${mode === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
            </button>
          );
          return Tip ? (
            <Tip key={id} label={tip}>
              {button}
            </Tip>
          ) : (
            button
          );
        })}
      </div>

      <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

      <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
        Snap
        <select
          aria-label="Grid snap"
          value={snap.grid}
          onChange={(e) => onSnapChange({ ...snap, grid: Number(e.target.value) })}
          className="h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
        >
          {GRID_STEPS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Off' : `${s} m`}
            </option>
          ))}
        </select>
        <select
          aria-label="Angle snap"
          value={snap.angle}
          onChange={(e) => onSnapChange({ ...snap, angle: Number(e.target.value) })}
          className="h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground"
        >
          {ANGLE_STEPS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Off' : `${s}°`}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
