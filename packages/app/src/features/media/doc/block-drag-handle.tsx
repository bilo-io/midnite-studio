import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { useEffect, useState } from 'react';
import { LuGripVertical } from 'react-icons/lu';

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

export function BlockDragHandle({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!container) return;
    const onMove = (event: MouseEvent) => {
      if (editor.isDestroyed) return;
      const view = editor.view;
      const editorRect = view.dom.getBoundingClientRect();
      // Probe just inside the text column so the gutter still resolves a block.
      const hit = view.posAtCoords({ left: Math.max(event.clientX, editorRect.left + 8), top: event.clientY });
      if (!hit) return;
      const $pos = view.state.doc.resolve(hit.pos);
      if ($pos.depth < 1) return;
      const pos = $pos.before(1);
      const dom = view.nodeDOM(pos);
      if (!(dom instanceof HTMLElement)) return;
      const box = dom.getBoundingClientRect();
      const host = container.getBoundingClientRect();
      setTarget({ pos, top: box.top - host.top + container.scrollTop, height: Math.min(box.height, 28) });
    };
    const onLeave = () => setTarget(null);
    container.addEventListener('mousemove', onMove);
    container.addEventListener('mouseleave', onLeave);
    return () => {
      container.removeEventListener('mousemove', onMove);
      container.removeEventListener('mouseleave', onLeave);
    };
  }, [editor, container]);

  if (!target) return null;

  return (
    <button
      type="button"
      draggable
      aria-label="Drag to move block"
      data-testid="doc-drag-handle"
      className="absolute left-1 flex w-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-accent hover:text-foreground"
      style={{ top: target.top, height: target.height }}
      onDragStart={(event) => {
        const view = editor.view;
        const selection = NodeSelection.create(view.state.doc, target.pos);
        view.dispatch(view.state.tr.setSelection(selection));
        const dom = view.nodeDOM(target.pos);
        if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', selection.content().content.textBetween(0, selection.content().content.size, '\n'));
        view.dragging = { slice: selection.content(), move: true };
      }}
      onClick={() => editor.chain().focus().setNodeSelection(target.pos).run()}
    >
      <LuGripVertical aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}
