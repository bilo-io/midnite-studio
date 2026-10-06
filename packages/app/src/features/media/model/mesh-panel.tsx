import { useState, type Dispatch } from 'react';
import { LuHexagon, LuUndo2 } from 'react-icons/lu';

import type { EditorAction, EditorState } from './editor-state';
import { NumberField, SECTION, SelectField } from './fields';
import { ensureIds } from './spec-edit';
import type { ConvertOutcome, ConvertRequest } from './sculpt/use-convert';

/**
 * The Mesh tab (Phase 104 Theme B): turn the design's primitives into one sculptable mesh, or take a
 * converted one back to its primitives. Conversion merges the scene the kernel builds (booleans and
 * modifiers applied) and voxel-remeshes it, so the result is one watertight surface whose vertex
 * groups remember each source part's colour. The primitives stay in the design, hidden; the whole step
 * is one undo.
 */
export type ConvertFn = (request: ConvertRequest) => Promise<ConvertOutcome>;

type Scope = 'design' | 'selection';
const RESOLUTIONS = [
  { value: '5000', label: 'Low (about 5 000 vertices)' },
  { value: '20000', label: 'Medium (about 20 000)' },
  { value: '80000', label: 'High (about 80 000)' },
  { value: '250000', label: 'Very high (about 250 000)' },
] as const;

export function MeshPanel({ state, dispatch, onConvert }: { state: EditorState; dispatch: Dispatch<EditorAction>; onConvert: ConvertFn }) {
  const { spec, selection, selected } = state;
  const [scope, setScope] = useState<Scope>('design');
  const [resolution, setResolution] = useState<string>('20000');
  const [voxel, setVoxel] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; notes?: string[] } | null>(null);

  const part = selected !== null ? spec.parts[selected] : undefined;
  const converted = part?.shape === 'sculpt' && (part.sources?.length ?? 0) > 0 ? part : null;
  const chosen = selection.filter((i) => spec.parts[i] && !spec.parts[i]!.hidden && spec.parts[i]!.shape !== 'sculpt');
  const visible = spec.parts.filter((p) => !p.hidden && p.shape !== 'group').length;
  const effectiveScope: Scope = scope === 'selection' && chosen.length > 0 ? 'selection' : 'design';

  const convert = async () => {
    setBusy(true);
    setMessage(null);
    const withIds = ensureIds(spec);
    const outcome = await onConvert({
      spec: withIds,
      ...(effectiveScope === 'selection' ? { parts: chosen.map((i) => withIds.parts[i]!.id!) } : {}),
      ...(voxel !== undefined ? { voxelSize: voxel } : { targetVertices: Number(resolution) }),
    }).catch((error: unknown) => ({ ok: false as const, error: error instanceof Error ? error.message : String(error) }));
    setBusy(false);
    if (!outcome.ok) return setMessage({ kind: 'error', text: outcome.error });
    dispatch({ type: 'convert', spec: outcome.spec, partId: outcome.partId });
    setMessage({
      kind: 'ok',
      text: `Converted to ${outcome.vertices.toLocaleString()} vertices, ${outcome.triangles.toLocaleString()} triangles (voxel ${outcome.voxelSize.toFixed(3)} m).`,
      notes: outcome.warnings,
    });
  };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Mesh">
      <p className="text-[11px] text-muted-foreground">
        Convert the primitives into one sculptable mesh. Booleans and modifiers are applied, each part’s colour is kept as a vertex group, and the primitives stay in the design, hidden.
      </p>
      {converted ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border/70 bg-muted/30 p-2" data-testid="mesh-converted">
          <p className={SECTION}>Converted mesh</p>
          <p className="text-[11px] text-muted-foreground">
            <span className="text-foreground">{converted.name}</span> was made from {converted.sources!.length} {converted.sources!.length === 1 ? 'part' : 'parts'}
            {converted.groups?.length ? ` (vertex groups: ${converted.groups.map((g) => g.name).join(', ')})` : ''}.
          </p>
          <button
            type="button"
            onClick={() => dispatch({ type: 'revertSculpt', index: selected! })}
            className="flex h-6 w-fit items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent"
          >
            <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
            Revert to parts
          </button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <SelectField
          label="Convert"
          value={effectiveScope}
          options={[
            { value: 'design', label: `Whole design (${visible} ${visible === 1 ? 'part' : 'parts'})` },
            { value: 'selection', label: chosen.length > 0 ? `Selection (${chosen.length})` : 'Selection (none picked)' },
          ]}
          onChange={(value) => setScope(value)}
        />
        <SelectField label="Detail" value={resolution} options={RESOLUTIONS} onChange={setResolution} />
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="shrink-0">Voxel size</span>
          <NumberField label="Voxel size" value={voxel} placeholder="auto" step={0.005} min={0.0001} max={10} onCommit={setVoxel} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || visible === 0}
          onClick={() => void convert()}
          className="flex h-6 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] text-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LuHexagon aria-hidden className="h-3.5 w-3.5" />
          {busy ? 'Converting…' : 'Convert to sculpt mesh'}
        </button>
        <span className="text-[11px] text-muted-foreground">One undo step. Save the design to keep it.</span>
      </div>
      {message ? (
        <div role={message.kind === 'error' ? 'alert' : 'status'} className={`text-[11px] ${message.kind === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
          <p>{message.text}</p>
          {message.notes?.map((note, i) => (
            <p key={i} className="text-amber-500">
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
