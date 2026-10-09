import { clipTiming, MODEL_CLIP_DEFAULTS, MODEL_CLIP_LABELS, MODEL_CLIP_PRESETS, type ModelClipKind, type ModelSpec } from '@midnite/studio-shared';
import { useState, type Dispatch } from 'react';
import { LuCopy, LuPlay, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import type { EditorAction, EditorState } from './editor-state';
import { FIELD, NumberField, SECTION, TextField } from './fields';
import type { RigView, UpdateRigView } from './rig-view';

/** Another model in the library whose clips can be copied here. */
export type RetargetSource = { key: string; label: string; load: () => Promise<ModelSpec | null> };

/**
 * The inspector's Animation tab: the design's clips (added from the anatomy's presets, or `custom`
 * for pose-mode keys), the picked clip's parameters, and copying clips from another rigged model.
 * Picking a clip puts it on the timeline.
 */
export function ClipPanel({
  state,
  dispatch,
  view,
  onView,
  sources = [],
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  view: RigView;
  onView: UpdateRigView;
  sources?: readonly RetargetSource[];
}) {
  const { spec } = state;
  const anatomy = spec.anatomy ?? 'static';
  const clips = spec.animations ?? [];
  const rigged = anatomy !== 'static' && (spec.rig?.bones.length ?? 0) > 0;
  const clip = clips.find((c) => c.name === view.clip);

  if (!rigged) {
    return <p className="text-[11px] text-muted-foreground">Clips need a rig. Set an anatomy and press Auto-rig in the Rig tab first.</p>;
  }

  const kinds: ModelClipKind[] = [...MODEL_CLIP_PRESETS[anatomy], 'custom'];
  const add = (kind: ModelClipKind) => {
    let name: string = kind;
    for (let n = 2; clips.some((c) => c.name === name); n += 1) name = `${kind} ${n}`;
    dispatch({ type: 'clips', ops: [{ op: 'add', clip: { name, kind } }] });
    onView({ clip: name, time: 0 });
  };
  const update = (fields: Record<string, unknown>) => clip && dispatch({ type: 'clips', ops: [{ op: 'update', name: clip.name, fields }] });

  return (
    <div className="flex h-full min-h-0 gap-2">
      <div className="flex w-44 shrink-0 flex-col gap-1">
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Add
          <select aria-label="Add clip" value="" onChange={(event) => event.target.value && add(event.target.value as ModelClipKind)} className={`${FIELD} min-w-0 flex-1`}>
            <option value="">Clip…</option>
            {kinds.map((kind) => (
              <option key={kind} value={kind}>
                {MODEL_CLIP_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <ul aria-label="Clips" className="hide-scrollbar min-h-0 flex-1 overflow-auto rounded-md border border-border/60 py-0.5" data-testid="clip-list">
          {clips.length === 0 ? <li className="px-1.5 py-1 text-[11px] text-muted-foreground">No clips yet.</li> : null}
          {clips.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                aria-pressed={c.name === view.clip}
                onClick={() => onView({ clip: c.name, time: 0, playing: false })}
                className={`flex w-full items-center gap-1 truncate px-1.5 py-0.5 text-left text-[11px] ${c.name === view.clip ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
              >
                <span className="truncate">{c.name}</span>
                <span className="ml-auto shrink-0 tabular-nums text-[10px] opacity-70">{clipTiming(c).duration.toFixed(1)}s</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="hide-scrollbar flex min-w-0 flex-1 flex-col gap-1.5 overflow-auto">
        {clip ? (
          <div className="flex flex-col gap-1.5" role="group" aria-label={`Clip ${clip.name}`}>
            <div className="flex items-center gap-1">
              <p className={SECTION}>{MODEL_CLIP_LABELS[clip.kind]}</p>
              <span className="ml-auto flex">
                <IconButton icon={LuPlay} label="Play on the timeline" size="sm" onClick={() => onView({ playing: true })} />
                <IconButton
                  icon={LuTrash2}
                  label="Remove clip"
                  size="sm"
                  onClick={() => {
                    dispatch({ type: 'clips', ops: [{ op: 'remove', name: clip.name }] });
                    onView({ clip: null, time: 0, playing: false });
                  }}
                />
              </span>
            </div>
            <TextField
              label="Name"
              value={clip.name}
              onCommit={(name) => {
                update({ name });
                onView({ clip: name });
              }}
            />
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['Duration s', 'duration', clip.duration, MODEL_CLIP_DEFAULTS[clip.kind].duration, 0.1, 0.1, 30],
                  ['Speed ×', 'speed', clip.speed, 1, 0.1, 0.1, 4],
                  ['Intensity', 'intensity', clip.intensity, 1, 0.1, 0, 2],
                ] as const
              ).map(([label, key, value, fallback, step, min, max]) => (
                <label key={key} className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="shrink-0">{label}</span>
                  <NumberField label={label} value={value} placeholder={String(fallback)} step={step} min={min} max={max} onCommit={(v) => update({ [key]: v ?? null })} />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={clipTiming(clip).loop} onChange={(event) => update({ loop: event.target.checked })} />
                Loop
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={clip.inPlace ?? true} onChange={(event) => update({ inPlace: event.target.checked })} />
                In place
              </label>
              <span className="ml-auto">
                {(clip.keys ?? []).length} {(clip.keys ?? []).length === 1 ? 'key' : 'keys'}
              </span>
              {(clip.keys ?? []).length > 0 ? (
                <button type="button" className="underline-offset-2 hover:underline" onClick={() => dispatch({ type: 'clips', ops: [{ op: 'clearKeys', name: clip.name }] })}>
                  Clear keys
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Add a clip from the presets, or pick one to edit it and play it on the timeline.</p>
        )}
        {sources.length > 0 ? <Retarget sources={sources} dispatch={dispatch} /> : null}
      </div>
    </div>
  );
}

function Retarget({ sources, dispatch }: { sources: readonly RetargetSource[]; dispatch: Dispatch<EditorAction> }) {
  const [key, setKey] = useState('');
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const source = sources.find((s) => s.key === key);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-1.5 text-[11px] text-muted-foreground">
      <span className={SECTION}>Retarget</span>
      <select aria-label="Copy clips from" value={key} onChange={(event) => setKey(event.target.value)} className={`${FIELD} min-w-0 max-w-[12rem]`}>
        <option value="">Copy clips from…</option>
        {sources.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />
        Replace same-named
      </label>
      <IconButton
        icon={LuCopy}
        label="Copy clips"
        size="sm"
        disabled={!source || busy}
        onClick={async () => {
          if (!source) return;
          setBusy(true);
          const from = await source.load().catch(() => null);
          setBusy(false);
          if (!from) return setNote('Could not read that model.');
          dispatch({ type: 'retarget', from, replace });
          setNote(`Copied ${(from.animations ?? []).length} clip(s) from ${source.label}.`);
        }}
      />
      {note ? <span role="status">{note}</span> : null}
    </div>
  );
}
