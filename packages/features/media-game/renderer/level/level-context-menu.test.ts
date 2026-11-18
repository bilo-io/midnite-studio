import { describe, expect, it, vi } from 'vitest';

import type { FrameMenuEntry } from '@midnite/studio-frame';

import { levelContextMenu, type LevelMenuActions } from './level-context-menu';
import { addObject, createEditState, selectOnly, addSelected, type EditLevel } from './level-edit-model';
import { blankLevel3d } from './test-helpers';

const setup = () => {
  let s = createEditState(blankLevel3d() as EditLevel);
  const layerId = s.level.layers[0]!.id!;
  for (const x of [100, 200, 300]) s = addObject(s, layerId, { type: 'prop', x, y: 100 });
  const refs = s.level.layers[0]!.objects!.filter((o) => o.type === 'prop').map((o) => ({ layerId, objectId: o.id }));
  return { s, layerId, refs };
};
const actions = (): LevelMenuActions => ({
  cut: vi.fn(), copy: vi.fn(), paste: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), frame: vi.fn(), hide: vi.fn(), lock: vi.fn(),
  selectAllOfType: vi.fn(), selectAll: vi.fn(), align: vi.fn(), addLayer: vi.fn(), saveAsPrefab: vi.fn(), selectInstances: vi.fn(),
});
const ctx = { canPaste: true, readOnly: false };
const labels = (items: FrameMenuEntry[]) => items.map((i) => ('type' in i ? '|' : i.label));

describe('levelContextMenu', () => {
  it('I1: one selected object gets the documented order, without Align', () => {
    const { s, refs } = setup();
    const items = levelContextMenu(selectOnly(s, refs[0]!), { kind: 'object', ref: refs[0]! }, ctx, actions());
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste', 'Duplicate', '|', 'Frame', 'Hide', 'Lock', 'Select all “prop”', '|', 'Delete']);
    expect((items.at(-1) as { danger?: boolean }).danger).toBe(true);
  });

  it('I2: three selected add an Align submenu with six items', () => {
    const { s, refs } = setup();
    const state = addSelected(selectOnly(s, null), refs);
    const items = levelContextMenu(state, { kind: 'object', ref: refs[0]! }, ctx, actions());
    expect(labels(items)).toEqual(['Cut', 'Copy', 'Paste', 'Duplicate', '|', 'Frame', 'Hide', 'Lock', 'Select all “prop”', '|', 'Align', '|', 'Delete']);
    const align = items.find((i) => 'submenu' in i) as { submenu: FrameMenuEntry[] };
    expect(align.submenu).toHaveLength(6);
  });

  it('I3: nothing to paste disables Paste with a reason', () => {
    const { s, refs } = setup();
    const items = levelContextMenu(selectOnly(s, refs[0]!), { kind: 'object', ref: refs[0]! }, { canPaste: false, readOnly: false }, actions());
    const paste = items.find((i) => 'label' in i && i.label === 'Paste') as { disabled?: boolean; disabledReason?: string };
    expect(paste.disabled).toBe(true);
    expect(paste.disabledReason).toBe('Nothing to paste');
  });

  it('I4: a read-only level keeps only Copy, Frame and Select all', () => {
    const { s, refs } = setup();
    const items = levelContextMenu(selectOnly(s, refs[0]!), { kind: 'object', ref: refs[0]! }, { canPaste: true, readOnly: true }, actions());
    expect(labels(items)).toEqual(['Copy', 'Frame', 'Select all “prop”']);
  });

  it('wires each item to its action', () => {
    const { s, refs } = setup();
    const a = actions();
    const items = levelContextMenu(selectOnly(s, refs[0]!), { kind: 'object', ref: refs[0]! }, ctx, a);
    for (const label of ['Cut', 'Copy', 'Duplicate', 'Frame', 'Hide', 'Lock', 'Delete']) (items.find((i) => 'label' in i && i.label === label) as { onSelect(): void }).onSelect();
    (items.find((i) => 'label' in i && i.label.startsWith('Select all')) as { onSelect(): void }).onSelect();
    expect([a.cut, a.copy, a.duplicate, a.frame, a.hide, a.lock, a.remove].every((f) => (f as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true);
    expect(a.selectAllOfType).toHaveBeenCalledWith('prop');
  });

  it('the empty menu pastes at the point, selects all and adds a layer', () => {
    const { s } = setup();
    const a = actions();
    const items = levelContextMenu(s, { kind: 'empty', at: { x: 5, y: 6 } }, ctx, a);
    expect(labels(items)).toEqual(['Paste here', 'Select all', 'Add object layer']);
    (items[0] as { onSelect(): void }).onSelect();
    expect(a.paste).toHaveBeenCalledWith({ x: 5, y: 6 });
  });

  it('the layer menu offers layers and select all in layer; a 3D level has no tile layer', () => {
    const { s, layerId } = setup();
    const a = actions();
    expect(labels(levelContextMenu(s, { kind: 'layer', layerId }, ctx, a))).toEqual(['Add tile layer', 'Add object layer', 'Select all in layer']);
    expect(labels(levelContextMenu(s, { kind: 'layer', layerId }, ctx, a, true))).toEqual(['Add object layer', 'Select all in layer']);
    (levelContextMenu(s, { kind: 'layer', layerId }, ctx, a).at(-1) as { onSelect(): void }).onSelect();
    expect(a.selectAll).toHaveBeenCalledWith(layerId);
  });
});

describe('Copy live position (Phase 140 Theme E)', () => {
  it('is offered only for an object with a live twin, and not when read-only', () => {
    const { s, refs } = setup();
    const withTwin = { ...actions(), copyLivePosition: vi.fn() };
    const state = selectOnly(s, refs[0]!);
    const target = { kind: 'object', ref: refs[0]! } as const;
    expect(labels(levelContextMenu(state, target, { ...ctx, liveTwin: true }, withTwin))).toContain('Copy live position');
    expect(labels(levelContextMenu(state, target, { ...ctx, liveTwin: false }, withTwin))).not.toContain('Copy live position');
    expect(labels(levelContextMenu(state, target, { canPaste: true, readOnly: true, liveTwin: true }, withTwin))).not.toContain('Copy live position');
    const item = levelContextMenu(state, target, { ...ctx, liveTwin: true }, withTwin).find((i) => 'label' in i && i.label === 'Copy live position') as { onSelect: () => void };
    item.onSelect();
    expect(withTwin.copyLivePosition).toHaveBeenCalled();
  });
});

