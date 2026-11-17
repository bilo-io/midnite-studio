import { Choice, SwitchRow } from '@midnite/studio-frame';
import { ANGLE_STEPS, GRID_STEPS } from '@midnite/studio-frame/viewport3d';
import { LuMagnet } from 'react-icons/lu';

import { Popover } from '../chrome';
import { PLAN_STEPS, type LevelSnap } from './level-snap';

const PLAN_LABEL: Record<LevelSnap['planStep'], string> = { 1: 'Tile', 0.5: '½', 0.25: '¼', 0: 'Off' };

const selectClass = 'h-6 rounded-md border border-border bg-background px-1 text-[11px] text-foreground';

/**
 * The toolbar's snap settings (Phase 137 Theme F): a master switch, the Floorplan step, the 3D grid and angle, and
 * snap-to-surfaces (3D only). Holding Alt inverts snapping for one gesture.
 */
export function LevelSnapPopover({ snap, onChange, is3d }: { snap: LevelSnap; onChange: (patch: Partial<LevelSnap>) => void; is3d: boolean }) {
  return (
    <Popover label="Snap settings" title="Snap settings (hold Alt to invert)" side="bottom" align="start" panelClassName="w-56 space-y-2" trigger={<LuMagnet aria-hidden className={`h-3.5 w-3.5 ${snap.enabled ? '' : 'opacity-50'}`} />} testId="level-snap-trigger">
      <SwitchRow id="snap-enabled" label="Snap" on={snap.enabled} onToggle={(_, on) => onChange({ enabled: on })} />
      <Choice<string>
        label="Floorplan step"
        hint="A fraction of a tile"
        value={String(snap.planStep)}
        onChange={(v) => onChange({ planStep: Number(v) as LevelSnap['planStep'] })}
        options={PLAN_STEPS.map((s) => [String(s), PLAN_LABEL[s]] as [string, string])}
      />
      {is3d ? (
        <>
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            Grid
            <select aria-label="Grid snap" value={snap.grid} onChange={(e) => onChange({ grid: Number(e.target.value) })} className={selectClass}>
              {GRID_STEPS.map((s) => (
                <option key={s} value={s}>{s === 0 ? 'Off' : `${s} m`}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            Angle
            <select aria-label="Angle snap" value={snap.angle} onChange={(e) => onChange({ angle: Number(e.target.value) })} className={selectClass}>
              {ANGLE_STEPS.map((s) => (
                <option key={s} value={s}>{s === 0 ? 'Off' : `${s}°`}</option>
              ))}
            </select>
          </label>
          <SwitchRow id="snap-surface" label="Snap to surfaces" on={snap.surface} onToggle={(_, on) => onChange({ surface: on })} />
        </>
      ) : null}
    </Popover>
  );
}
