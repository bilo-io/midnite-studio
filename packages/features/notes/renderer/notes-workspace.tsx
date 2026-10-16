import { useState } from 'react';

import { NotesView } from './notes-view';
import { ReviewView } from './review-view';

type Tab = 'notes' | 'review';

/**
 * What the `notes` view mounts: a Notes | Review switch over the two. Notes stays the default and is
 * unmounted while Review shows (its store is module-level, so nothing is lost by it).
 */
export function NotesWorkspace() {
  const [tab, setTab] = useState<Tab>('notes');
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Notes sections" className="flex shrink-0 gap-1 border-b border-border px-3 pt-2">
        {(['notes', 'review'] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-testid={`notes-tab-${id}`}
            onClick={() => setTab(id)}
            className={`rounded-t-md px-3 py-1 text-xs font-medium ${
              tab === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {id === 'notes' ? 'Notes' : 'Review'}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">{tab === 'notes' ? <NotesView /> : <ReviewView />}</div>
    </div>
  );
}
