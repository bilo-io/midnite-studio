import type { Dispatch } from 'react';
import {
  LuAlignCenterHorizontal,
  LuAlignCenterVertical,
  LuAlignEndHorizontal,
  LuAlignEndVertical,
  LuAlignHorizontalSpaceAround,
  LuAlignStartHorizontal,
  LuAlignStartVertical,
  LuAlignVerticalSpaceAround,
  LuFlipHorizontal2,
  LuGroup,
  LuUngroup,
} from 'react-icons/lu';

import { IconButton } from '../../../components/icon-button';
import type { EditorAction } from './editor-state';
import type { Axis } from './spec-edit';

/**
 * Align / distribute / mirror / group for the current selection. Align and distribute work on
 * world bounding boxes, so they behave the same whatever the parts' own transforms are.
 */
export function ArrangeBar({ count, hasGroup, dispatch }: { count: number; hasGroup: boolean; dispatch: Dispatch<EditorAction> }) {
  const many = count >= 2;
  const align = (axis: Axis, mode: 'min' | 'center' | 'max') => dispatch({ type: 'align', axis, mode });
  const reason = 'Select two or more parts';
  return (
    <div role="toolbar" aria-label="Arrange" className="flex flex-wrap items-center gap-0.5">
      <IconButton icon={LuAlignStartVertical} label="Align left (X min)" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('x', 'min')} />
      <IconButton icon={LuAlignCenterVertical} label="Align centre X" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('x', 'center')} />
      <IconButton icon={LuAlignEndVertical} label="Align right (X max)" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('x', 'max')} />
      <IconButton icon={LuAlignStartHorizontal} label="Align bottom (Y min)" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('y', 'min')} />
      <IconButton icon={LuAlignCenterHorizontal} label="Align centre Y" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('y', 'center')} />
      <IconButton icon={LuAlignEndHorizontal} label="Align top (Y max)" size="sm" disabled={!many} disabledReason={reason} onClick={() => align('y', 'max')} />
      <IconButton icon={LuAlignHorizontalSpaceAround} label="Distribute along X" size="sm" disabled={count < 3} disabledReason="Select three or more parts" onClick={() => dispatch({ type: 'distribute', axis: 'x' })} />
      <IconButton icon={LuAlignVerticalSpaceAround} label="Distribute along Y" size="sm" disabled={count < 3} disabledReason="Select three or more parts" onClick={() => dispatch({ type: 'distribute', axis: 'y' })} />
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <IconButton icon={LuFlipHorizontal2} label="Mirror across X (copy)" size="sm" disabled={count < 1} onClick={() => dispatch({ type: 'mirror', axis: 'x', about: 'origin', copy: true })} />
      <IconButton icon={LuFlipHorizontal2} label="Flip across X (in place)" size="sm" disabled={count < 1} onClick={() => dispatch({ type: 'mirror', axis: 'x', about: 'centre' })} />
      <span aria-hidden className="mx-1 h-4 w-px bg-border" />
      <IconButton icon={LuGroup} label="Group (Cmd/Ctrl+G)" size="sm" disabled={count < 1} onClick={() => dispatch({ type: 'group' })} />
      <IconButton icon={LuUngroup} label="Ungroup (Cmd/Ctrl+Shift+G)" size="sm" disabled={!hasGroup} onClick={() => dispatch({ type: 'ungroup' })} />
    </div>
  );
}
