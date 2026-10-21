import type { SpritePatchOp } from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The frame strip's undo stack (Phase 106 Theme G, Decision 16): session-only, at most
 * {@link SPRITE_HISTORY_MAX} entries, each an edit and the ops that undo it. A delete is undoable
 * because main keeps the frame in `frames/.trash/` until the next generation; a re-roll is not (it is
 * a new generation), so it never enters the stack. Changing `scope` (another asset) starts afresh.
 */
export const SPRITE_HISTORY_MAX = 100;

export type SpriteHistoryEntry = { forward: SpritePatchOp[]; inverse: SpritePatchOp[] };

/** Applies ops; resolves `true` when main accepted them. */
export type ApplyOps = (ops: SpritePatchOp[]) => Promise<boolean>;

export function useSpriteHistory(scope: string, apply: ApplyOps) {
  const undoStack = useRef<SpriteHistoryEntry[]>([]);
  const redoStack = useRef<SpriteHistoryEntry[]>([]);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    bump();
  }, [scope]);

  /** Runs an edit and remembers how to undo it. */
  const run = useCallback(
    async (entry: SpriteHistoryEntry): Promise<boolean> => {
      const done = await apply(entry.forward);
      if (!done) return false;
      if (entry.inverse.length > 0) {
        undoStack.current = [...undoStack.current, entry].slice(-SPRITE_HISTORY_MAX);
        redoStack.current = [];
      }
      bump();
      return true;
    },
    [apply],
  );

  const undo = useCallback(async (): Promise<boolean> => {
    const entry = undoStack.current[undoStack.current.length - 1];
    if (!entry) return false;
    const done = await apply(entry.inverse);
    if (done) {
      undoStack.current = undoStack.current.slice(0, -1);
      redoStack.current = [...redoStack.current, entry];
      bump();
    }
    return done;
  }, [apply]);

  const redo = useCallback(async (): Promise<boolean> => {
    const entry = redoStack.current[redoStack.current.length - 1];
    if (!entry) return false;
    const done = await apply(entry.forward);
    if (done) {
      redoStack.current = redoStack.current.slice(0, -1);
      undoStack.current = [...undoStack.current, entry];
      bump();
    }
    return done;
  }, [apply]);

  return { run, undo, redo, canUndo: undoStack.current.length > 0, canRedo: redoStack.current.length > 0 };
}
