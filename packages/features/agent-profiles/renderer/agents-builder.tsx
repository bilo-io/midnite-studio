import type { AgentProfile } from '@midnite/studio-shared';

import { AgentBuilder } from './agent-builder';
import { PRIMARY_BUTTON } from './ui';

/**
 * The Builder tab: the editor for one agent (`AgentBuilder`), or a prompt to pick one. The page owns
 * which profile is open and whether it is a new, unsaved draft.
 */
export function AgentsBuilder({
  profile,
  isNew,
  onNew,
  onDirtyChange,
  onSaved,
  onDone,
}: {
  profile: AgentProfile | null;
  isNew: boolean;
  onNew: () => void;
  onDirtyChange: (dirtyName: string | null) => void;
  onSaved: (profile: AgentProfile) => void;
  onDone: () => void;
}) {
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
  return <AgentBuilder key={profile.id} profile={profile} isNew={isNew} onDirtyChange={onDirtyChange} onSaved={onSaved} onDone={onDone} />;
}
