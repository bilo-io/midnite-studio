import { fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';

import { BlockTypeMenu, insertBlockBelow } from './block-drag-handle';
import { docExtensions } from './doc-extensions';
import { SLASH_ITEMS } from './slash-commands';

const ctx = { onAskAi: () => {} };
const item = (id: string) => SLASH_ITEMS.find((i) => i.id === id)!;

function load(markdown: string): Editor {
  return new Editor({ extensions: docExtensions(), content: markdown, contentType: 'markdown' });
}

describe('insertBlockBelow', () => {
  it('inserts the chosen type directly below the block and puts the caret in it', () => {
    const editor = load('first\n\nsecond');
    insertBlockBelow(editor, 0, item('h2'), ctx);
    const types = editor.state.doc.content.content.map((n) => `${n.type.name}:${n.textContent}`);
    expect(types).toEqual(['paragraph:first', 'heading:', 'paragraph:second']);
    expect(editor.state.doc.child(1).attrs.level).toBe(2);
    expect(editor.state.selection.$from.parent.type.name).toBe('heading');
    editor.destroy();
  });

  it('works for list blocks', () => {
    const editor = load('only');
    insertBlockBelow(editor, 0, item('bullet'), ctx);
    expect(editor.state.doc.child(1).type.name).toBe('bulletList');
    editor.destroy();
  });

  it('Ask AI opens the assistant instead of inserting a type', () => {
    const editor = load('only');
    const onAskAi = vi.fn();
    insertBlockBelow(editor, 0, item('ai'), { onAskAi });
    expect(onAskAi).toHaveBeenCalledOnce();
    editor.destroy();
  });
});

describe('BlockTypeMenu', () => {
  it('lists every slash-menu block type, focuses the first and navigates by keyboard', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(<BlockTypeMenu left={0} top={0} onClose={onClose} onPick={onPick} />);
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(SLASH_ITEMS.map((i) => i.label));
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'ArrowUp' });
    fireEvent.keyDown(items[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[items.length - 1]);
    fireEvent.click(items[1]!);
    expect(onPick).toHaveBeenCalledWith(SLASH_ITEMS[1]);
    fireEvent.keyDown(items[0]!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
