import { RIG_EXAMPLE_BIPED, type ModelSpec } from '@midnite/studio-shared';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClipPanel } from './clip-panel';
import { ClipTimeline } from './clip-timeline';
import { editorReducer, initialEditorState, type EditorState } from './editor-state';
import { RigPanel } from './rig-panel';
import { advancePlayhead, boneSegments, poseAt, posedScene, rigModel, weightColor } from './rig-pose';
import { INITIAL_RIG_VIEW, type RigView } from './rig-view';
import { editorScene } from './spec-geometry';

/** vitest/jsdom: the rig and clip editing — reducer steps, the posing helpers, and the panels' DOM. */

afterEach(cleanup);

const rigged = (): EditorState => editorReducer(initialEditorState(RIG_EXAMPLE_BIPED, 'gen/robot.obj'), { type: 'anatomy', anatomy: 'biped' });

describe('rig actions in the editor reducer', () => {
  it('auto-rig, a clip and a key are each one undoable step', () => {
    const a = rigged();
    expect(a.spec.rig!.bones.length).toBeGreaterThan(10);
    const b = editorReducer(a, { type: 'clips', ops: [{ op: 'add', clip: { name: 'walk', kind: 'walk' } }] });
    const c = editorReducer(b, { type: 'clips', ops: [{ op: 'setKeys', name: 'walk', keys: [{ bone: 'head', time: 0.2, rotation: [10, 0, 0] }] }] });
    expect(c.spec.animations![0]!.keys).toHaveLength(1);
    expect(c.past).toHaveLength(3);
    const undone = editorReducer(editorReducer(c, { type: 'undo' }), { type: 'undo' });
    expect(undone.spec.animations).toBeUndefined();
    expect(undone.spec.rig).toBeDefined();
  });

  it('a refused edit changes nothing', () => {
    const a = rigged();
    expect(editorReducer(a, { type: 'rig', ops: [{ op: 'removeBone', name: 'hips' }] })).toBe(a);
    expect(editorReducer(a, { type: 'clips', ops: [{ op: 'add', clip: { kind: 'drive' } }] })).toBe(a);
  });

  it('retarget copies clips from another design', () => {
    const source = editorReducer(rigged(), { type: 'clips', ops: [{ op: 'add', clip: { kind: 'run' } }] }).spec;
    const out = editorReducer(rigged(), { type: 'retarget', from: source });
    expect(out.spec.animations!.map((c) => c.name)).toEqual(['run']);
  });
});

describe('posing helpers', () => {
  const spec = editorReducer(rigged(), { type: 'clips', ops: [{ op: 'add', clip: { kind: 'jump' } }] }).spec;
  const scene = editorScene(spec);
  const model = rigModel(spec, scene)!;

  it('the rest pose leaves every vertex where it was; a jump lifts the model', () => {
    const rest = posedScene(scene, model, poseAt(model, undefined, 0));
    expect(rest.parts[0]!.positions[1]).toBeCloseTo(scene.parts[0]!.positions[1]!, 6);
    const clip = spec.animations![0]!;
    const minY = (s: typeof scene) => Math.min(...s.parts.flatMap((p) => p.positions.filter((_, i) => i % 3 === 1)));
    const air = posedScene(scene, model, poseAt(model, clip, 0.45));
    expect(minY(air)).toBeGreaterThan(minY(scene) + 0.02);
    expect(rigModel(spec, scene)).toBe(model);
  });

  it('bones at rest are the rig; the weight ramp runs blue to red', () => {
    const segs = boneSegments(model.rig, poseAt(model, undefined, 0));
    segs.forEach((s, i) => {
      expect(s.head[1]).toBeCloseTo(model.rig.bones[i]!.head[1], 6);
      expect(s.tail[1]).toBeCloseTo(model.rig.bones[i]!.tail[1], 6);
    });
    expect(weightColor(0)).toEqual([0, 0, 1]);
    expect(weightColor(1)).toEqual([1, 0, 0]);
  });

  it('the playhead wraps when looping and stops at the end otherwise', () => {
    const clip = { name: 'w', kind: 'walk' as const, duration: 1 };
    expect(advancePlayhead(clip, 0.9, 0.2, true).time).toBeCloseTo(0.1, 6);
    expect(advancePlayhead(clip, 0.9, 0.2, false)).toEqual({ time: 1, ended: true });
  });
});

