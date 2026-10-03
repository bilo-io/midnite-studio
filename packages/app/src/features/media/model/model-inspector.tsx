import type { ModelPart } from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';
import { LuCopy, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { tidy, type PartPatch, type Vec3 } from './editor-state';

/**
 * The editor's parts list and property fields — plain DOM (the app's own
 * controls, no extra UI library): a row per part, and for the selected one its
 * name, colour and position / rotation / scale. Numbers are drafted while
 * typing and committed on Enter or blur, so one edit is one undo step.
 */
export function ModelInspector({
  parts,
  selected,
  onSelect,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  parts: readonly ModelPart[];
  selected: number | null;
  onSelect: (index: number) => void;
  onPatch: (index: number, patch: PartPatch) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const part = selected !== null ? parts[selected] : undefined;
  return (
    <div className="flex h-44 shrink-0 border-t border-border/60 text-xs" data-testid="model-inspector">
      <ul aria-label="Parts" className="hide-scrollbar w-44 shrink-0 overflow-auto border-r border-border/60 py-1">
        {parts.map((p, index) => (
          <li key={index}>
            <button
              type="button"
              aria-current={index === selected || undefined}
              onClick={() => onSelect(index)}
              className={`flex w-full items-center gap-2 truncate px-2 py-1 text-left ${
                index === selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground/70">{p.shape}</span>
            </button>
          </li>
        ))}
      </ul>
      {part && selected !== null ? (
        <div className="hide-scrollbar flex min-w-0 flex-1 flex-col gap-2 overflow-auto p-2" role="group" aria-label={`Properties of ${part.name}`}>
          <div className="flex items-center gap-2">
            <TextField label="Name" value={part.name} onCommit={(name) => onPatch(selected, { name })} />
            <ColorField value={part.color} onCommit={(color) => onPatch(selected, { color })} />
            <span className="ml-auto flex">
              <IconButton icon={LuCopy} label="Duplicate part" size="sm" onClick={() => onDuplicate(selected)} />
              <IconButton
                icon={LuTrash2}
                label="Delete part"
                size="sm"
                disabled={parts.length <= 1}
                onClick={() => onRemove(selected)}
              />
            </span>
          </div>
          <VecRow label="Position" value={part.position} step={0.05} onCommit={(position) => onPatch(selected, { position })} />
          <VecRow label="Rotation °" value={part.rotation} step={5} onCommit={(rotation) => onPatch(selected, { rotation })} />
          <VecRow label="Scale" value={part.scale} step={0.05} min={0.01} onCommit={(scale) => onPatch(selected, { scale })} />
        </div>
      ) : (
        <p className="flex flex-1 items-center justify-center p-4 text-center text-muted-foreground">
          Select a part in the list or the viewport to move, rotate, scale or recolour it.
        </p>
      )}
    </div>
  );
}

const FIELD = 'h-6 min-w-0 rounded-md border border-border bg-background px-1.5 text-xs text-foreground';

function TextField({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
      {label}
      <input
        aria-label={label}
        value={draft}
        maxLength={60}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        className={`${FIELD} min-w-0 flex-1`}
      />
    </label>
  );
}

/** A native colour input; the native `change` event (picker closed) is the one commit. */
function ColorField({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const hex = value.length === 4 ? `#${[...value.slice(1)].map((c) => c + c).join('')}` : value;
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const onChange = () => onCommit(input.value);
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [onCommit]);
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      Colour
      <input ref={ref} aria-label="Colour" type="color" defaultValue={hex} key={hex} className="h-6 w-8 cursor-pointer rounded border border-border bg-background p-0.5" />
    </label>
  );
}

function VecRow({
  label,
  value,
  step,
  min,
  onCommit,
}: {
  label: string;
  value: readonly number[];
  step: number;
  min?: number;
  onCommit: (value: Vec3) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <NumberField
          key={axis}
          label={`${label} ${axis}`}
          value={value[i]!}
          step={step}
          {...(min !== undefined ? { min } : {})}
          onCommit={(next) => {
            const out = [...value] as Vec3;
            out[i] = next;
            onCommit(out);
          }}
        />
      ))}
    </div>
  );
}

function NumberField({ label, value, step, min, onCommit }: { label: string; value: number; step: number; min?: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(tidy(value)));
  useEffect(() => setDraft(String(tidy(value))), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) return setDraft(String(tidy(value)));
    const next = min !== undefined ? Math.max(parsed, min) : parsed;
    if (next !== value) onCommit(tidy(next));
    else setDraft(String(tidy(value)));
  };
  return (
    <input
      aria-label={label}
      type="number"
      step={step}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      className={`${FIELD} w-0 flex-1 tabular-nums`}
    />
  );
}
