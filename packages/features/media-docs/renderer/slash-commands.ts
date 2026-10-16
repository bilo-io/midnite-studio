import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion, {
  exitSuggestion,
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import type { IconType } from 'react-icons';
import {
  LuCode,
  LuHeading1,
  LuHeading2,
  LuHeading3,
  LuHeading4,
  LuHeading5,
  LuHeading6,
  LuImage,
  LuInfo,
  LuLightbulb,
  LuMessageSquareWarning,
  LuOctagonAlert,
  LuTriangleAlert,
  LuList,
  LuListChecks,
  LuListOrdered,
  LuMinus,
  LuQuote,
  LuSparkles,
  LuTable,
} from 'react-icons/lu';

/**
 * The Docs `/` menu (Phase 99 Theme B). The suggestion plugin finds the
 * trigger and the query; what to show lives in a tiny external store the
 * React editor subscribes to, so the menu is ordinary JSX rather than a
 * `ReactRenderer` portal.
 */
export type SlashItem = {
  id: string;
  label: string;
  keywords: string;
  /** Glyph shown by the per-block "+" inserter menu. */
  icon: IconType;
  run: (editor: Editor, range: Range, ctx: SlashContext) => void;
};

export type SlashContext = {
  onAskAi: () => void;
  /** Asks for an image URL (+ alt text) and hands it back; absent where there is no dialog host. */
  promptImage?: (insert: (src: string) => void) => void;
};

const chain = (editor: Editor, range: Range) => editor.chain().focus().deleteRange(range);

export const SLASH_ITEMS: readonly SlashItem[] = [
  {
    id: 'h1',
    label: 'Heading 1',
    keywords: 'title h1',
    icon: LuHeading1,
    run: (e, r) => chain(e, r).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    keywords: 'subtitle h2',
    icon: LuHeading2,
    run: (e, r) => chain(e, r).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    keywords: 'h3',
    icon: LuHeading3,
    run: (e, r) => chain(e, r).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'h4',
    label: 'Heading 4',
    keywords: 'h4',
    icon: LuHeading4,
    run: (e, r) => chain(e, r).setNode('heading', { level: 4 }).run(),
  },
  {
    id: 'h5',
    label: 'Heading 5',
    keywords: 'h5',
    icon: LuHeading5,
    run: (e, r) => chain(e, r).setNode('heading', { level: 5 }).run(),
  },
  {
    id: 'h6',
    label: 'Heading 6',
    keywords: 'h6',
    icon: LuHeading6,
    run: (e, r) => chain(e, r).setNode('heading', { level: 6 }).run(),
  },
  {
    id: 'bullet',
    label: 'Bulleted list',
    keywords: 'ul unordered',
    icon: LuList,
    run: (e, r) => chain(e, r).toggleBulletList().run(),
  },
  {
    id: 'ordered',
    label: 'Numbered list',
    keywords: 'ol ordered',
    icon: LuListOrdered,
    run: (e, r) => chain(e, r).toggleOrderedList().run(),
  },
  {
    id: 'todo',
    label: 'To-do list',
    keywords: 'task checkbox',
    icon: LuListChecks,
    run: (e, r) => chain(e, r).toggleTaskList().run(),
  },
  {
    id: 'quote',
    label: 'Quote',
    keywords: 'blockquote',
    icon: LuQuote,
    run: (e, r) => chain(e, r).toggleBlockquote().run(),
  },
  {
    id: 'code',
    label: 'Code block',
    keywords: 'pre fence',
    icon: LuCode,
    run: (e, r) => chain(e, r).toggleCodeBlock().run(),
  },
  {
    id: 'callout-note',
    label: 'Note callout',
    keywords: 'callout alert admonition note',
    icon: LuInfo,
    run: (e, r) => chain(e, r).wrapIn('blockquote', { callout: 'note' }).run(),
  },
  {
    id: 'callout-tip',
    label: 'Tip callout',
    keywords: 'callout alert admonition tip',
    icon: LuLightbulb,
    run: (e, r) => chain(e, r).wrapIn('blockquote', { callout: 'tip' }).run(),
  },
  {
    id: 'callout-important',
    label: 'Important callout',
    keywords: 'callout alert admonition important',
    icon: LuMessageSquareWarning,
    run: (e, r) => chain(e, r).wrapIn('blockquote', { callout: 'important' }).run(),
  },
  {
    id: 'callout-warning',
    label: 'Warning callout',
    keywords: 'callout alert admonition warning',
    icon: LuTriangleAlert,
    run: (e, r) => chain(e, r).wrapIn('blockquote', { callout: 'warning' }).run(),
  },
  {
    id: 'callout-caution',
    label: 'Caution callout',
    keywords: 'callout alert admonition caution',
    icon: LuOctagonAlert,
    run: (e, r) => chain(e, r).wrapIn('blockquote', { callout: 'caution' }).run(),
  },
  {
    id: 'image',
    label: 'Image',
    keywords: 'picture photo img',
    icon: LuImage,
    run: (e, r, ctx) => {
      chain(e, r).run();
      ctx.promptImage?.((src) => e.chain().focus().setImage({ src }).run());
    },
  },
  {
    id: 'table',
    label: 'Table',
    keywords: 'grid',
    icon: LuTable,
    run: (e, r) => chain(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'divider',
    label: 'Divider',
    keywords: 'hr rule',
    icon: LuMinus,
    run: (e, r) => chain(e, r).setHorizontalRule().run(),
  },
  {
    id: 'ai',
    label: 'Ask AI',
    keywords: 'assistant edit rewrite',
    icon: LuSparkles,
    run: (e, r, ctx) => {
      chain(e, r).run();
      ctx.onAskAi();
    },
  },
];

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SLASH_ITEMS];
  return SLASH_ITEMS.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q));
}

