/**
 * Editor shortcuts (Phase 101 Theme E): Space play, Delete, Mod+D duplicate, Mod+A select all,
 * arrows nudge, Q quantise, plus Mod+Z / Mod+Shift+Z for history. Pure, so the table is a vitest.
 */
export type EditorAction =
  | { type: 'play-pause' }
  | { type: 'delete' }
  | { type: 'duplicate' }
  | { type: 'select-all' }
  | { type: 'quantize' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'nudge'; dx: -1 | 0 | 1; dy: -1 | 0 | 1; coarse: boolean };

export type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

export function editorKeyAction(e: KeyLike): EditorAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (mod) {
    if (e.altKey) return null;
    if (key === 'd' && !e.shiftKey) return { type: 'duplicate' };
    if (key === 'a' && !e.shiftKey) return { type: 'select-all' };
    if (key === 'z') return { type: e.shiftKey ? 'redo' : 'undo' };
    if (key === 'y' && !e.shiftKey) return { type: 'redo' };
    return null;
  }
  if (e.altKey) return null;
  switch (key) {
    case ' ':
      return { type: 'play-pause' };
    case 'Delete':
    case 'Backspace':
      return { type: 'delete' };
    case 'q':
      return { type: 'quantize' };
    case 'ArrowLeft':
      return { type: 'nudge', dx: -1, dy: 0, coarse: e.shiftKey };
    case 'ArrowRight':
      return { type: 'nudge', dx: 1, dy: 0, coarse: e.shiftKey };
    case 'ArrowUp':
      return { type: 'nudge', dx: 0, dy: 1, coarse: e.shiftKey };
    case 'ArrowDown':
      return { type: 'nudge', dx: 0, dy: -1, coarse: e.shiftKey };
    default:
      return null;
  }
}
