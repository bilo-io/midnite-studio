import {
  MODEL_ANATOMIES,
  MODEL_ANATOMY_LABELS,
  MODEL_BONE_TABLE,
  MODEL_FACINGS,
  MODEL_RIG_FALLOFF_DEFAULT,
  type ModelAnatomy,
  type ModelFacing,
  partBindings,
} from '@midnite/studio-shared';
import type { Dispatch } from 'react';
import { LuBone, LuEye, LuPersonStanding, LuWandSparkles } from 'react-icons/lu';

import type { EditorAction, EditorState } from './editor-state';
import { FIELD, SECTION, SelectField, SliderField, VecRow } from './fields';
import { clipNamed, type RigModel } from './rig-pose';
import type { RigView, UpdateRigView } from './rig-view';
import type { EditorScene } from './spec-geometry';

/**
 * The inspector's Rig tab: the anatomy and Auto-rig, the bone outliner, the picked bone's head,
 * tail and parent, skin falloff, part binding, and pose mode — keying the picked bone's rotation
 * into the timeline's clip at the playhead. Every edit is one `rig`/`clips`/`anatomy` action, so
 * it undoes like any other.
 */

const TOGGLE = 'flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px]';
const toggleClass = (on: boolean): string =>
  `${TOGGLE} ${on ? 'border-primary/60 bg-primary/15 text-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`;

const round = (n: number): number => Math.round(n * 1000) / 1000;

