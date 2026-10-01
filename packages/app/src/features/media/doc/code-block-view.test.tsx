import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';

import { languageOptions } from './code-block-view';
import { CODE_LANGUAGES, docExtensions } from './doc-extensions';
import { normalizeMarkdown } from './doc-thread';

function Harness({ markdown }: { markdown: string }) {
  const editor = useEditor({ extensions: docExtensions(), content: markdown, contentType: 'markdown' });
  return <EditorContent editor={editor} />;
}

/** The editor that actually owns the rendered DOM (tiptap stamps it on the view's root). */
const liveEditor = (): Editor =>
  (document.querySelector('.ProseMirror') as unknown as { editor: Editor }).editor;

describe('code block language dropdown', () => {
  it('shows the fence language and lists every registered language plus Auto', async () => {
    render(<Harness markdown={'```ts\nconst a = 1;\n```'} />);
    const select = (await screen.findByTestId('code-language')) as HTMLSelectElement;
    expect(select.value).toBe('ts'); // alias kept so opening a doc never rewrites it
    const values = [...select.options].map((o) => o.value);
    expect(values).toContain('');
    for (const lang of ['typescript', 'python', 'plaintext']) expect(values).toContain(lang);
    expect(values.length).toBeGreaterThanOrEqual(CODE_LANGUAGES.length + 1);
  });

  it('changing it updates the node attr and the markdown fence; Auto clears it', async () => {
    render(<Harness markdown={'```ts\nconst a = 1;\n```'} />);
    const select = (await screen.findByTestId('code-language')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'python' } });
    await waitFor(() => expect(liveEditor().state.doc.child(0).attrs.language).toBe('python'));
    expect(normalizeMarkdown(liveEditor().getMarkdown())).toContain('```python');
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(liveEditor().state.doc.child(0).attrs.language).toBeNull());
    expect(normalizeMarkdown(liveEditor().getMarkdown())).toMatch(/^```\n/);
  });
});

describe('languageOptions', () => {
  it('adds an unregistered current value and sorts', () => {
    expect(languageOptions(['b', 'a'], 'zz')).toEqual(['a', 'b', 'zz']);
    expect(languageOptions(['b'], null)).toEqual(['b']);
  });
});
