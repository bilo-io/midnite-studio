import { describe, expect, it } from 'vitest';

import { CHAT_COLUMN, CHAT_GUTTER, CHAT_WIDTH_GLIDE, chatThreadColumn, chatThreadGutter } from './chat-column';

/**
 * Vitest: the classes each width mode resolves to. The widths themselves are
 * Tailwind utilities, so what is proven here is the DECISION per mode — which
 * max-width, which gutter, and that every column carries the glide and its
 * reduced-motion guards.
 */

describe('chat columns per width mode', () => {
  it('keeps the composer at one readable column whatever the mode', () => {
    expect(CHAT_COLUMN).toContain('max-w-[50rem]');
    expect(CHAT_GUTTER).toBe('px-16');
  });

  it('default: the thread is the composer plus an avatar and its gap each side', () => {
    expect(chatThreadColumn('default')).toContain('max-w-[calc(50rem+4.5rem)]');
    expect(chatThreadGutter('default')).toContain('px-16');
  });

  it('wider: only the thread opens further, inside the same gutter', () => {
    expect(chatThreadColumn('wider')).toContain('max-w-[calc(64rem+4.5rem)]');
    expect(chatThreadGutter('wider')).toContain('px-16');
  });

  it('full: the thread spans the pane inside its own padding token', () => {
    expect(chatThreadColumn('full')).toContain('max-w-full');
    expect(chatThreadGutter('full')).toContain('px-4');
    expect(chatThreadGutter('full')).not.toContain('px-16');
  });

  it('every column and gutter glides ~250ms ease-out, and not at all under reduced motion', () => {
    expect(CHAT_WIDTH_GLIDE).toContain('transition-[max-width,padding]');
    expect(CHAT_WIDTH_GLIDE).toContain('duration-[250ms]');
    expect(CHAT_WIDTH_GLIDE).toContain('ease-out');
    // Both dialects: the app's own Settings switch and the OS preference (unless overridden to full).
    expect(CHAT_WIDTH_GLIDE).toContain('[html[data-motion=reduced]_&]:transition-none');
    expect(CHAT_WIDTH_GLIDE).toContain('motion-reduce:[html:not([data-motion=full])_&]:transition-none');
    for (const mode of ['default', 'wider', 'full'] as const) {
      expect(chatThreadColumn(mode)).toContain(CHAT_WIDTH_GLIDE);
      expect(chatThreadGutter(mode)).toContain(CHAT_WIDTH_GLIDE);
    }
  });
});
