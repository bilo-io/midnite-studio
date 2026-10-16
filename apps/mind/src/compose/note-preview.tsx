import { useEffect, useState } from 'react';

import { bridge } from '@midnite/studio-frame';
import { MIND_NOTEBOOK_ID } from '@midnite/studio-shared';

/**
 * What a graph node's detail panel shows for a note node: the note itself, read through the same
 * `notes.list` the notes tab uses. A tag node has no source (`source_file` is empty), so it asks
 * for no note and the panel says so.
 */
export function MindNotePreview({ noteId }: { noteId: string }) {
  const [body, setBody] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setBody(undefined);
    if (noteId === '') {
      setBody(null);
      return;
    }
    void bridge()
      ?.notes.list({ repoId: MIND_NOTEBOOK_ID })
      .then((res) => {
        if (!cancelled) setBody(res.notes.find((n) => n.id === noteId)?.body ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  if (body === undefined) return <p className="p-4 text-xs text-muted-foreground">Loading…</p>;
  if (body === null) return <p className="p-4 text-xs text-muted-foreground">This node is not a note.</p>;
  return (
    <div
      data-testid="mind-note-preview"
      className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 text-sm leading-6"
    >
      {body}
    </div>
  );
}
