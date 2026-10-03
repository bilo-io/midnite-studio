import { ModelSpecSchema } from '@midnite/studio-shared';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useReducer } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { resolveKey } from './editor-keys';
import { editorReducer, initialEditorState } from './editor-state';
import { ModelInspector } from './model-inspector';
import { boundsOf, distanceBetween, formatSize, orthoZoom, sizeOf } from './scene-bounds';
import { editorScene } from './spec-geometry';

afterEach(cleanup);

const spec = ModelSpecSchema.parse({
  name: 'rig',
  parts: [
    { name: 'base', shape: 'box', size: [1, 1, 1] },
    { name: 'knob', shape: 'sphere', radius: 0.5, position: [3, 0, 0] },
    { name: 'tip', shape: 'cone', radius: 0.5, height: 1, position: [6, 0, 0] },
  ],
});

let latest = initialEditorState(spec);
function Harness() {
  const [state, dispatch] = useReducer(editorReducer, undefined, () => initialEditorState(spec));
  latest = state;
  return <ModelInspector state={state} dispatch={dispatch} issues={editorScene(state.spec).issues} />;
}
const row = (name: string) => within(screen.getByRole('list', { name: 'Parts' })).getByRole('button', { name: new RegExp(name) });

describe('outliner', () => {
  it('selects with click, Cmd-click toggle and Shift-click range', () => {
    render(<Harness />);
    fireEvent.click(row('base'));
    expect(latest.selection).toEqual([0]);
    fireEvent.click(row('tip'), { shiftKey: true });
    expect(latest.selection).toEqual([0, 1, 2]);
    fireEvent.click(row('knob'), { metaKey: true });
    expect(latest.selection).toEqual([0, 2]);
  });

  it('renames on double click', () => {
    render(<Harness />);
    fireEvent.doubleClick(row('knob'));
    const input = screen.getByRole('textbox', { name: 'Rename part' });
    fireEvent.change(input, { target: { value: 'handle' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(latest.spec.parts[1]!.name).toBe('handle');
  });

  it('toggles visibility and lock from the row', () => {
    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Hide' })[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Lock' })[1]!);
    expect(latest.spec.parts[0]!.hidden).toBe(true);
    expect(latest.spec.parts[1]!.locked).toBe(true);
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy();
  });

  it('groups a multi-selection from the arrange bar and collapses it', () => {
    render(<Harness />);
    fireEvent.click(row('base'));
    fireEvent.click(row('knob'), { metaKey: true });
    fireEvent.click(screen.getByRole('button', { name: /^Group/ }));
    expect(latest.spec.parts[0]!.shape).toBe('group');
    expect(within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    expect(within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('re-parents by dragging a row onto another, and refuses a loop', () => {
    render(<Harness />);
    const items = within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('listitem');
    fireEvent.dragStart(items[2]!);
    fireEvent.dragOver(items[0]!);
    fireEvent.drop(items[0]!);
    expect(latest.spec.parts[2]!.parent).toBeTruthy();
    const after = within(screen.getByRole('list', { name: 'Parts' })).getAllByRole('listitem');
    // The tip now sits under base; dropping base on tip would loop.
    const before = latest;
    fireEvent.dragStart(after[0]!);
    fireEvent.drop(after[1]!);
    expect(latest.spec).toBe(before.spec);
  });
});

describe('panels', () => {
  const selectBase = () => {
    render(<Harness />);
    fireEvent.click(row('base'));
  };

  it('Properties shows shape dimensions and a negative scale is accepted', () => {
    selectBase();
    expect((screen.getByRole('spinbutton', { name: 'Size X' }) as HTMLInputElement).value).toBe('1');
    const x = screen.getByRole('spinbutton', { name: 'Scale X' });
    fireEvent.change(x, { target: { value: '-1' } });
    fireEvent.blur(x);
    expect(latest.spec.parts[0]!.scale[0]).toBe(-1);
  });

  it('Material presets set PBR values and colour in one undo step', () => {
    selectBase();
    fireEvent.click(screen.getByRole('tab', { name: 'Material' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gold' }));
    expect(latest.spec.parts[0]!.material).toMatchObject({ metalness: 1, roughness: 0.22 });
    expect(latest.spec.parts[0]!.color).toBe('#d4af37');
    expect(latest.past).toHaveLength(1);
  });

  it('Modifiers: add, edit, reorder, disable, remove', () => {
    selectBase();
    fireEvent.click(screen.getByRole('tab', { name: 'Modifiers' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Add modifier' }), { target: { value: 'bevel' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Add modifier' }), { target: { value: 'array' } });
    expect(latest.spec.parts[0]!.modifiers!.map((m) => m.type)).toEqual(['bevel', 'array']);
    const amount = screen.getByRole('spinbutton', { name: 'Bevel Amount' });
    fireEvent.change(amount, { target: { value: '0.2' } });
    fireEvent.blur(amount);
    expect(latest.spec.parts[0]!.modifiers![0]).toMatchObject({ type: 'bevel', amount: 0.2 });
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);
    expect(latest.spec.parts[0]!.modifiers!.map((m) => m.type)).toEqual(['array', 'bevel']);
    fireEvent.click(screen.getAllByRole('button', { name: 'Disable modifier' })[0]!);
    expect(latest.spec.parts[0]!.modifiers![0]!.enabled).toBe(false);
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove modifier' })[0]!);
    expect(latest.spec.parts[0]!.modifiers!.map((m) => m.type)).toEqual(['bevel']);
  });

  it('Boolean: set an operation and target, and subtract the selection from the first', () => {
    selectBase();
    fireEvent.click(row('knob'));
    fireEvent.click(screen.getByRole('tab', { name: 'Boolean' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Operation' }), { target: { value: 'subtract' } });
    expect(latest.spec.parts[1]!.op).toBe('subtract');
    const target = screen.getByRole('combobox', { name: 'Target' }) as HTMLSelectElement;
    fireEvent.change(target, { target: { value: 'base' } });
    expect(latest.spec.parts[1]!.target).toBe('base');
    expect((screen.getByRole('button', { name: 'Subtract selection from first' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Arrange: align and distribute need enough parts', () => {
    render(<Harness />);
    fireEvent.click(row('base'));
    expect(screen.getByRole('button', { name: 'Align left (X min)' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(row('tip'), { shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Align left (X min)' }));
    expect(latest.past).toHaveLength(1);
  });
});

describe('keys', () => {
  const s = initialEditorState(spec);
  const sel = { ...s, selection: [0, 1], selected: 1 };
  it('maps shortcuts to edits and view commands', () => {
    expect(resolveKey({ key: 'g', mod: true, shift: false }, sel, 0.1)).toEqual({ kind: 'dispatch', action: { type: 'group' } });
    expect(resolveKey({ key: 'g', mod: true, shift: true }, sel, 0.1)).toEqual({ kind: 'dispatch', action: { type: 'ungroup' } });
    expect(resolveKey({ key: 'G', mod: false, shift: false }, sel, 0.1)).toEqual({ kind: 'ui', command: 'grid' });
    expect(resolveKey({ key: 'ArrowLeft', mod: false, shift: true }, sel, 0.1)).toEqual({ kind: 'dispatch', action: { type: 'nudge', delta: [-1, 0, 0] } });
    expect(resolveKey({ key: '1', mod: false, shift: false }, s, 0.1)).toEqual({ kind: 'ui', command: 'camera:front' });
    expect(resolveKey({ key: 'v', mod: true, shift: false }, s, 0.1)).toBeNull();
    expect(resolveKey({ key: 'Delete', mod: false, shift: false }, s, 0.1)).toBeNull();
    expect(resolveKey({ key: 'h', mod: false, shift: false }, sel, 0.1)).toEqual({
      kind: 'dispatch',
      action: { type: 'patchMany', indices: [0, 1], patch: { hidden: true } },
    });
    expect(resolveKey({ key: 'H', mod: false, shift: true }, sel, 0.1)).toEqual({ kind: 'dispatch', action: { type: 'showAll' } });
  });
});

describe('scene bounds', () => {
  it('measures the solid parts, optionally for a subset', () => {
    const scene = editorScene(spec);
    const all = boundsOf(scene.parts)!;
    expect(sizeOf(all)[0]).toBeCloseTo(6.5 + 0.5, 1);
    const one = boundsOf(scene.parts, new Set([0]))!;
    expect(formatSize(sizeOf(one))).toBe('1 × 1 × 1');
    expect(distanceBetween([0, 0, 0], [3, 4, 0])).toBe(5);
    expect(orthoZoom([2, 1], { width: 260, height: 260 })).toBeCloseTo(100, 5);
  });
});
