import { Terminal } from '@xterm/xterm';
import { describe, expect, it } from 'vitest';
import { enableUnicode11 } from './enable-unicode11';

function cursorAfter(term: Terminal, text: string): Promise<number> {
  return new Promise((resolve) => term.write(text, () => resolve(term.buffer.active.cursorX)));
}

describe('enableUnicode11', () => {
  it('measures an emoji as two cells, the width TUIs lay out with', async () => {
    const term = new Terminal({ allowProposedApi: true, cols: 80, rows: 4 });
    enableUnicode11(term);
    expect(term.unicode.activeVersion).toBe('11');
    expect(await cursorAfter(term, '📁ab')).toBe(4);
    term.dispose();
  });

  it('is what fixes it — the default table measures the same emoji as one', async () => {
    const term = new Terminal({ allowProposedApi: true, cols: 80, rows: 4 });
    expect(await cursorAfter(term, '📁ab')).toBe(3);
    term.dispose();
  });

  it('leaves a terminal without the unicode API alone', () => {
    expect(() => enableUnicode11({} as Terminal)).not.toThrow();
  });
});
