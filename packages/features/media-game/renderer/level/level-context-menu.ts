/**
 * The level editor's right-click menus (Phase 137 Theme I): pure, no React. `levelContextMenu` turns what was clicked
 * and what can be done into the frame's menu entries; the editor wires the actions and opens the result.
 */
import {
  LuAlignCenterHorizontal,
  LuAlignCenterVertical,
  LuAlignEndHorizontal,
  LuAlignEndVertical,
  LuAlignHorizontalJustifyCenter,
  LuAlignStartHorizontal,
  LuAlignStartVertical,
  LuClipboardPaste,
  LuCopy,
  LuCopyPlus,
  LuEyeOff,
  LuFocus,
  LuLayers,
  LuLock,
  LuPlus,
  LuRadio,
  LuScissors,
  LuTrash2,
} from 'react-icons/lu';

import type { FrameMenuEntry } from '@midnite/studio-frame';

import type { AlignAxis, AlignEdge } from './level-align';
import { findObject, type EditState, type ObjectRef, type PlanPoint } from './level-edit-model';
import { objectType } from './level-outline';

export type LevelMenuTarget = { kind: 'object'; ref: ObjectRef } | { kind: 'empty'; at: PlanPoint } | { kind: 'layer'; layerId: number };

export type LevelMenuActions = {
  cut(): void;
  copy(): void;
  paste(at?: PlanPoint): void;
  duplicate(): void;
  remove(): void;
  frame(): void;
  hide(): void;
  lock(): void;
  selectAllOfType(type: string): void;
  /** Every object of `layerId`, or of the active layer when omitted. */
  selectAll(layerId?: number): void;
  align(axis: AlignAxis, edge: AlignEdge): void;
  addLayer(kind: 'tile' | 'object'): void;
  /** Phase 140 Theme E: take the object's live twin's position, one undo step. */
  copyLivePosition?(): void;
};

const SEP: FrameMenuEntry = { type: 'separator' };
const hint = (chord: string): string => chord;

const ALIGNS: ReadonlyArray<{ axis: AlignAxis; edge: AlignEdge; label: string; icon: typeof LuAlignStartVertical }> = [
  { axis: 'x', edge: 'min', label: 'Align left', icon: LuAlignStartVertical },
  { axis: 'x', edge: 'centre', label: 'Align centre horizontally', icon: LuAlignCenterVertical },
  { axis: 'x', edge: 'max', label: 'Align right', icon: LuAlignEndVertical },
  { axis: 'y', edge: 'min', label: 'Align top', icon: LuAlignStartHorizontal },
  { axis: 'y', edge: 'centre', label: 'Align middle vertically', icon: LuAlignCenterHorizontal },
  { axis: 'y', edge: 'max', label: 'Align bottom', icon: LuAlignEndHorizontal },
];

/** Drop leading, trailing and doubled separators, so an omitted group leaves no stray rule. */
function tidy(entries: FrameMenuEntry[]): FrameMenuEntry[] {
  const out: FrameMenuEntry[] = [];
  for (const e of entries) {
    const isSep = 'type' in e;
    if (isSep && (out.length === 0 || 'type' in out[out.length - 1]!)) continue;
    out.push(e);
  }
  while (out.length > 0 && 'type' in out[out.length - 1]!) out.pop();
  return out;
}

export function levelContextMenu(state: EditState, target: LevelMenuTarget, ctx: { canPaste: boolean; readOnly: boolean; liveTwin?: boolean }, actions: LevelMenuActions, is3d = false): FrameMenuEntry[] {
  const { canPaste, readOnly } = ctx;
  const pasteItem = (label: string, at?: PlanPoint): FrameMenuEntry => ({
    label,
    description: at ? undefined : hint('⌘V'),
    icon: LuClipboardPaste,
    disabled: !canPaste,
    disabledReason: canPaste ? undefined : 'Nothing to paste',
    onSelect: () => actions.paste(at),
  });
  if (target.kind === 'object') {
    const object = findObject(state.level, target.ref);
    const type = object ? objectType(object) : '';
    const many = state.selected.length >= 2;
    const selectType: FrameMenuEntry = { label: type ? `Select all “${type}”` : 'Select all', icon: LuLayers, onSelect: () => (type ? actions.selectAllOfType(type) : actions.selectAll(target.ref.layerId)) };
    const frame: FrameMenuEntry = { label: 'Frame', description: hint('F'), icon: LuFocus, onSelect: actions.frame };
    const copy: FrameMenuEntry = { label: 'Copy', description: hint('⌘C'), icon: LuCopy, onSelect: actions.copy };
    if (readOnly) return [copy, frame, selectType];
    return tidy([
      { label: 'Cut', description: hint('⌘X'), icon: LuScissors, onSelect: actions.cut },
      copy,
      pasteItem('Paste'),
      { label: 'Duplicate', description: hint('⌘D'), icon: LuCopyPlus, onSelect: actions.duplicate },
      SEP,
      frame,
      ...(ctx.liveTwin && actions.copyLivePosition ? [{ label: 'Copy live position', icon: LuRadio, onSelect: actions.copyLivePosition } as FrameMenuEntry] : []),
      { label: 'Hide', icon: LuEyeOff, onSelect: actions.hide },
      { label: 'Lock', icon: LuLock, onSelect: actions.lock },
      selectType,
      SEP,
      many
        ? {
            label: 'Align',
            icon: LuAlignHorizontalJustifyCenter,
            submenu: ALIGNS.map((a) => ({ label: a.label, icon: a.icon, onSelect: () => actions.align(a.axis, a.edge) })),
          }
        : SEP,
      SEP,
      { label: 'Delete', description: hint('⌫'), icon: LuTrash2, danger: true, onSelect: actions.remove },
    ]);
  }
  if (target.kind === 'empty') {
    const at = target.at;
    const selectAll: FrameMenuEntry = { label: 'Select all', icon: LuLayers, onSelect: () => actions.selectAll() };
    if (readOnly) return [selectAll];
    return [pasteItem('Paste here', at), selectAll, { label: 'Add object layer', icon: LuPlus, onSelect: () => actions.addLayer('object') }];
  }
  const layerId = target.layerId;
  const selectInLayer: FrameMenuEntry = { label: 'Select all in layer', icon: LuLayers, onSelect: () => actions.selectAll(layerId) };
  if (readOnly) return [selectInLayer];
  return [
    ...(is3d ? [] : [{ label: 'Add tile layer', icon: LuPlus, onSelect: () => actions.addLayer('tile') } as FrameMenuEntry]),
    { label: 'Add object layer', icon: LuPlus, onSelect: () => actions.addLayer('object') },
    selectInLayer,
  ];
}
