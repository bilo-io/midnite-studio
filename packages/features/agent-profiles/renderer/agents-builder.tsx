import { useEffect, useRef } from 'react';

import type { AgentProfile } from '@midnite/studio-shared';

import { PRIMARY_BUTTON } from './ui';

/**
 * The Builder tab's slot (Phase 154 Theme D builds the full editor here). Until then it names the
 * agent being edited and holds the name input that Edit focuses, so the tab shell is complete.
 */
export function AgentsBuilder({ profile, isNew, onNew }: { profile: AgentProfile | null; isNew: boolean; onNew: () => void }) {
  const name = useRef<HTMLInputElement>(null);
  const id = profile?.id;
  useEffect(() => {
    if (id !== undefined) name.current?.focus();
  }, [id]);

  if (!profile) {
    return (
      <div className="flex flex-col items-start gap-2 py-6 text-xs text-muted-foreground" data-testid="agents-builder">
        <p>Pick an agent to edit, or start a new one.</p>
        <button type="button" className={PRIMARY_BUTTON} onClick={onNew}>
          New agent
        </button>
      </div>
    );
  }
  return (
    <div className="flex max-w-md flex-col gap-2 text-xs" data-testid="agents-builder">
      <label className="flex flex-col gap-1">
        <span className="font-medium">Name</span>
        <input
          ref={name}
          data-testid="builder-name"
          defaultValue={profile.name}
          key={profile.id}
          className="rounded border border-border bg-background px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </label>
      <p className="text-muted-foreground">{isNew ? 'This agent is not saved yet.' : 'Editing a saved agent.'} The full editor arrives with the Builder.</p>
    </div>
  );
}
