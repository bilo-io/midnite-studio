import type { Council } from '@midnite/studio-shared';
import { useState } from 'react';
import { LuPlus, LuUsers } from 'react-icons/lu';

import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { CouncilCreateDialog } from './council-create-dialog';
import { useCouncils, useCreateCouncil } from './use-council';

export function CouncilList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const councils = useCouncils();
  const create = useCreateCouncil();
  const rows: Council[] = councils.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Councils
        </h2>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground/70">{rows.length}</span>
        <IconButton
          icon={LuPlus}
          label="New council"
          size="sm"
          className="ml-auto"
          onClick={() => setCreating(true)}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {councils.isLoading ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={LuUsers}
            title="No councils yet"
            body="Create a panel of agents to answer a prompt together."
          />
        ) : (
          rows.map((council) => (
            <button
              key={council.id}
              type="button"
              onClick={() => onSelect(council.id)}
              className={`flex w-full flex-col items-start gap-0.5 border-b border-border/50 px-2 py-2 text-left transition-colors hover:bg-accent ${
                selectedId === council.id ? 'bg-accent' : ''
              }`}
            >
              <span className="truncate text-xs font-medium text-foreground">{council.name}</span>
              <span className="text-[11px] text-muted-foreground">
                {council.members.length} member{council.members.length === 1 ? '' : 's'}
              </span>
            </button>
          ))
        )}
      </div>

      {creating ? (
        <CouncilCreateDialog
          onCancel={() => setCreating(false)}
          onCreate={(name, description) => {
            create.mutate(
              { name, description },
              {
                onSuccess: (result) => {
                  if (result.ok) {
                    onSelect(result.value.id);
                    setCreating(false);
                  }
                },
              },
            );
          }}
        />
      ) : null}
    </div>
  );
}
