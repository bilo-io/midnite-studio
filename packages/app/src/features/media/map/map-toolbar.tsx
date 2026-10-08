import { LuCircleDot, LuMapPin, LuMousePointer2, LuPentagon, LuRuler } from 'react-icons/lu';

import { IconButton, type IconComponent } from '../../../components/icon-button';
import { MAP_TOOL_KEYS, MAP_TOOL_LABEL, MAP_TOOLS, type MapTool } from './map-tools';

const ICON: Record<MapTool, IconComponent> = { pan: LuMousePointer2, distance: LuRuler, circle: LuCircleDot, area: LuPentagon, pin: LuMapPin };

/** The measure/draw tools (Phase 108 Theme G): a vertical strip on the canvas; the keys work with it focused. */
export function MapToolbar({ tool, onSelect }: { tool: MapTool; onSelect: (tool: MapTool) => void }) {
  return (
    <div role="toolbar" aria-label="Map tools" aria-orientation="vertical" className="absolute left-2 top-12 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-background/80 p-0.5 shadow-sm backdrop-blur-sm">
      {MAP_TOOLS.map((t) => (
        <IconButton
          key={t}
          icon={ICON[t]}
          size="sm"
          label={t === 'pan' ? 'Pan (Esc)' : `${MAP_TOOL_LABEL[t]} (${MAP_TOOL_KEYS[t].toUpperCase()})`}
          aria-pressed={tool === t}
          className={tool === t ? 'bg-primary/15 text-primary' : undefined}
          onClick={() => onSelect(t === tool ? 'pan' : t)}
        />
      ))}
    </div>
  );
}
