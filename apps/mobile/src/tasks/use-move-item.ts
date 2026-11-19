// Optimistic "Move to…" (Phase 146 H2): the card jumps columns at once, and snaps back with a banner if GitHub refuses.
import type { ForgeProjectField, ForgeProjectItem } from '@midnite/studio-shared';
import { useCallback, useState } from 'react';
import { useSetItemField } from '../data/queries';
import { errorMessage } from './screen-state';
import { itemRef, movableField } from './model';

export function useMoveItem(projectId: string, groupField: ForgeProjectField | null) {
  const setField = useSetItemField();
  const [moves, setMoves] = useState<ReadonlyMap<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const move = useCallback(
    async (item: ForgeProjectItem, optionId: string): Promise<boolean> => {
      const field = movableField(groupField);
      if (!field) return false;
      setError(null);
      setMoves((m) => new Map(m).set(item.id, optionId));
      try {
        // The mutation's own onSuccess refetches the items before this resolves, so dropping the override below
        // lands on fresh data rather than flickering back.
        await setField.mutateAsync({ projectId, itemId: item.id, fieldId: field.id, optionId });
        return true;
      } catch (e) {
        setError(`Couldn't move ${itemRef(item)}: ${errorMessage(e)}`);
        return false;
      } finally {
        // Only drop our own override: a newer move of the same card keeps its own until it settles.
        setMoves((m) => {
          if (m.get(item.id) !== optionId) return m;
          const next = new Map(m);
          next.delete(item.id);
          return next;
        });
      }
    },
    [groupField, projectId, setField],
  );

  return { moves, error, clearError: () => setError(null), move };
}