// --- the menu's state, outside React ------------------------------------------

export type SlashMenuState = {
  items: SlashItem[];
  active: number;
  rect: DOMRect | null;
  pick: (item: SlashItem) => void;
} | null;

export function createSlashStore() {
  let state: SlashMenuState = null;
  const listeners = new Set<() => void>();
  const set = (next: SlashMenuState) => {
    state = next;
    for (const l of listeners) l();
  };
  return {
    get: () => state,
    set,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export type SlashStore = ReturnType<typeof createSlashStore>;

const SLASH_KEY = new PluginKey('docSlash');

export const SlashCommand = Extension.create<{ store: SlashStore; ctx: SlashContext }>({
  name: 'slashCommand',
  addOptions() {
    return { store: createSlashStore(), ctx: { onAskAi: () => {} } };
  },
  addProseMirrorPlugins() {
    const { store, ctx } = this.options;
    const open = (props: SuggestionProps<SlashItem, SlashItem>) => {
      const prev = store.get();
      store.set({
        items: props.items,
        active: Math.min(prev?.active ?? 0, Math.max(0, props.items.length - 1)),
        rect: props.clientRect?.() ?? null,
        pick: (item) => props.command(item),
      });
    };
    return [
      Suggestion<SlashItem, SlashItem>({
        pluginKey: SLASH_KEY,
        editor: this.editor,
        char: '/',
        startOfLine: false,
        items: ({ query }) => filterSlashItems(query),
        command: ({ editor, range, props }) => props.run(editor, range, ctx),
        render: () => ({
          onStart: (props) => {
            store.set(null);
            open(props);
          },
          onUpdate: open,
          onExit: () => store.set(null),
          onKeyDown: ({ event, view }: SuggestionKeyDownProps) => {
            const s = store.get();
            if (!s || s.items.length === 0) return false;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              const step = event.key === 'ArrowDown' ? 1 : -1;
              store.set({ ...s, active: (s.active + step + s.items.length) % s.items.length });
              return true;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
              s.pick(s.items[s.active]!);
              return true;
            }
            if (event.key === 'Escape') {
              exitSuggestion(view, SLASH_KEY);
              store.set(null);
              return true;
            }
            return false;
          },
        }),
      }),
    ];
  },
});
