import { LuAxis3D, LuGrid3X3, LuMove3D, LuRotate3D, LuScale3D, LuSquareDashed } from 'react-icons/lu';
import { IconButton } from '../../../components/icon-button';
import { Tooltip } from '../../../components/tooltip';
import type { TransformMode } from './editor-scene';
import { ANGLE_STEPS, GRID_STEPS, type SnapSettings } from './snap';

/**
 * Floating viewport widgets docked at the top-center of the 3D canvas.
 * Displays transform mode selection, snap controls, and visibility toggles
 * for grid, axes, and dimensions.
 */
export function ViewportWidgets({
  mode,
  onModeChange,
  snap,
  onSnapChange,
  grid,
  onGridToggle,
  axes,
  onAxesToggle,
  dimensions,
  onDimensionsToggle,
}: {
  mode: TransformMode;
  onModeChange: (mode: TransformMode) => void;
  snap: SnapSettings;
  onSnapChange: (snap: SnapSettings) => void;
  grid: boolean;
  onGridToggle: () => void;
  axes: boolean;
  onAxesToggle: () => void;
  dimensions: boolean;
  onDimensionsToggle: () => void;
}) {
  const MODES = [
    { id: 'translate', key: 'W', label: 'Move', icon: LuMove3D },
    { id: 'rotate', key: 'E', label: 'Rotate', icon: LuRotate3D },
    { id: 'scale', key: 'R', label: 'Scale', icon: LuScale3D },
  ] as const;

  return (
    <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-lg backdrop-blur-sm">
        {/* Transform mode selection */}
        <div role="radiogroup" aria-label="Transform mode" className="flex items-center gap-0.5">
          {MODES.map(({ id, key, label, icon: Icon }) => (
            <Tooltip key={id} label={`${label} (${key})`}>
              <button
                type="button"
                role="radio"
                aria-checked={mode === id}
                aria-label={label}
                onClick={() => onModeChange(id as TransformMode)}
                className={`flex h-6 w-6 items-center justify-center rounded-md ${mode === id ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
              >
                <Icon aria-hidden className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          ))}
        </div>

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        {/* Snap controls */}
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

        <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />

        {/* Grid, axes, dimensions toggles */}
        <IconButton icon={LuGrid3X3} label={grid ? 'Hide grid' : 'Show grid'} size="sm" onClick={onGridToggle} />
        <IconButton icon={LuAxis3D} label={axes ? 'Hide axes' : 'Show axes'} size="sm" onClick={onAxesToggle} />
        <IconButton
          icon={LuSquareDashed}
          label={dimensions ? 'Hide dimensions' : 'Show dimensions'}
          size="sm"
          aria-pressed={dimensions}
          onClick={onDimensionsToggle}
        />
      </div>
    </div>
  );
}
