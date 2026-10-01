import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { LuGripVertical, LuPlus } from 'react-icons/lu';

import { SLASH_ITEMS, type SlashContext, type SlashItem } from './slash-commands';

/**
 * A grip beside the top-level block under the pointer (Phase 99 Theme B).
 * Dragging it hands ProseMirror a node selection of that block as the drag
 * slice — the same move ProseMirror does for a dragged node — so dropping
 * reorders blocks through the editor's own drop handling and undo history.
 *
 * Hand-rolled rather than `@tiptap/extension-drag-handle`, which peers on the
 * collaboration stack (`y-tiptap`, `extension-collaboration`) this editor has
 * no use for.
 */
type Target = { pos: number; top: number; height: number };

/**
 * Insert a new block of `item`'s type directly below the top-level block at
 * `pos` and put the caret in it. Reuses the slash menu's registry: the item's
 * `run` is handed an empty range inside a fresh empty paragraph.
 */
export function insertBlockBelow(
  editor: Editor,
  pos: number,
  item: SlashItem,
  ctx: SlashContext,
): void {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const at = pos + node.nodeSize;
  editor
    .chain()
    .insertContentAt(at, { type: 'paragraph' })
    .setTextSelection(at + 1)
    .run();
  item.run(editor, { from: at + 1, to: at + 1 }, ctx);
}

export function BlockDragHandle({
  editor,
  container,
  ctx,
}: {
  editor: Editor;
  container: HTMLElement | null;
  ctx: SlashContext;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menu, setMenu] = useState<{ pos: number; left: number; top: number } | null>(null);
  const menuOpen = useRef(false);
  const addRef = useRef<HTMLButtonElement>(null);
  menuOpen.current = menu !== null;

  useEffect(() => {
    if (!container) return;
    const onMove = (event: MouseEvent) => {
      if (editor.isDestroyed || menuOpen.current) return;
      const view = editor.view;
      const editorRect = view.dom.getBoundingClientRect();
      // Probe just inside the text column so the gutter still resolves a block.
      const hit = view.posAtCoords({
        left: Math.max(event.clientX, editorRect.left + 8),
        top: event.clientY,
      });
      if (!hit) return;
      const $pos = view.state.doc.resolve(hit.pos);
      if ($pos.depth < 1) return;
      const pos = $pos.before(1);
      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return;
      const box = dom.getBoundingClientRect();
      const host = container.getBoundingClientRect();
      setTarget({
        pos,
        top: box.top - host.top + container.scrollTop,
        height: Math.min(box.height, 28),
      });
    };
    const onLeave = () => {
      if (!menuOpen.current) setTarget(null);
    };
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, container]);

  if (!target) return null;

  return (
    <>
      <button
        type="button"
        ref={addRef}
        aria-label="Add block below"
        aria-haspopup="menu"
        aria-expanded={menu?.pos === target.pos}
        data-testid="doc-add-block"
        className="absolute left-0.5 flex w-4 items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        style={{ top: target.top, height: target.height }}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setMenu({ pos: target.pos, left: rect.left, top: rect.bottom + 4 });
        }}
      >
        <LuPlus aria-hidden className="h-3.5 w-3.5" />
      </button>
      {menu ? (
        <BlockTypeMenu
          left={menu.left}
          top={menu.top}
          onClose={(restoreFocus) => {
            setMenu(null);
            if (restoreFocus) addRef.current?.focus();
          }}
          onPick={(item) => {
            setMenu(null);
            insertBlockBelow(editor, menu.pos, item, ctx);
          }}
        />
      ) : null}
      <button
        type="button"
        draggable
        aria-label="Drag to move block"
        data-testid="doc-drag-handle"
        className="absolute left-[18px] flex w-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
        style={{ top: target.top, height: target.height }}
        onDragStart={(event) => {
          const view = editor.view;
          const selection = NodeSelection.create(view.state.doc, target.pos);
          view.dispatch(view.state.tr.setSelection(selection));
          const dom = view.nodeDOM(target.pos);
          if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(
            'text/plain',
            selection.content().content.textBetween(0, selection.content().content.size, '\n'),
          );
          view.dragging = { slice: selection.content(), move: true };
        }}
        onClick={() => editor.chain().focus().setNodeSelection(target.pos).run()}
      >
        <LuGripVertical aria-hidden className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

export function BlockTypeMenu({
  left,
  top,
  onClose,
  onPick,
}: {
  left: number;
  top: number;
  onClose: (restoreFocus?: boolean) => void;
  onPick: (item: SlashItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (event.key === 'ArrowDown') focusAt(index + 1);
    else if (event.key === 'ArrowUp') focusAt(index - 1);
    else if (event.key === 'Home') focusAt(0);
    else if (event.key === 'End') focusAt(items.length - 1);
    else if (event.key === 'Escape') onClose(true);
    else if (event.key !== 'Tab') return;
    else onClose();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Insert block below"
      className="fixed z-50 max-h-72 w-52 overflow-auto rounded-md border border-border bg-popover py-1 text-xs shadow-lg"
      style={{ left, top }}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onClose();
      }}
    >
      {SLASH_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => onPick(item)}
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-muted-foreground hover:bg-primary/10 hover:text-foreground focus:bg-primary/10 focus:text-foreground focus:outline-none"
        >
          <item.icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
          {item.label}
        </button>
      ))}
    </div>
  );
}
