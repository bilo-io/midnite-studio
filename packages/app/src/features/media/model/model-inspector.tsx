import { descendantIndices, type BuildIssue, type ModelPart } from '@midnite/studio-shared';
import { useState, type Dispatch } from 'react';
import { LuCopy, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import { ArrangeBar } from './arrange-bar';
import { BooleanPanel } from './boolean-panel';
import { ClipPanel, type RetargetSource } from './clip-panel';
import type { EditorAction, EditorState } from './editor-state';
import { ColorField, NumberField, SECTION, SelectField, TextField, VecRow } from './fields';
import { MaterialPanel } from './material-panel';
import { MeshPanel, type ConvertFn } from './mesh-panel';
import { ModifierPanel } from './modifier-panel';
import { Outliner } from './outliner-panel';
import { RigPanel } from './rig-panel';
import type { RigModel } from './rig-pose';
import type { RigView, UpdateRigView } from './rig-view';
import type { EditorScene } from './spec-geometry';

/**
 * The editor's dock: the outliner on the left, and on the right tabs for the selected part —
 * Properties (name, transform, dimensions, parent), Material, Boolean and Modifiers. With several
 * parts selected it shows the arrange tools and edits material for all of them. Rig and Animation
 * are about the whole design, so they show whatever is selected.
 */
const TABS = ['Properties', 'Material', 'Boolean', 'Modifiers', 'Mesh', 'Rig', 'Animation'] as const;
type Tab = (typeof TABS)[number];
const DESIGN_TABS: ReadonlySet<Tab> = new Set(['Mesh', 'Rig', 'Animation']);

/** What the Rig and Animation tabs share with the viewport and the timeline. */
export type InspectorRig = { view: RigView; onView: UpdateRigView; model: RigModel | null; scene: EditorScene; sources?: readonly RetargetSource[] };

/** Keys every part has: not shown as shape dimensions. */
const BASE_KEYS = new Set([
  'id', 'name', 'shape', 'position', 'rotation', 'scale', 'color', 'parent', 'pivot', 'material', 'modifiers', 'op', 'target', 'segments', 'smoothAngle', 'hidden', 'locked', 'source',
]);

export function ModelInspector({
  state,
  dispatch,
  issues,
  rig,
  onConvert,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  issues: readonly BuildIssue[];
  rig?: InspectorRig;
  /** Converts the design's primitives to a sculpt mesh (Phase 104 Theme B); the Mesh tab shows only with it. */
  onConvert?: ConvertFn;
}) {
  const [tab, setTab] = useState<Tab>('Properties');
  const { spec, selected, selection } = state;
  const part = selected !== null ? spec.parts[selected] : undefined;
  const hasGroup = selection.some((i) => spec.parts[i]?.shape === 'group');
  const available = (name: Tab): boolean => (name === 'Mesh' ? !!onConvert : name === 'Rig' || name === 'Animation' ? !!rig : true);
  const designTab = DESIGN_TABS.has(tab) && available(tab);

  return (
    <div className="flex h-56 shrink-0 border-t border-border/60 text-xs" data-testid="model-inspector">
      <div className="flex w-52 shrink-0 flex-col border-r border-border/60">
        <Outliner state={state} dispatch={dispatch} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div role="tablist" aria-label="Part panels" className="flex shrink-0 items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
          {TABS.filter(available).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              onClick={() => setTab(name)}
              className={`h-5 rounded px-1.5 text-[11px] ${tab === name ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'}`}
            >
              {name}
            </button>
          ))}
          <span className="ml-auto" />
          {designTab ? null : <ArrangeBar count={selection.length} hasGroup={hasGroup} dispatch={dispatch} />}
        </div>
        {designTab ? (
          <div className="hide-scrollbar min-h-0 flex-1 overflow-auto p-2" role="group" aria-label={tab === 'Rig' ? 'Rig' : tab === 'Mesh' ? 'Mesh tools' : 'Animation'}>
            {tab === 'Mesh' && onConvert ? (
              <MeshPanel state={state} dispatch={dispatch} onConvert={onConvert} />
            ) : rig && tab === 'Rig' ? (
              <RigPanel state={state} dispatch={dispatch} view={rig.view} onView={rig.onView} model={rig.model} scene={rig.scene} />
            ) : rig ? (
              <ClipPanel state={state} dispatch={dispatch} view={rig.view} onView={rig.onView} {...(rig.sources ? { sources: rig.sources } : {})} />
            ) : null}
          </div>
        ) : part && selected !== null ? (
          <div className="hide-scrollbar min-h-0 flex-1 overflow-auto p-2" role="group" aria-label={`Properties of ${part.name}`}>
            {selection.length > 1 ? (
              <p className="mb-2 flex items-center gap-2 text-muted-foreground">
                {selection.length} parts selected — edits apply to all of them; showing {part.name}.
                <span className="ml-auto flex">
                  <IconButton icon={LuCopy} label="Duplicate part" size="sm" onClick={() => dispatch({ type: 'duplicate' })} />
                  <IconButton icon={LuTrash2} label="Delete part" size="sm" disabled={selection.length >= spec.parts.length} onClick={() => dispatch({ type: 'remove' })} />
                </span>
              </p>
            ) : null}
            {tab === 'Properties' ? <Properties state={state} part={part} index={selected} dispatch={dispatch} /> : null}
            {tab === 'Material' ? <MaterialPanel part={part} indices={selection} dispatch={dispatch} /> : null}
            {tab === 'Boolean' ? <BooleanPanel spec={spec} index={selected} selectionCount={selection.length} issues={issues} dispatch={dispatch} /> : null}
            {tab === 'Modifiers' ? <ModifierPanel part={part} index={selected} dispatch={dispatch} /> : null}
          </div>
        ) : (
          <p className="flex flex-1 items-center justify-center p-4 text-center text-muted-foreground">
            Select a part in the outliner or the viewport to move, rotate, scale, recolour or add modifiers to it. Shift-click for several.
          </p>
        )}
      </div>
    </div>
  );
}

