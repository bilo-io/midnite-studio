import { useState } from 'react';
import { LuUsers } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { CouncilDetail } from './council-detail';
import { CouncilList } from './council-list';

/**
 * Agent councils (Phase 34) — global, not per-repo, unlike almost every other
 * rail view in this app. `view-sections.ts`'s `councils` case renders this in
 * place of the `WORK_IN_PROGRESS` stub it used before this phase.
 */
export function CouncilsView() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 border-r border-border">
        <CouncilList selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {selectedId ? (
        <CouncilDetail councilId={selectedId} onDeleted={() => setSelectedId(null)} />
      ) : (
        <EmptyState
          icon={LuUsers}
          title="Select a council"
          body="Pick a council on the left, or create a new one to get started."
        />
      )}
    </div>
  );
}
