import { useEffect, useState } from 'react';
import { LuBot, LuCheck, LuFocus, LuUndo2 } from 'react-icons/lu';

import { Popover } from '../chrome';
import { addSelected, findObject, selectOnly, undo, type EditState, type ObjectRef } from './level-edit-model';
import { editorControls } from './level-editor-controls';
import { selectionBounds } from './level-selection';
import { useLevelStore, type AgentChangeSet, type OpenLevel } from './level-store';

/** "3 added · 2 changed · 1 removed", empty parts left out. */
export function changeCounts(change: Pick<AgentChangeSet, 'added' | 'updated' | 'deleted'>): string {
  const parts: string[] = [];
  if (change.added.length) parts.push(`${change.added.length} added`);
  if (change.updated.length) parts.push(`${change.updated.length} changed`);
  if (change.deleted.length) parts.push(`${change.deleted.length} removed`);
  return parts.join(' · ') || 'no changes';
}

/** The change set's objects that still exist, as refs. */
function liveRefs(edit: EditState, change: AgentChangeSet): ObjectRef[] {
  const refs: ObjectRef[] = [];
  for (const id of [...change.added, ...change.updated]) {
    const layer = edit.level.layers.find((l) => l.objects?.some((o) => o.id === id));
    if (layer && typeof layer.id === 'number' && findObject(edit.level, { layerId: layer.id, objectId: id })) refs.push({ layerId: layer.id, objectId: id });
  }
  return refs;
}

const SHIMMER_MS = 1500;

/**
 * The review banner for an agent change set (Phase 138 Theme F): sits between the toolbar and the canvas with Show,
 * Undo and Keep. Undo is offered only while nothing was done after the change (`past.length === undoDepth`).
 */
export function AgentChangeBanner({ gameId, entry }: { gameId: string; entry: OpenLevel }) {
  const [latest, ...older] = entry.agentChanges;
  const [shimmering, setShimmering] = useState(true);
  useEffect(() => {
    if (!latest) return undefined;
    setShimmering(true);
    const timer = setTimeout(() => setShimmering(false), SHIMMER_MS);
    return () => clearTimeout(timer);
  }, [latest?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!latest) return null;

  const store = useLevelStore.getState();
  const canUndo = entry.edit.past.length === latest.undoDepth;
  const show = () => {
    const refs = liveRefs(entry.edit, latest);
    store.update(gameId, (s) => addSelected(selectOnly(s, null), refs));
    store.setHighlight(gameId, [...latest.added, ...latest.updated]);
    // Show also brings them into view: the same camera move as the `game_level_frame` tool (Phase 138 Theme G).
    const rect = selectionBounds(entry.edit.level, refs);
    if (rect) editorControls(gameId)?.frame(rect, refs);
  };
  const doUndo = () => {
    store.update(gameId, undo);
    store.dismissAgentChange(gameId, latest.id);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="agent-change-banner"
      className="gradient-border gradient-border--always rounded-md bg-background mx-2 mt-2 flex h-9 shrink-0 items-center gap-2 px-3 text-xs"
    >
      <LuBot aria-hidden className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className={`truncate font-medium ${shimmering ? 'pill-shimmer' : ''}`}>{latest.label}</span>
      <span className="shrink-0 text-muted-foreground">{changeCounts(latest)}</span>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={show} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <LuFocus aria-hidden className="h-3.5 w-3.5" />
          Show
        </button>
        <button
          type="button"
          disabled={!canUndo}
          title={canUndo ? 'Undo this change' : 'Undo is past other edits — use Mod+Z'}
          onClick={doUndo}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <LuUndo2 aria-hidden className="h-3.5 w-3.5" />
          Undo
        </button>
        <button type="button" onClick={() => store.dismissAgentChange(gameId, latest.id)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-foreground">
          <LuCheck aria-hidden className="h-3.5 w-3.5" />
          Keep
        </button>
        {older.length > 0 ? (
          <Popover label={`${older.length} more agent changes`} trigger={<span className="text-muted-foreground">+{older.length} more</span>} side="bottom" align="end" testId="agent-change-more">
            <ul className="flex flex-col gap-1 p-2 text-xs">
              {older.map((c) => (
                <li key={c.id} className="flex items-center gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-muted-foreground">{changeCounts(c)}</span>
                  <button type="button" onClick={() => store.dismissAgentChange(gameId, c.id)} className="ml-auto rounded px-1 hover:bg-accent">
                    Keep
                  </button>
                </li>
              ))}
            </ul>
          </Popover>
        ) : null}
      </div>
    </div>
  );
}