export function RigPanel({
  state,
  dispatch,
  view,
  onView,
  model,
  scene,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  view: RigView;
  onView: UpdateRigView;
  model: RigModel | null;
  scene: EditorScene;
}) {
  const { spec } = state;
  const anatomy: ModelAnatomy = spec.anatomy ?? 'static';
  const facing: ModelFacing = spec.rig?.facing ?? '+z';
  const rig = model?.rig ?? null;

  const header = (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        Anatomy
        <select
          aria-label="Anatomy"
          value={anatomy}
          onChange={(event) => dispatch({ type: 'anatomy', anatomy: event.target.value as ModelAnatomy })}
          className={FIELD}
        >
          {MODEL_ANATOMIES.map((a) => (
            <option key={a} value={a}>
              {MODEL_ANATOMY_LABELS[a]}
            </option>
          ))}
        </select>
      </label>
      {anatomy !== 'static' ? (
        <>
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Faces
            <select aria-label="Facing" value={facing} onChange={(event) => dispatch({ type: 'anatomy', anatomy, facing: event.target.value as ModelFacing })} className={FIELD}>
              {MODEL_FACINGS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={toggleClass(false)} onClick={() => dispatch({ type: 'anatomy', anatomy, facing })}>
            <LuWandSparkles aria-hidden className="h-3.5 w-3.5" />
            {rig ? 'Re-rig' : 'Auto-rig'}
          </button>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
          <button type="button" aria-pressed={view.bones} className={toggleClass(view.bones)} onClick={() => onView({ bones: !view.bones })}>
            <LuBone aria-hidden className="h-3.5 w-3.5" />
            Bones
          </button>
          <button type="button" aria-pressed={view.weights} disabled={!rig} className={toggleClass(view.weights)} onClick={() => onView({ weights: !view.weights })}>
            <LuEye aria-hidden className="h-3.5 w-3.5" />
            Weights
          </button>
          <button type="button" aria-pressed={view.pose} disabled={!rig} className={toggleClass(view.pose)} onClick={() => onView({ pose: !view.pose })}>
            <LuPersonStanding aria-hidden className="h-3.5 w-3.5" />
            Pose mode
          </button>
        </>
      ) : null}
    </div>
  );

  if (anatomy === 'static' || !rig) {
    return (
      <div className="flex flex-col gap-2">
        {header}
        <p className="text-[11px] text-muted-foreground">
          {anatomy === 'static'
            ? 'A static object has no bones. Pick biped, quadruped or vehicle to place a rig from the parts, then animate it in the Animation tab.'
            : 'No rig yet — press Auto-rig to place bones from the parts.'}
        </p>
      </div>
    );
  }

  const depth = (i: number): number => {
    let d = 0;
    let at = rig.bones[i]!.parent;
    while (at !== null && d < 64) {
      d += 1;
      at = rig.bones[at]!.parent;
    }
    return d;
  };
  const boneIndex = view.bone === null ? -1 : (rig.byName.get(view.bone) ?? -1);
  const picked = boneIndex >= 0 ? rig.bones[boneIndex]! : null;
  const missing = MODEL_BONE_TABLE[anatomy].filter((t) => !rig.byName.has(t.name));

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {header}
      <div className="flex min-h-0 flex-1 gap-2">
        <ul role="tree" aria-label="Bones" className="hide-scrollbar w-44 shrink-0 overflow-auto rounded-md border border-border/60 py-0.5" data-testid="bone-outliner">
          {rig.bones.map((bone, i) => (
            <li key={bone.name} role="treeitem" aria-selected={bone.name === view.bone} aria-level={depth(i) + 1}>
              <button
                type="button"
                onClick={() => onView({ bone: bone.name === view.bone ? null : bone.name })}
                className={`flex w-full items-center gap-1 truncate py-0.5 pr-1 text-left font-mono text-[10.5px] ${bone.name === view.bone ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}`}
                style={{ paddingLeft: 6 + depth(i) * 8 }}
              >
                <LuBone aria-hidden className="h-3 w-3 shrink-0 opacity-60" />
                {bone.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="hide-scrollbar flex min-w-0 flex-1 flex-col gap-1.5 overflow-auto">
          <SliderField
            label="Skin falloff"
            value={spec.rig?.falloff ?? MODEL_RIG_FALLOFF_DEFAULT}
            min={0}
            max={1}
            step={0.05}
            onCommit={(value) => dispatch({ type: 'rig', ops: [{ op: 'falloff', value }] })}
          />
          {picked ? (
            <BoneFields state={state} dispatch={dispatch} view={view} onView={onView} model={model!} scene={scene} index={boneIndex} />
          ) : (
            <p className="text-[11px] text-muted-foreground">Pick a bone in the list or the viewport to move it, bind parts to it or pose it.</p>
          )}
          {missing.length > 0 ? (
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              Add bone
              <select
                aria-label="Add bone"
                value=""
                className={FIELD}
                onChange={(event) => {
                  const def = MODEL_BONE_TABLE[anatomy].find((t) => t.name === event.target.value);
                  if (!def) return;
                  const parent = def.parent ? rig.bones[rig.byName.get(def.parent) ?? -1] : undefined;
                  const head = parent ? parent.tail : ([0, 0, 0] as [number, number, number]);
                  dispatch({ type: 'rig', ops: [{ op: 'setBone', name: def.name, head, tail: [head[0], head[1] + 0.1, head[2]] }] });
                  onView({ bone: def.name });
                }}
              >
                <option value="">Choose…</option>
                {missing.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function BoneFields({
  state,
  dispatch,
  view,
  onView,
  model,
  scene,
  index,
}: {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  view: RigView;
  onView: UpdateRigView;
  model: RigModel;
  scene: EditorScene;
  index: number;
}) {
  const { spec } = state;
  const { rig } = model;
  const bone = rig.bones[index]!;
  const anatomy = rig.anatomy;
  const table = MODEL_BONE_TABLE[anatomy];
  const parentName = bone.parent === null ? '' : rig.bones[bone.parent]!.name;
  const set = (fields: { head?: [number, number, number]; tail?: [number, number, number]; parent?: string | null }) =>
    dispatch({ type: 'rig', ops: [{ op: 'setBone', name: bone.name, ...fields }] });

  const solids = model.solids.map((i) => scene.parts[i]!);
  const bindings = partBindings(spec, rig, solids);
  const boundParts = [...new Set(solids.filter((_, k) => bindings[k] === index).map((p) => spec.parts[p.sourceIndex]?.name ?? p.name))];
  const part = state.selected !== null ? spec.parts[state.selected] : undefined;
  const partRef = part ? (part.id ?? part.name) : null;
  const explicit = partRef ? spec.rig?.bind?.[partRef] : undefined;

  const clip = clipNamed(spec, view.clip);
  // Keys live in the clip's own (unscaled) time; the playhead runs in played time.
  const keyTime = round(view.time * (clip?.speed ?? 1));
  const keyAt = clip?.keys?.find((k) => k.bone === bone.name && Math.abs(k.time - keyTime) < 1e-3);
  const keyRotation = keyAt?.rotation ?? [0, 0, 0];

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label={`Bone ${bone.name}`}>
      <p className={SECTION}>{bone.name}</p>
      <VecRow label="Head" value={bone.head} step={0.01} onCommit={(head) => set({ head })} />
      <VecRow label="Tail" value={bone.tail} step={0.01} onCommit={(tail) => set({ tail })} />
      {bone.parent !== null || table.find((t) => t.name === bone.name)?.parent ? (
        <SelectField
          label="Parent"
          value={parentName}
          options={[{ value: '', label: '(table default)' }, ...rig.bones.filter((b) => b.name !== bone.name).map((b) => ({ value: b.name, label: b.name }))]}
          onChange={(value) => set({ parent: value === '' ? null : value })}
        />
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Moves {boundParts.length === 0 ? 'no part directly' : boundParts.join(', ')}.
      </p>
      {part && partRef ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <button
            type="button"
            className={toggleClass(explicit === bone.name)}
            onClick={() => dispatch({ type: 'rig', ops: [{ op: 'bind', part: partRef, bone: explicit === bone.name ? null : bone.name }] })}
          >
            {explicit === bone.name ? `Unbind ${part.name}` : `Bind ${part.name} here`}
          </button>
          {explicit && explicit !== bone.name ? <span>(bound to {explicit})</span> : null}
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <button type="button" className={toggleClass(false)} onClick={() => dispatch({ type: 'rig', ops: [{ op: 'removeBone', name: bone.name }] })}>
          Remove bone
        </button>
        <button type="button" className={toggleClass(false)} onClick={() => onView({ bone: null })}>
          Deselect
        </button>
      </div>
      {view.pose ? (
        clip ? (
          <div className="flex flex-col gap-1.5 rounded-md border border-primary/30 p-1.5" data-testid="pose-key">
            <p className={SECTION}>
              Pose — {clip.name} at {keyTime}s
            </p>
            <VecRow
              label="Rotate °"
              value={keyRotation}
              step={5}
              onCommit={(rotation) =>
                dispatch({ type: 'clips', ops: [{ op: 'setKeys', name: clip.name, keys: [{ bone: bone.name, time: keyTime, rotation: rotation.map(round) as [number, number, number] }] }] })
              }
            />
            <button type="button" className={toggleClass(false)} onClick={() => dispatch({ type: 'clips', ops: [{ op: 'clearKeys', name: clip.name, bone: bone.name }] })}>
              Clear {bone.name} keys
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Pick a clip on the timeline (or add one in the Animation tab) to key this bone.</p>
        )
      ) : null}
    </div>
  );
}
