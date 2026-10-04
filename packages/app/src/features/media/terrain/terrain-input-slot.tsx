import { MEDIA_ROOT_DIR, mstudioFileUrl, type TerrainInputRef, type TerrainInputSlot as Slot } from '@midnite/studio-shared';
import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { LuImagePlus, LuX } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';

/**
 * One of the three optional inputs of a terrain. Copy is fixed by the phase doc: each slot says in one
 * line what the image is *for*, and is visibly optional.
 */
export const SLOT_COPY: Record<Slot, { label: string; hint: string }> = {
  heightmap: { label: 'Heightmap', hint: 'Greyscale image: brighter is higher. Optional.' },
  satellite: { label: 'Satellite', hint: 'Top-down photo of the same area: textures the ground and places trees and buildings. Optional.' },
  roads: { label: 'Roads mask', hint: 'Light roads on a dark background (cyan works best). Optional.' },
};

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const NOT_AN_IMAGE = 'Use a PNG, JPEG or WebP image.';

export function TerrainInputSlot({
  slot,
  input,
  repoId,
  project,
  terrain,
  revision,
  onAttach,
  onRemove,
}: {
  slot: Slot;
  input: TerrainInputRef | undefined;
  repoId: string;
  project: string;
  terrain: string;
  /** Changes whenever the stored image does, so the thumbnail is refetched rather than served from cache. */
  revision: string;
  onAttach: (slot: Slot, file: File) => void;
  onRemove: (slot: Slot) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const { label, hint } = SLOT_COPY[slot];

  const take = (file: File | undefined) => {
    if (!file) return;
    if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return setError(NOT_AN_IMAGE);
    setError(null);
    onAttach(slot, file);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    take(event.dataTransfer.files[0]);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (input && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      onRemove(slot);
    }
  };

  const thumb = input ? `${mstudioFileUrl('repo', repoId, `${MEDIA_ROOT_DIR}/terrain/${project}/${terrain}/${input.file}`)}?v=${encodeURIComponent(revision)}` : null;

  return (
    <div role="group" aria-label={label} data-testid={`terrain-slot-${slot}`} className="flex flex-col gap-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">(optional)</span>
      </div>
      <input
        ref={picker}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        hidden
        data-testid={`terrain-file-${slot}`}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {input ? (
        <div className="flex items-center gap-2 rounded-md border border-border p-1.5" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <button
            type="button"
            aria-label={`Replace ${label.toLowerCase()}`}
            onClick={() => picker.current?.click()}
            onKeyDown={onKeyDown}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {thumb ? <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded border border-border bg-muted object-cover" /> : null}
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-xs">{input.sourceName}</span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {input.width} × {input.height} · {input.bitDepth}-bit
              </span>
            </span>
          </button>
          <IconButton icon={LuX} label={`Remove ${slot}`} size="sm" onClick={() => onRemove(slot)} />
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Attach ${label.toLowerCase()}`}
          onClick={() => picker.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          data-over={over || undefined}
          className="flex items-start gap-2 rounded-md border border-dashed border-border p-2 text-left text-[11px] text-muted-foreground hover:bg-primary/5 data-[over]:border-primary data-[over]:bg-primary/5"
        >
          <LuImagePlus aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{hint}</span>
        </button>
      )}
      {input ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
