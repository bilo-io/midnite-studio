import {
  COUNCIL_MEMBER_PROVIDERS,
  type Council,
  type CouncilMember,
  type CouncilMemberProvider,
} from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuGripVertical, LuPlus, LuTrash2 } from 'react-icons/lu';

import { IconButton } from '../../components/icon-button';
import { SelectField } from '../../components/form/select-field';
import { SortableList, useSortableRow } from '../../components/sortable-list';
import { useRemoveCouncil, useUpdateCouncilMembers } from './use-council';
import { useStartCouncilRun } from './use-council-run';
import { useFlushableSave } from './use-flushable-save';

const PROVIDER_LABEL: Record<CouncilMemberProvider, string> = {
  agy: 'Antigravity',
  codex: 'Codex',
  opencode: 'OpenCode',
};

const PROVIDER_OPTIONS = COUNCIL_MEMBER_PROVIDERS.map((provider) => ({
  value: provider,
  label: PROVIDER_LABEL[provider],
}));

/** Debounce for the members panel's auto-save, mirroring upstream's own. */
const SAVE_DEBOUNCE_MS = 500;

type PendingSave = { members: CouncilMember[]; synthProvider: CouncilMemberProvider };

/**
 * A council's configuration: members (drag- and keyboard-reorderable),
 * synthesizer, and the run composer — moved to the panel's right edge
 * (Phase 42 Theme C), extracted out of the 221-line `council-detail.tsx` that
 * used to hold this beside the run view.
 *
 * Member order is **presentation and prompt order only** — members still run
 * in parallel, so reordering never implies a scheduling promise the runner
 * does not keep.
 */
export function CouncilConfigPanel({
  council,
  onDeleted,
  onRunStarted,
  className,
}: {
  council: Council;
  onDeleted: () => void;
  onRunStarted: (runId: string) => void;
  className?: string;
}) {
  const updateMembers = useUpdateCouncilMembers();
  const remove = useRemoveCouncil();

  const [members, setMembers] = useState<CouncilMember[]>(council.members);
  const [synthProvider, setSynthProvider] = useState<CouncilMemberProvider>(council.synthProvider);

  // Reset local editing state only when the *council itself* changes — not on
  // every refetch of the one we're already editing, which would clobber an
  // in-flight debounced edit with whatever the server last had.
  useEffect(() => {
    setMembers(council.members);
    setSynthProvider(council.synthProvider);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council.id]);

  const { schedule } = useFlushableSave<PendingSave>(
    (pending) => updateMembers.mutate({ id: council.id, members: pending.members, synthProvider: pending.synthProvider }),
    SAVE_DEBOUNCE_MS,
  );

  const scheduleSave = (nextMembers: CouncilMember[], nextSynthProvider: CouncilMemberProvider): void => {
    schedule({ members: nextMembers, synthProvider: nextSynthProvider });
  };

  const updateMember = (index: number, patch: Partial<CouncilMember>) => {
    const next = members.map((m, i) => (i === index ? { ...m, ...patch } : m));
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const addMember = () => {
    const next: CouncilMember[] = [
      ...members,
      { id: crypto.randomUUID(), name: 'New member', provider: 'agy', role: "Describe this member's perspective." },
    ];
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const removeMember = (index: number) => {
    const next = members.filter((_, i) => i !== index);
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const reorderMembers = (ids: string[]) => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const next = ids.map((id) => byId.get(id)).filter((m): m is CouncilMember => m !== undefined);
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  /**
   * `Alt+↑`/`Alt+↓` — the keyboard story for member reorder (the recorded
   * Decision), not a `@dnd-kit` `KeyboardSensor`: there is no `KeyboardSensor`
   * anywhere in this codebase, and a multi-item `coordinateGetter` is a lot
   * of machinery to reproduce what two key handlers do accessibly.
   */
  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= members.length) return;
    const next = [...members];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setMembers(next);
    scheduleSave(next, synthProvider);
  };

  const changeSynthProvider = (value: CouncilMemberProvider) => {
    setSynthProvider(value);
    scheduleSave(members, value);
  };

  return (
    <div className={`flex h-full min-h-0 flex-col border-l border-border ${className ?? ''}`}>
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{council.name}</h2>
          {council.description ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{council.description}</p>
          ) : null}
        </div>
        <IconButton
          icon={LuTrash2}
          label="Delete council"
          size="sm"
          tone="danger"
          onClick={() => remove.mutate(council.id, { onSuccess: (result) => result.ok && onDeleted() })}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Members</h3>
          <IconButton icon={LuPlus} label="Add member" size="sm" onClick={addMember} />
        </div>

        <div className="mt-2 flex flex-col gap-2">
          <SortableList ids={members.map((m) => m.id)} onReorder={reorderMembers}>
            {members.map((member, index) => (
              <MemberRow
                key={member.id}
                member={member}
                index={index}
                total={members.length}
                onChange={(patch) => updateMember(index, patch)}
                onRemove={() => removeMember(index)}
                onMove={(direction) => moveMember(index, direction)}
              />
            ))}
          </SortableList>
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Synthesize with
          </h3>
          <SelectField
            value={synthProvider}
            onChange={changeSynthProvider}
            options={PROVIDER_OPTIONS}
            label="Synthesize with"
            className="mt-1.5"
          />
        </div>
      </div>

      <RunComposer councilId={council.id} canStart={members.length > 0} onRunStarted={onRunStarted} />
    </div>
  );
}

