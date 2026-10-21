import { TERRAIN_CLASSES, TERRAIN_CLASS_COLOURS, type TerrainClass } from '@midnite/studio-shared';
import { LuEraser } from 'react-icons/lu';

export type BrushState = {
  active: boolean;
  selectedCls: number; // 0 = Erase, 1..8 = (class index + 1)
  radiusPx: number;
};

export function ClassBrushPalette({
  brush,
  onChange,
}: {
  brush: BrushState;
  onChange: (patch: Partial<BrushState>) => void;
}) {
  return (
    <div
      className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 rounded-lg border border-border/80 bg-background/90 p-3 shadow-lg backdrop-blur"
      data-testid="class-brush-palette"
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold">Land-Cover Brush</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Radius: {brush.radiusPx}px</span>
          <input
            type="range"
            min={1}
            max={64}
            value={brush.radiusPx}
            onChange={(e) => onChange({ radiusPx: Number(e.target.value) })}
            className="h-1.5 w-20 cursor-pointer accent-primary"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {/* Erase button (class 0) */}
        <button
          type="button"
          onClick={() => onChange({ selectedCls: 0 })}
          className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
            brush.selectedCls === 0
              ? 'bg-primary text-primary-foreground'
              : 'border border-border/60 hover:bg-muted'
          }`}
        >
          <LuEraser className="h-3.5 w-3.5" />
          <span>Erase</span>
        </button>

        {/* 8 Land-cover classes */}
        {TERRAIN_CLASSES.map((clsName: TerrainClass, idx: number) => {
          const clsValue = idx + 1;
          const color = TERRAIN_CLASS_COLOURS[clsName];
          const isSelected = brush.selectedCls === clsValue;

          return (
            <button
              key={clsName}
              type="button"
              onClick={() => onChange({ selectedCls: clsValue })}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                isSelected
                  ? 'ring-2 ring-primary ring-offset-1 ring-offset-background'
                  : 'border border-border/60 hover:bg-muted'
              }`}
            >
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/20"
                style={{ backgroundColor: color }}
              />
              <span className="capitalize">{clsName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