/** The panels against the real reducer, the way the inspector mounts them. */
function Harness({ initial, panel }: { initial: EditorState; panel: 'rig' | 'clips' | 'timeline' }) {
  const [state, dispatch] = useReducer(editorReducer, initial);
  const [view, setView] = useState<RigView>(INITIAL_RIG_VIEW);
  const onView = (patch: Partial<RigView>) => setView((v) => ({ ...v, ...patch }));
  const scene = editorScene(state.spec);
  return (
    <>
      <output data-testid="spec">{JSON.stringify({ anatomy: state.spec.anatomy, bones: state.spec.rig?.bones.length ?? 0, falloff: state.spec.rig?.falloff, clips: state.spec.animations?.map((c) => c.name) ?? [], keys: state.spec.animations?.flatMap((c) => c.keys ?? []) ?? [] })}</output>
      <output data-testid="view">{JSON.stringify(view)}</output>
      {panel === 'rig' ? <RigPanel state={state} dispatch={dispatch} view={view} onView={onView} model={rigModel(state.spec, scene)} scene={scene} /> : null}
      {panel === 'clips' ? <ClipPanel state={state} dispatch={dispatch} view={view} onView={onView} /> : null}
      <ClipTimeline spec={state.spec} view={view} onView={onView} />
    </>
  );
}

const specOut = () => JSON.parse(screen.getByTestId('spec').textContent!) as { anatomy?: string; bones: number; falloff?: number; clips: string[]; keys: unknown[] };
const viewOut = () => JSON.parse(screen.getByTestId('view').textContent!) as RigView;

describe('RigPanel', () => {
  it('picks an anatomy, auto-rigs, lists bones and picks one', () => {
    render(<Harness initial={initialEditorState(RIG_EXAMPLE_BIPED as ModelSpec, 'x')} panel="rig" />);
    expect(screen.getByText(/A static object has no bones/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Anatomy'), { target: { value: 'biped' } });
    expect(specOut()).toMatchObject({ anatomy: 'biped' });
    expect(specOut().bones).toBeGreaterThan(10);
    const outliner = screen.getByTestId('bone-outliner');
    fireEvent.click(screen.getByRole('button', { name: 'leftUpperArm' }));
    expect(viewOut().bone).toBe('leftUpperArm');
    expect(screen.getByRole('group', { name: 'Bone leftUpperArm' })).toBeTruthy();
    expect(outliner.querySelector('[aria-selected="true"]')!.textContent).toContain('leftUpperArm');
    fireEvent.click(screen.getByRole('button', { name: 'Weights' }));
    expect(viewOut().weights).toBe(true);
  });

  it('pose mode keys the picked bone into the timeline clip at the playhead', () => {
    const start = editorReducer(rigged(), { type: 'clips', ops: [{ op: 'add', clip: { name: 'wave', kind: 'custom', duration: 2 } }] });
    render(<Harness initial={start} panel="rig" />);
    fireEvent.click(screen.getByRole('button', { name: 'head' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pose mode' }));
    expect(screen.getByText(/Pick a clip on the timeline/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Timeline clip'), { target: { value: 'wave' } });
    fireEvent.change(screen.getByLabelText('Scrub'), { target: { value: '0.5' } });
    expect(screen.getByTestId('pose-key').textContent).toContain('wave at 0.5s');
    const x = screen.getByLabelText('Rotate ° X');
    fireEvent.change(x, { target: { value: '25' } });
    fireEvent.blur(x);
    expect(specOut().keys).toEqual([{ bone: 'head', time: 0.5, rotation: [25, 0, 0] }]);
  });
});

describe('ClipPanel and the timeline', () => {
  it('adds a clip from the presets, edits it, and plays it on the timeline', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    try {
      render(<Harness initial={rigged()} panel="clips" />);
      fireEvent.change(screen.getByLabelText('Add clip'), { target: { value: 'walk' } });
      expect(specOut().clips).toEqual(['walk']);
      expect(viewOut().clip).toBe('walk');
      const speed = screen.getByLabelText('Speed ×');
      fireEvent.change(speed, { target: { value: '2' } });
      fireEvent.blur(speed);
      expect(screen.getByTestId('timeline-time').textContent).toContain('0.55s');
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      act(() => void vi.advanceTimersByTime(200));
      expect(viewOut().time).toBeGreaterThan(0.1);
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(viewOut().playing).toBe(false);
      fireEvent.change(screen.getByLabelText('Scrub'), { target: { value: '0.3' } });
      expect(viewOut().time).toBeCloseTo(0.3, 6);
    } finally {
      vi.useRealTimers();
    }
  });

  it('needs a rig before it offers clips', () => {
    render(<Harness initial={initialEditorState(RIG_EXAMPLE_BIPED, 'x')} panel="clips" />);
    expect(screen.getByText(/Clips need a rig/)).toBeTruthy();
  });
});
