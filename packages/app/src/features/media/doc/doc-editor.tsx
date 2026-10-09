import type { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { LuBold, LuCode, LuItalic, LuLink, LuSparkles } from 'react-icons/lu';

import { useOptionalDialogs } from '../../../components/dialog-host';
import { MARKDOWN_PROSE_CLASSES } from '../../markdown/prose';
import { BlockDragHandle } from './block-drag-handle';
import { docExtensions } from './doc-extensions';
import { normalizeMarkdown } from './doc-thread';
import { createSlashStore, SlashCommand, type SlashContext, type SlashStore } from './slash-commands';

/**
 * The Docs editor (Phase 99 Theme B) — Tiptap over plain markdown, with a
 * `/` menu, a selection bubble menu and a per-block drag handle.
 *
 * This module is the lazy chunk: `docs-tab.tsx` reaches it only through
 * `React.lazy`, so none of Tiptap, ProseMirror or lowlight loads until the
 * Docs tab shows a doc. The parent remounts it (`key`) whenever the content
 * must come from outside — a doc switch, a reload, an accepted AI edit.
 */
export type DocEditorHandle = {
  getMarkdown: () => string;
  /** The selection as markdown, or `undefined` when nothing is selected. */
  getSelectionMarkdown: () => string | undefined;
};

export type DocEditorProps = {
  markdown: string;
  onChange: (markdown: string) => void;
  onReady?: (handle: DocEditorHandle | null) => void;
  /** Ask AI — from the `/` menu (no selection) or the bubble menu (selection). */
  onAskAi: (selection: string | undefined) => void;
};

export function selectionMarkdown(editor: Editor): string | undefined {
  const { from, to, empty } = editor.state.selection;
  if (empty) return undefined;
  const slice = editor.state.doc.slice(from, to);
  const nodes = (slice.content.toJSON() ?? []) as JSONContent[];
  // A selection inside one block is inline content; give it its paragraph back.
  const content = slice.content.firstChild?.isInline ? [{ type: 'paragraph', content: nodes }] : nodes;
  const md = editor.markdown?.serialize({ type: 'doc', content }) ?? '';
  return md.trim().length > 0 ? md.trim() : undefined;
}

export default function DocEditor({ markdown, onChange, onReady, onAskAi }: DocEditorProps) {
  const store = useMemo<SlashStore>(() => createSlashStore(), []);
  const askRef = useRef(onAskAi);
  askRef.current = onAskAi;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const dialogs = useOptionalDialogs();
  const dialogsRef = useRef(dialogs);
  dialogsRef.current = dialogs;
  // One context for the `/` menu and the "+" inserter; read through refs so the
  // editor (created once) always sees the latest callbacks.
  const ctx = useMemo<SlashContext>(
    () => ({
      onAskAi: () => askRef.current(undefined),
      promptImage: (insert) =>
        dialogsRef.current?.prompt({
          title: 'Image',
          label: 'Image URL',
          placeholder: 'https://',
          confirmLabel: 'Insert',
          onConfirm: (src) => {
            if (src.trim() !== '') insert(src.trim());
          },
        }),
    }),
    [],
  );
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      ...docExtensions(),
      SlashCommand.configure({ store, ctx }),
    ],
    content: markdown,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        // ProseMirror splits `class` on single spaces; the prose constant is multi-line.
        class: `min-h-full max-w-none px-10 py-6 text-sm leading-relaxed outline-none ${MARKDOWN_PROSE_CLASSES}`
          .replace(/\s+/g, ' ')
          .trim(),
        'aria-label': 'Document',
        'data-testid': 'doc-editor',
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current(normalizeMarkdown(e.getMarkdown())),
  });

  useEffect(() => {
    if (!editor) return;
    onReady?.({
      getMarkdown: () => normalizeMarkdown(editor.getMarkdown()),
      getSelectionMarkdown: () => selectionMarkdown(editor),
    });
    return () => onReady?.(null);
  }, [editor, onReady]);

  if (!editor) return null;

  return (
    <div ref={setScroller} className="relative h-full min-h-0 overflow-auto" data-selectable>
      <BlockDragHandle editor={editor} container={scroller} ctx={ctx} />
      <EditorContent editor={editor} className="h-full" />
      <SelectionBubble editor={editor} onAskAi={(sel) => askRef.current(sel)} />
      <SlashMenu store={store} />
    </div>
  );
}

function SelectionBubble({ editor, onAskAi }: { editor: Editor; onAskAi: (selection: string | undefined) => void }) {
  const dialogs = useOptionalDialogs();
  const marks = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      code: e.isActive('code'),
      link: e.isActive('link'),
    }),
  });

  const setLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? '';
    const apply = (href: string) => {
      const chain = editor.chain().focus().extendMarkRange('link');
      if (href.trim() === '') chain.unsetLink().run();
      else chain.setLink({ href: href.trim() }).run();
    };
    if (!dialogs) return;
    dialogs.prompt({
      title: 'Link',
      label: 'URL',
      initialValue: current,
      placeholder: 'https://',
      confirmLabel: 'Apply',
      onConfirm: apply,
    });
  };

  const button = (label: string, active: boolean, Icon: typeof LuBold, run: () => void) => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`flex h-7 w-7 items-center justify-center rounded ${
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-lg"
    >
      {button('Bold', marks.bold, LuBold, () => editor.chain().focus().toggleBold().run())}
      {button('Italic', marks.italic, LuItalic, () => editor.chain().focus().toggleItalic().run())}
      {button('Inline code', marks.code, LuCode, () => editor.chain().focus().toggleCode().run())}
      {button('Link', marks.link, LuLink, setLink)}
      <span className="mx-0.5 h-4 w-px bg-border" />
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAskAi(selectionMarkdown(editor))}
        className="flex h-7 items-center gap-1 rounded px-1.5 text-xs text-foreground hover:bg-accent"
      >
        <LuSparkles aria-hidden className="h-3.5 w-3.5 text-primary" />
        Ask AI
      </button>
    </BubbleMenu>
  );
}

function SlashMenu({ store }: { store: SlashStore }) {
  const state = useSyncExternalStore(store.subscribe, store.get);
  if (!state || state.items.length === 0 || !state.rect) return null;
  return (
    <ul
      role="listbox"
      aria-label="Insert block"
      className="fixed z-50 max-h-72 w-56 overflow-auto rounded-md border border-border bg-popover py-1 text-xs shadow-lg"
      style={{ left: state.rect.left, top: state.rect.bottom + 4 }}
    >
      {state.items.map((item, index) => (
        <li
          key={item.id}
          role="option"
          aria-selected={index === state.active}
          onMouseDown={(e) => {
            e.preventDefault();
            state.pick(item);
          }}
          className={`cursor-pointer px-2 py-1.5 ${
            index === state.active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60'
          } ${item.id === 'ai' ? 'font-medium text-primary' : ''}`}
        >
          {item.label}
        </li>
      ))}
    </ul>
  );
}
