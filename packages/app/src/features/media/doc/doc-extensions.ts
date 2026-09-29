import type { AnyExtension } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';

/**
 * The Docs editor's schema (Phase 99 Theme B) — everything that decides what
 * survives a markdown round-trip, kept apart from the React editor so the
 * fixture suite (`doc-markdown.test.ts`) exercises exactly this list.
 *
 * Part of the lazy editor chunk: only `doc-editor.tsx` and tests import it.
 */
const lowlight = createLowlight(common);

export function docExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      // CodeBlockLowlight replaces the plain code block.
      codeBlock: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
    }),
    CodeBlockLowlight.configure({ lowlight }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Write, or press '/' for commands…",
    }),
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
  ];
}
