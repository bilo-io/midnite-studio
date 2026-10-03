import type { ModelPart } from '@midnite/studio-shared';
import type { Dispatch } from 'react';

import type { EditorAction } from './editor-state';
import { ColorField, SECTION, SliderField } from './fields';

/** One-click looks: a colour (optional) plus PBR values. */
export const MATERIAL_PRESETS: { id: string; label: string; color?: string; material: Record<string, number | string | undefined> }[] = [
  { id: 'plastic', label: 'Matte plastic', material: { metalness: 0, roughness: 0.85, emissive: undefined, emissiveIntensity: undefined, opacity: undefined } },
  { id: 'metal', label: 'Brushed metal', color: '#b8bcc2', material: { metalness: 1, roughness: 0.38, emissive: undefined, emissiveIntensity: undefined, opacity: undefined } },
  { id: 'gold', label: 'Gold', color: '#d4af37', material: { metalness: 1, roughness: 0.22, emissive: undefined, emissiveIntensity: undefined, opacity: undefined } },
  { id: 'glass', label: 'Glass', color: '#cfe8ff', material: { metalness: 0, roughness: 0.05, opacity: 0.35, emissive: undefined, emissiveIntensity: undefined } },
  { id: 'emissive', label: 'Emissive', color: '#ffe9a8', material: { metalness: 0, roughness: 0.6, emissive: '#ffd36b', emissiveIntensity: 1.5, opacity: undefined } },
];

/** PBR editor for the selected parts: colour, metalness, roughness, emissive glow, opacity, presets. */
export function MaterialPanel({ part, indices, dispatch }: { part: ModelPart; indices: number[]; dispatch: Dispatch<EditorAction> }) {
  const m = part.material ?? {};
  const set = (patch: Record<string, unknown>) => dispatch({ type: 'material', indices, patch });
  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Material">
      <div className="flex flex-wrap items-center gap-1">
        {MATERIAL_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => dispatch({ type: 'material', indices, patch: preset.material, ...(preset.color ? { color: preset.color } : {}) })}
            className="h-6 rounded-md border border-border bg-card px-1.5 text-[11px] text-foreground hover:bg-accent"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <ColorField value={part.color} onCommit={(color) => dispatch({ type: 'patchMany', indices, patch: { color } })} />
        <ColorField label="Emissive" value={m.emissive ?? '#000000'} onCommit={(emissive) => set({ emissive: emissive === '#000000' ? undefined : emissive })} />
      </div>
      <SliderField label="Metalness" value={m.metalness ?? 0} min={0} max={1} step={0.01} onCommit={(metalness) => set({ metalness })} />
      <SliderField label="Roughness" value={m.roughness ?? 0.6} min={0} max={1} step={0.01} onCommit={(roughness) => set({ roughness })} />
      <SliderField label="Glow strength" value={m.emissiveIntensity ?? 1} min={0} max={10} step={0.1} onCommit={(emissiveIntensity) => set({ emissiveIntensity })} />
      <SliderField label="Opacity" value={m.opacity ?? 1} min={0} max={1} step={0.01} onCommit={(opacity) => set({ opacity: opacity === 1 ? undefined : opacity })} />
      <button type="button" onClick={() => set({ metalness: undefined, roughness: undefined, emissive: undefined, emissiveIntensity: undefined, opacity: undefined })} className={`${SECTION} self-start hover:text-foreground`}>
        Reset material
      </button>
    </div>
  );
}
