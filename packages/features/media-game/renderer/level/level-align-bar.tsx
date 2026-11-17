import {
  LuAlignCenterHorizontal,
  LuAlignCenterVertical,
  LuAlignEndHorizontal,
  LuAlignEndVertical,
  LuAlignHorizontalDistributeCenter,
  LuAlignStartHorizontal,
  LuAlignStartVertical,
  LuAlignVerticalDistributeCenter,
} from 'react-icons/lu';

import { IconButton } from '../chrome';
import type { AlignAxis, AlignEdge } from './level-align';

const FEW = 'Select three or more to distribute';

/** Lucide names the axis an icon's line runs along, so "vertical" aligns on X (left, centre, right) and "horizontal" on Y. */
const ALIGN: ReadonlyArray<{ axis: AlignAxis; edge: AlignEdge; label: string; icon: typeof LuAlignStartVertical }> = [
  { axis: 'x', edge: 'min', label: 'Align left', icon: LuAlignStartVertical },
  { axis: 'x', edge: 'centre', label: 'Align centre horizontally', icon: LuAlignCenterVertical },
  { axis: 'x', edge: 'max', label: 'Align right', icon: LuAlignEndVertical },
  { axis: 'y', edge: 'min', label: 'Align top', icon: LuAlignStartHorizontal },
  { axis: 'y', edge: 'centre', label: 'Align middle vertically', icon: LuAlignCenterHorizontal },
  { axis: 'y', edge: 'max', label: 'Align bottom', icon: LuAlignEndHorizontal },
];

/** Align and distribute buttons (Phase 137 Theme E). Rendered by the editor only at two or more selected objects. */
export function LevelAlignBar({ count, onAlign, onDistribute }: { count: number; onAlign: (axis: AlignAxis, edge: AlignEdge) => void; onDistribute: (axis: AlignAxis) => void }) {
  if (count < 2) return null;
  const few = count < 3;
  return (
    <div role="toolbar" aria-label="Align and distribute" data-testid="level-align-bar" className="flex items-center gap-0.5">
      {ALIGN.map(({ axis, edge, label, icon }) => (
        <IconButton key={label} icon={icon} label={label} onClick={() => onAlign(axis, edge)} />
      ))}
      <IconButton
        icon={LuAlignHorizontalDistributeCenter}
        label={few ? FEW : 'Distribute horizontally'}
        disabled={few}
        onClick={() => onDistribute('x')}
      />
      <IconButton
        icon={LuAlignVerticalDistributeCenter}
        label={few ? FEW : 'Distribute vertically'}
        disabled={few}
        onClick={() => onDistribute('y')}
      />
    </div>
  );
}
