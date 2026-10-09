import { useState } from 'react';
import { LuLock, LuLockOpen } from 'react-icons/lu';
import type { TerrainAlignment } from '@midnite/studio-shared';
import { IconButton } from '../../../components/icon-button';
import { NumberField } from '../model/fields';

const DEFAULT_ALIGN: TerrainAlignment = {
  offset: [0, 0],
  scale: [1, 1],
  rotationDeg: 0,
};

export function AlignmentControls({
  label,
  isRoads,
  alignment,
  satelliteAlignment,
  onChange,
}: {
  label: string;
  isRoads?: boolean;
  alignment: TerrainAlignment | 'satellite' | undefined;
  satelliteAlignment?: TerrainAlignment;
  onChange: (next: TerrainAlignment | 'satellite') => void;
}) {
  const followSatellite = isRoads && alignment === 'satellite';
  const currentAlign: TerrainAlignment =
    alignment && alignment !== 'satellite'
      ? alignment
      : (satelliteAlignment ?? DEFAULT_ALIGN);

  const [lockAspect, setLockAspect] = useState(true);

  const update = (patch: Partial<TerrainAlignment>) => {
    onChange({
      ...currentAlign,
      ...patch,
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label} Alignment</span>
        {isRoads ? (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={followSatellite}
              onChange={(e) => {
                if (e.target.checked) onChange('satellite');
                else onChange({ ...currentAlign });
              }}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Follow satellite
          </label>
        ) : null}
      </div>

      {!followSatellite ? (
        <div className="flex flex-col gap-2">
          {/* Offset */}
          <div className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Offset</span>
            <NumberField
              label="Offset X"
              value={currentAlign.offset[0]}
              step={0.05}
              min={-1}
              max={1}
              onCommit={(ox) => ox !== undefined && update({ offset: [ox, currentAlign.offset[1]] })}
            />
            <NumberField
              label="Offset Z"
              value={currentAlign.offset[1]}
              step={0.05}
              min={-1}
              max={1}
              onCommit={(oz) => oz !== undefined && update({ offset: [currentAlign.offset[0], oz] })}
            />
          </div>

          {/* Scale */}
          <div className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Scale</span>
            <NumberField
              label="Scale X"
              value={currentAlign.scale[0]}
              step={0.1}
              min={0.1}
              max={10}
              onCommit={(sx) => {
                if (sx === undefined) return;
                if (lockAspect) {
                  const ratio = currentAlign.scale[0] > 0 ? currentAlign.scale[1] / currentAlign.scale[0] : 1;
                  update({ scale: [sx, Math.min(10, Math.max(0.1, sx * ratio))] });
                } else {
                  update({ scale: [sx, currentAlign.scale[1]] });
                }
              }}
            />
            <IconButton
              icon={lockAspect ? LuLock : LuLockOpen}
              label={lockAspect ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
              size="sm"
              onClick={() => setLockAspect((prev) => !prev)}
            />
            <NumberField
              label="Scale Z"
              value={currentAlign.scale[1]}
              step={0.1}
              min={0.1}
              max={10}
              onCommit={(sz) => {
                if (sz === undefined) return;
                if (lockAspect) {
                  const ratio = currentAlign.scale[1] > 0 ? currentAlign.scale[0] / currentAlign.scale[1] : 1;
                  update({ scale: [Math.min(10, Math.max(0.1, sz * ratio)), sz] });
                } else {
                  update({ scale: [currentAlign.scale[0], sz] });
                }
              }}
            />
          </div>

          {/* Rotation */}
          <div className="flex items-center gap-1.5">
            <span className="w-16 shrink-0 text-[11px] text-muted-foreground">Rotation</span>
            <NumberField
              label="Rotation (°)"
              value={currentAlign.rotationDeg}
              step={5}
              min={-180}
              max={180}
              onCommit={(rot) => rot !== undefined && update({ rotationDeg: rot })}
            />
            <span className="text-[11px] text-muted-foreground">°</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