function Properties({ state, part, index, dispatch }: { state: EditorState; part: ModelPart; index: number; dispatch: Dispatch<EditorAction> }) {
  const { spec, selection } = state;
  const patch = (p: Record<string, unknown>) => (selection.length > 1 ? dispatch({ type: 'patchMany', indices: selection, patch: p }) : dispatch({ type: 'patch', index, patch: p }));
  const record = part as Record<string, unknown>;
  // An imported mesh's counts describe the file, they are not dimensions to edit.
  const numericKeys = part.shape === 'asset' || part.shape === 'sculpt' ? [] : Object.keys(record).filter((k) => !BASE_KEYS.has(k) && typeof record[k] === 'number');
  const vecKeys = Object.keys(record).filter(
    (k) => !BASE_KEYS.has(k) && Array.isArray(record[k]) && (record[k] as unknown[]).length === 3 && (record[k] as unknown[]).every((n) => typeof n === 'number'),
  );
  const below = new Set([index, ...descendantIndices(spec.parts, index)]);
  const parentOptions = [
    { value: '', label: '(scene root)' },
    ...spec.parts.map((p, i) => ({ p, i })).filter(({ i }) => !below.has(i)).map(({ p, i }) => ({ value: String(i), label: `${p.name} (#${i + 1})` })),
  ];
  const parentIndex = part.parent ? spec.parts.findIndex((p) => p.id === part.parent || p.name === part.parent) : -1;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <TextField label="Name" value={part.name} onCommit={(name) => patch({ name })} />
        <ColorField value={part.color} onCommit={(color) => patch({ color })} />
        {selection.length <= 1 ? (
          <span className="ml-auto flex">
            <IconButton icon={LuCopy} label="Duplicate part" size="sm" onClick={() => dispatch({ type: 'duplicate', index })} />
            <IconButton icon={LuTrash2} label="Delete part" size="sm" disabled={spec.parts.length <= 1} onClick={() => dispatch({ type: 'remove', index })} />
          </span>
        ) : null}
      </div>
      <VecRow label="Position" value={part.position} step={0.05} onCommit={(position) => patch({ position })} />
      <VecRow label="Rotation °" value={part.rotation} step={5} onCommit={(rotation) => patch({ rotation })} />
      <VecRow label="Scale" value={part.scale} step={0.05} nonZero onCommit={(scale) => patch({ scale })} />
      <VecRow label="Pivot" value={part.pivot ?? [0, 0, 0]} step={0.05} onCommit={(pivot) => patch({ pivot: pivot.every((n) => n === 0) ? undefined : pivot })} />
      {vecKeys.length + numericKeys.length > 0 ? <p className={SECTION}>{part.shape}</p> : null}
      {vecKeys.map((key) => (
        <VecRow key={key} label={labelFor(key)} value={record[key] as number[]} step={0.05} {...(key === 'size' || key === 'radii' ? { min: 0.001 } : {})} onCommit={(v) => patch({ [key]: v })} />
      ))}
      {numericKeys.map((key) => (
        <label key={key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="w-16 shrink-0">{labelFor(key)}</span>
          <NumberField
            label={labelFor(key)}
            value={record[key] as number}
            step={key === 'sides' ? 1 : 0.05}
            {...(key === 'sides' ? { integer: true, min: 3, max: 64 } : { min: 0 })}
            onCommit={(v) => v !== undefined && patch({ [key]: v })}
          />
        </label>
      ))}
      {part.shape === 'asset' || part.shape === 'sculpt' ? (
        <>
          <p className={SECTION}>{part.shape === 'sculpt' ? 'sculpt mesh' : 'imported mesh'}</p>
          <p className="text-[11px] text-muted-foreground" data-testid={part.shape === 'sculpt' ? 'sculpt-part-info' : 'asset-part-info'}>
            <span className="font-mono text-foreground">{part.src}</span>
            {part.vertices !== undefined ? ` · ${part.vertices.toLocaleString()} verts` : ''}
            {part.triangles !== undefined ? ` · ${part.triangles.toLocaleString()} tris` : ''}
            {part.shape === 'sculpt' && part.multiresLevel ? ` · multires ${part.multiresLevel}` : ''}
          </p>
        </>
      ) : null}
      {part.shape !== 'group' && part.shape !== 'asset' && part.shape !== 'sculpt' ? (
        <div className="flex gap-3">
          <label className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-16 shrink-0">Segments</span>
            <NumberField label="Segments" value={part.segments} placeholder="32" step={1} integer min={3} max={96} onCommit={(segments) => patch({ segments })} />
          </label>
          <label className="flex flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-16 shrink-0">Smooth °</span>
            <NumberField label="Smooth angle" value={part.smoothAngle} placeholder="auto" step={5} min={0} max={180} onCommit={(smoothAngle) => patch({ smoothAngle })} />
          </label>
        </div>
      ) : null}
      {part.shape === 'instance' ? (
        <SelectField
          label="Copies"
          value={part.source}
          options={spec.parts.filter((p, i) => i !== index && p.shape !== 'instance').map((p) => ({ value: p.id ?? p.name, label: p.name }))}
          onChange={(source) => patch({ source })}
        />
      ) : null}
      <SelectField
        label="Parent"
        value={parentIndex >= 0 ? String(parentIndex) : ''}
        options={parentOptions}
        onChange={(value) => dispatch({ type: 'reparent', index, parent: value === '' ? null : Number(value) })}
      />
    </div>
  );
}

const labelFor = (key: string): string => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
