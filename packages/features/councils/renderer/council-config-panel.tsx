import { COUNCIL_MEMBER_PROVIDERS, type Council, type CouncilMember, type CouncilMemberProvider } from '@midnite/studio-shared';
import { useEffect, useState } from 'react';
import { LuGripVertical, LuPlus, LuTrash2 } from 'react-icons/lu';

import { councilModelOptions, DEFAULT_MODEL_ID, useCouncilProviders } from './council-providers';
import { useCouncilsHost } from './host';
import { useRemoveCouncil, useUpdateCouncilMembers } from './use-council';
import { SortableList, useFlushableSave, useSortableRow } from '@midnite/studio-frame';
import { IconButton } from './ui';

const isProvider = (id: string): id is CouncilMemberProvider => (COUNCIL_MEMBER_PROVIDERS as readonly string[]).includes(id);

/** A picker model id as stored: absent for the CLI's default. */
const storedModel = (id: string): string | undefined => (id === DEFAULT_MODEL_ID ? undefined : id);

/** Debounce for the members panel's auto-save, mirroring upstream's own. */
const SAVE_DEBOUNCE_MS = 500;

/** A member edit; `undefined` clears an optional field (a model back to the CLI's default). */
type MemberPatch = { [K in keyof CouncilMember]?: CouncilMember[K] | undefined };

function applyPatch(member: CouncilMember, patch: MemberPatch): CouncilMember {
  const next: Record<string, unknown> = { ...member };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next as CouncilMember;
}

type PendingSave = { members: CouncilMember[]; synthProvider: CouncilMemberProvider; synthModel: string | undefined };

/**
 * A council's configuration: members (drag- and keyboard-reorderable), each
 * with its agent and model, and the synthesizer's agent and model (Phase 133
 * Theme B). The composer that used to sit at the bottom of this panel moved
 * under the thread in the centre pane (Phase 133 Theme C).
 *
 * Member order is **presentation and prompt order only** — members still run
 * in parallel, so reordering never implies a scheduling promise the runner
 * does not keep.
 */
export function CouncilConfigPanel({
  council,
  onDeleted,
  className,
}: {
  council: Council;
  onDeleted: () => void;
  className?: string;
}) {
  const updateMembers = useUpdateCouncilMembers();
  const remove = useRemoveCouncil();
  const { ProviderModelPicker } = useCouncilsHost();
  const { providers } = useCouncilProviders();

  const [members, setMembers] = useState<CouncilMember[]>(council.members);
  const [synthProvider, setSynthProvider] = useState<CouncilMemberProvider>(council.synthProvider);
  const [synthModel, setSynthModel] = useState<string | undefined>(council.synthModel);

  // Reset local editing state only when the *council itself* changes — not on
  // every refetch of the one we're already editing, which would clobber an
  // in-flight debounced edit with whatever the server last had.
  useEffect(() => {
    setMembers(council.members);
    setSynthProvider(council.synthProvider);
    setSynthModel(council.synthModel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council.id]);

  const { schedule } = useFlushableSave<PendingSave>(
    (pending) =>
      updateMembers.mutate({
        id: council.id,
        members: pending.members,
        synthProvider: pending.synthProvider,
        ...(pending.synthModel === undefined ? {} : { synthModel: pending.synthModel }),
      }),
    SAVE_DEBOUNCE_MS,
  );

  const scheduleSave = (
    nextMembers: CouncilMember[],
    nextSynthProvider: CouncilMemberProvider,
    nextSynthModel: string | undefined = synthModel,
  ): void => {
    schedule({ members: nextMembers, synthProvider: nextSynthProvider, synthModel: nextSynthModel });
  };

  const updateMember = (index: number, patch: MemberPatch) => {
    const next = members.map((m, i) => (i === index ? applyPatch(m, patch) : m));
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

  const changeSynth = (provider: CouncilMemberProvider, model: string | undefined) => {
    setSynthProvider(provider);
    setSynthModel(model);
    scheduleSave(members, provider, model);
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
          <div className="mt-1.5">
            <ProviderModelPicker
              providers={providers}
              provider={synthProvider}
              // A new agent starts on its own default model: the old model id belongs to the old agent.
              onProviderChange={(id) => isProvider(id) && changeSynth(id, undefined)}
              models={councilModelOptions(synthProvider)}
              model={synthModel ?? DEFAULT_MODEL_ID}
              onModelChange={(id) => changeSynth(synthProvider, storedModel(id))}
              testId="council-synth-picker"
            />
          </div>
        </div>
      </div>
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
  onChange: (patch: MemberPatch) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const row = useSortableRow(member.id);
  const { ProviderModelPicker } = useCouncilsHost();
  const { providers } = useCouncilProviders();

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
      <div className="mt-1.5">
        <ProviderModelPicker
          providers={providers}
          provider={member.provider}
          onProviderChange={(id) => isProvider(id) && onChange({ provider: id, model: undefined })}
          models={councilModelOptions(member.provider)}
          model={member.model ?? DEFAULT_MODEL_ID}
          onModelChange={(id) => onChange({ model: storedModel(id) })}
          testId={`council-member-picker-${index}`}
        />
      </div>
      <textarea
        value={member.role}
        rows={2}
        onChange={(event) => onChange({ role: event.target.value })}
        className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}