function MemberRow({
  member,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: {
  member: CouncilMember;
  index: number;
  total: number;
  onChange: (patch: Partial<CouncilMember>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const row = useSortableRow(member.id);

  return (
    <div
      ref={row.setNodeRef}
      style={row.style}
      className="rounded-md border border-border p-2"
      onKeyDown={(event) => {
        if (!event.altKey) return;
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMove(-1);
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMove(1);
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        {/*
          A dedicated drag handle, not the row itself — the row holds an
          input, a select and a textarea, and spreading useSortableRow's
          listeners onto the whole card would swallow text selection and
          clicks inside all three.
        */}
        <button
          type="button"
          {...row.attributes}
          {...row.listeners}
          aria-label={`Reorder ${member.name || 'member'} — member ${index + 1} of ${total}`}
          className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
        >
          <LuGripVertical className="h-3.5 w-3.5" />
        </button>
        <input
          value={member.name}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-label="Member name"
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium outline-none focus:border-input focus:bg-background"
        />
        <IconButton icon={LuTrash2} label="Remove member" size="sm" onClick={onRemove} />
      </div>
      <SelectField
        value={member.provider}
        onChange={(provider) => onChange({ provider })}
        options={PROVIDER_OPTIONS}
        label="Member provider"
        className="mt-1.5"
      />
      <textarea
        value={member.role}
        rows={2}
        onChange={(event) => onChange({ role: event.target.value })}
        className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

/**
 * The prompt composer — its own state, deliberately not lifted into the
 * config panel's `members`/`synthProvider` pair (the phase doc's own
 * distinction: "`prompt` belongs to the composer").
 */
function RunComposer({
  councilId,
  canStart,
  onRunStarted,
}: {
  councilId: string;
  canStart: boolean;
  onRunStarted: (runId: string) => void;
}) {
  const startRun = useStartCouncilRun();
  const [prompt, setPrompt] = useState('');

  const canRun = canStart && prompt.trim().length > 0 && !startRun.isPending;

  return (
    <div className="shrink-0 border-t border-border p-3">
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="What should the council answer?"
        rows={3}
        className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        Members run automatically once you hit Run — unlike a regular agent session, a council
        member only answers this prompt and makes no changes to any repository.
      </p>
      <button
        type="button"
        disabled={!canRun}
        onClick={() => {
          startRun.mutate(
            { councilId, prompt: prompt.trim() },
            { onSuccess: (result) => result.ok && onRunStarted(result.value.id) },
          );
          setPrompt('');
        }}
        className="mt-2 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
      >
        Run
      </button>
    </div>
  );
}
