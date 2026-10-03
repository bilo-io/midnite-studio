import type { ModelPart, ModelSpec } from '@midnite/studio-shared';
import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import {
  LuBox,
  LuChevronDown,
  LuChevronRight,
  LuCircle,
  LuCopy,
  LuCylinder,
  LuDonut,
  LuEgg,
  LuEye,
  LuEyeOff,
  LuFolder,
  LuGrid3X3,
  LuHexagon,
  LuLayers,
  LuLock,
  LuLockOpen,
  LuPill,
  LuShapes,
  LuSpline,
  LuSquare,
  LuTriangle,
  LuTriangleRight,
  LuWaypoints,
  LuWine,
} from 'react-icons/lu';

import type { IconComponent } from '../../../components/icon-button';
import type { EditorAction, EditorState } from './editor-state';
import { buildOutline, rangeBetween } from './outliner';

const SHAPE_ICONS: Record<ModelPart['shape'], IconComponent> = {
  box: LuBox,
  sphere: LuCircle,
  cylinder: LuCylinder,
  cone: LuTriangle,
  torus: LuDonut,
  lathe: LuWine,
  extrude: LuLayers,
  capsule: LuPill,
  roundedBox: LuSquare,
  wedge: LuTriangleRight,
  prism: LuHexagon,
  ellipsoid: LuEgg,
  tube: LuSpline,
  sweep: LuWaypoints,
  loft: LuShapes,
  mesh: LuGrid3X3,
  group: LuFolder,
  instance: LuCopy,
};
export const shapeIcon = (shape: ModelPart['shape']): IconComponent => SHAPE_ICONS[shape] ?? LuBox;

const OP_BADGE = { union: '∪', subtract: '−', intersect: '∩' } as const;

/**
 * The parts tree: indent by depth, collapse groups, eye / lock toggles, click / Cmd-click /
 * Shift-click selection, double-click to rename, drag a row onto another to re-parent it (world
 * transform kept; a drop that would make a loop is refused by the reducer).
 */
export function Outliner({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { spec, selection, selected } = state;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<number | null>(null);
  const [dropOn, setDropOn] = useState<number | 'root' | null>(null);
  const dragging = useRef<number | null>(null);
  const rows = useMemo(() => buildOutline(spec, collapsed), [spec, collapsed]);
  const keyOf = (spec: ModelSpec, i: number): string => spec.parts[i]!.id ?? String(i);

  const pick = (index: number, event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (event.metaKey || event.ctrlKey) dispatch({ type: 'toggleSelect', index });
    else if (event.shiftKey && selected !== null) dispatch({ type: 'selectMany', indices: rangeBetween(rows, selected, index) });
    else dispatch({ type: 'select', index });
  };

  return (
    <ul
      aria-label="Parts"
      className="hide-scrollbar min-h-0 flex-1 overflow-auto py-1"
      onDragOver={(event) => {
        if (dragging.current !== null) {
          event.preventDefault();
          setDropOn('root');
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        if (dragging.current !== null) dispatch({ type: 'reparent', index: dragging.current, parent: null });
        dragging.current = null;
        setDropOn(null);
      }}
    >
      {rows.map((row) => {
        const part = spec.parts[row.index]!;
        const Icon = shapeIcon(part.shape);
        const isSelected = selection.includes(row.index);
        return (
          <li
            key={row.index}
            draggable={renaming !== row.index}
            onDragStart={() => {
              dragging.current = row.index;
            }}
            onDragEnd={() => {
              dragging.current = null;
              setDropOn(null);
            }}
            onDragOver={(event) => {
              if (dragging.current === null) return;
              event.preventDefault();
              event.stopPropagation();
              setDropOn(row.index);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (dragging.current !== null && dragging.current !== row.index) {
                dispatch({ type: 'reparent', index: dragging.current, parent: row.index });
              }
              dragging.current = null;
              setDropOn(null);
            }}
            className={`flex items-center gap-0.5 pr-1 ${isSelected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground'} ${
              dropOn === row.index ? 'outline outline-1 outline-primary' : ''
            } ${row.hidden ? 'opacity-50' : ''}`}
            style={{ paddingLeft: 4 + row.depth * 12 }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                aria-label={row.collapsed ? 'Expand' : 'Collapse'}
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    const key = keyOf(spec, row.index);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                className="flex h-5 w-4 shrink-0 items-center justify-center"
              >
                {row.collapsed ? <LuChevronRight aria-hidden className="h-3 w-3" /> : <LuChevronDown aria-hidden className="h-3 w-3" />}
              </button>
            ) : (
              <span aria-hidden className="w-4 shrink-0" />
            )}
            {renaming === row.index ? (
              <RenameInput
                value={part.name}
                onDone={(name) => {
                  setRenaming(null);
                  if (name && name !== part.name) dispatch({ type: 'patch', index: row.index, patch: { name } });
                }}
              />
            ) : (
              <button
                type="button"
                aria-current={isSelected || undefined}
                onClick={(event) => pick(row.index, event)}
                onDoubleClick={() => setRenaming(row.index)}
                className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left text-xs"
              >
                <Icon aria-hidden className="h-3 w-3 shrink-0" />
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-sm border border-border" style={{ background: part.color }} />
                <span className="truncate">{part.name}</span>
                {part.op ? (
                  <span title={`Boolean ${part.op}`} className="rounded bg-primary/15 px-1 text-[10px] text-primary">
                    {OP_BADGE[part.op]}
                  </span>
                ) : null}
                <span className="ml-auto text-[10px] text-muted-foreground/70">{part.shape}</span>
              </button>
            )}
            <button
              type="button"
              aria-label={part.hidden ? 'Show' : 'Hide'}
              aria-pressed={part.hidden === true}
              title={part.hidden ? 'Show' : 'Hide'}
              onClick={() => dispatch({ type: 'patchMany', indices: [row.index], patch: { hidden: part.hidden ? undefined : true } })}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            >
              {part.hidden ? <LuEyeOff aria-hidden className="h-3 w-3" /> : <LuEye aria-hidden className="h-3 w-3" />}
            </button>
            <button
              type="button"
              aria-label={part.locked ? 'Unlock' : 'Lock'}
              aria-pressed={part.locked === true}
              title={part.locked ? 'Unlock' : 'Lock'}
              onClick={() => dispatch({ type: 'patchMany', indices: [row.index], patch: { locked: part.locked ? undefined : true } })}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent"
            >
              {part.locked ? <LuLock aria-hidden className="h-3 w-3" /> : <LuLockOpen aria-hidden className="h-3 w-3 opacity-40" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function RenameInput({ value, onDone }: { value: string; onDone: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.select(), []);
  return (
    <input
      ref={ref}
      aria-label="Rename part"
      value={draft}
      maxLength={60}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onDone(draft.trim())}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onDone(draft.trim());
        else if (event.key === 'Escape') onDone(value);
      }}
      className="h-5 min-w-0 flex-1 rounded border border-border bg-background px-1 text-xs text-foreground"
    />
  );
}
