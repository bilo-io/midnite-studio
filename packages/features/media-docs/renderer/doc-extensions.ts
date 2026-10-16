import type { AnyExtension } from '@tiptap/core';
import { CodeBlockLowlight, type CodeBlockLowlightOptions } from '@tiptap/extension-code-block-lowlight';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { all, createLowlight } from 'lowlight';

import { CodeBlockView } from './code-block-view';
import { Callout } from './doc-callout';

/**
 * The Docs editor's schema (Phase 99 Theme B) — everything that decides what
 * survives a markdown round-trip, kept apart from the React editor so the
 * fixture suite (`doc-markdown.test.ts`) exercises exactly this list.
 *
 * Part of the lazy editor chunk: only `doc-editor.tsx` and tests import it.
 */
const lowlight = createLowlight(all);

/** Every language registered for highlighting — the code block's dropdown options. */
export const CODE_LANGUAGES: readonly string[] = lowlight.listLanguages();

const CodeBlock = CodeBlockLowlight.extend<CodeBlockLowlightOptions & { languages: readonly string[] }>({
  addOptions() {
    return { ...this.parent!(), languages: CODE_LANGUAGES };
  },
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

export function docExtensions(options: { placeholder?: string } = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      // CodeBlockLowlight replaces the plain code block.
      codeBlock: false,
      // Callout is a blockquote with an optional `> [!NOTE]` kind.
      blockquote: false,
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
    }),
    Callout,
    CodeBlock.configure({ lowlight }),
    Image.configure({ inline: false, allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Placeholder.configure({
      placeholder: options.placeholder ?? "Write, or press '/' for commands…",
    }),
    Markdown.configure({ indentation: { style: 'space', size: 2 } }),
  ];
}
