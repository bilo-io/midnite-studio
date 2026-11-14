import { TransformModeBar, type SnapSettings, type TransformMode } from '@midnite/studio-frame/viewport3d';
import { LuAxis3D, LuGrid3X3, LuSquareDashed } from 'react-icons/lu';

import { IconButton, Tooltip } from './chrome';

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
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2">
      <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-border/60 bg-background/80 px-3 py-2 shadow-lg backdrop-blur-sm">
        <TransformModeBar mode={mode} onModeChange={onModeChange} snap={snap} onSnapChange={onSnapChange} Tip={Tooltip} />

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
