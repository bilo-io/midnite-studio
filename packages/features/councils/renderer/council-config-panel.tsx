import {
  COUNCIL_MEMBER_PROVIDERS,
  councilMemberCap,
  COUNCIL_MIN_MEMBERS,
  modelsForAgent,
  resolveSynthInstructions,
  COUNCIL_SYNTHESIS_PRESETS,
  type Council,
  type CouncilMember,
  type CouncilMemberProvider,
  type CouncilSynthesisType,
} from '@midnite/studio-shared';
import { useEffect, useRef, useState } from 'react';
import { LuChevronRight, LuGripVertical, LuTrash2 } from 'react-icons/lu';

import { SortableList, useFeatureFlag, useFlushableSave, useSortableRow } from '@midnite/studio-frame';

import { CouncilMemberCount } from './council-member-count';
import { applyPresetMembers, membersFromGenerated, resizeMembers, revealOrder } from './council-members-model';
import { councilModelOptions, DEFAULT_MODEL_ID, useCouncilProviders } from './council-providers';
import { CouncilSynthesizerCard } from './council-synthesizer-card';
import { CouncilUpgradeDialog } from './council-upgrade-dialog';
import { useCouncilsHost } from './host';
import { IconButton } from './ui';
import { useGenerateCouncil, useRemoveCouncil, useUpdateCouncilMembers } from './use-council';

const isProvider = (id: string): id is CouncilMemberProvider => (COUNCIL_MEMBER_PROVIDERS as readonly string[]).includes(id);

/** A picker model id as stored: absent for the CLI's default. */
const storedModel = (id: string): string | undefined => (id === DEFAULT_MODEL_ID ? undefined : id);

/** Debounce for the members panel's auto-save, mirroring upstream's own. */
const SAVE_DEBOUNCE_MS = 500;

/** The gap between one revealed member and the next (Theme C's cascade). */
const CASCADE_STEP_MS = 90;

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

type Draft = {
  members: CouncilMember[];
  synthProvider: CouncilMemberProvider;
  synthModel: string | undefined;
  synthesisType: CouncilSynthesisType;
  /** `undefined` runs the preset's own instructions. */
  synthInstructions: string | undefined;
};

const draftOf = (council: Council): Draft => ({
  members: council.members,
  synthProvider: council.synthProvider,
  synthModel: council.synthModel,
  synthesisType: council.synthesisType,
  synthInstructions: council.synthInstructions,
});

/**
 * A council's configuration (Phase 134): the synthesizer card on top — agent,
 * synthesis type, recommendation and instructions — then the member-count
 * slider and the members as accordions, each reorderable by drag or
 * `Alt+↑`/`Alt+↓`.
 *
 * Picking a preset brings its members, seated on the agents already chosen, and
 * reveals them one after another. Member order is **presentation and prompt
 * order only** — members still run in parallel.
 */
export function CouncilConfigPanel({
  council,
  topic,
  onDeleted,
  className,
}: {
  council: Council;
  /** What the council is being asked about, for the synthesis recommendation and Generate. */
  topic: string;
  onDeleted: () => void;
  className?: string;
}) {
  const updateMembers = useUpdateCouncilMembers();
  const remove = useRemoveCouncil();
  const generate = useGenerateCouncil();
  const { installed } = useCouncilProviders();
  const cap = councilMemberCap(useFeatureFlag('councils.pro'));

  const [draft, setDraft] = useState<Draft>(() => draftOf(council));
  // The latest draft and council, for a commit that lands after an await (Generate) — never a stale closure's.
  const latest = useRef({ draft, councilId: council.id });
  latest.current = { draft, councilId: council.id };
  const [reveal, setReveal] = useState<Map<string, number>>(() => new Map());
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Reset local editing state only when the *council itself* changes — not on
  // every refetch of the one we're already editing, which would clobber an
  // in-flight debounced edit with whatever the server last had.
  useEffect(() => {
    setDraft(draftOf(council));
    setReveal(new Map());
    setExpanded(new Set());
    setGenerateError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [council.id]);

  const { schedule } = useFlushableSave<Draft>(
    (pending) =>
      updateMembers.mutate({
        id: council.id,
        members: pending.members,
        synthProvider: pending.synthProvider,
        synthesisType: pending.synthesisType,
        ...(pending.synthModel === undefined ? {} : { synthModel: pending.synthModel }),
        ...(pending.synthInstructions === undefined ? {} : { synthInstructions: pending.synthInstructions }),
      }),
    SAVE_DEBOUNCE_MS,
  );

  const commit = (patch: Partial<Draft>, options: { cascade?: boolean } = {}) => {
    const current = latest.current.draft;
    const next = { ...current, ...patch };
    if (options.cascade) setReveal(revealOrder(current.members, next.members));
    latest.current = { ...latest.current, draft: next };
    setDraft(next);
    schedule(next);
  };

  const setMembers = (members: CouncilMember[], options?: { cascade?: boolean }) => commit({ members }, options);

  const presetInstructions = resolveSynthInstructions(draft.synthesisType, undefined);
  const shownInstructions =
    draft.synthesisType === 'custom' ? (draft.synthInstructions ?? '') : (draft.synthInstructions ?? presetInstructions);

  const changeType = (type: CouncilSynthesisType) => {
    if (type === draft.synthesisType) return;
    if (type === 'custom') {
      // Custom starts from the instructions on screen, so the user edits rather than retypes.
      commit({ synthesisType: type, synthInstructions: shownInstructions });
      return;
    }
    commit(
      { synthesisType: type, synthInstructions: undefined, members: applyPresetMembers(draft.members, type) },
      { cascade: true },
    );
  };

  const changeInstructions = (text: string) => {
    const unchanged = draft.synthesisType !== 'custom' && text === presetInstructions;
    commit({ synthInstructions: unchanged ? undefined : text });
  };

  const runGenerate = () => {
    if (generate.isPending) return;
    setGenerateError(null);
    const count = Math.min(Math.max(draft.members.length, COUNCIL_MIN_MEMBERS), cap);
    const forCouncil = council.id;
    generate.mutate(
      {
        name: council.name,
        ...(topic.trim() ? { topic: topic.trim() } : {}),
        count,
        providers: installed.map((provider) => ({
          provider,
          models: modelsForAgent(provider)
            .map((m) => m.id)
            .filter((id) => id !== DEFAULT_MODEL_ID),
        })),
      },
      {
        onSuccess: (result) => {
          // The user moved to another council while this one was generating: it is not theirs to fill.
          if (latest.current.councilId !== forCouncil) return;
          if (!result.ok) {
            setGenerateError(result.kind === 'error' ? result.message : 'Could not generate a council.');
            return;
          }
          commit(
            {
              synthInstructions: result.value.instructions,
              members: membersFromGenerated(result.value.members.slice(0, cap)),
            },
            { cascade: true },
          );
        },
      },
    );
  };

  const updateMember = (index: number, patch: MemberPatch) =>
    setMembers(draft.members.map((m, i) => (i === index ? applyPatch(m, patch) : m)));

  const removeMember = (index: number) => setMembers(draft.members.filter((_, i) => i !== index));

  const reorderMembers = (ids: string[]) => {
    const byId = new Map(draft.members.map((m) => [m.id, m]));
    setMembers(ids.map((id) => byId.get(id)).filter((m): m is CouncilMember => m !== undefined));
  };

  /**
   * `Alt+↑`/`Alt+↓` — the keyboard story for member reorder (Phase 133's
   * recorded Decision), not a `@dnd-kit` `KeyboardSensor`.
   */
  const moveMember = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.members.length) return;
    const next = [...draft.members];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    setMembers(next);
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const presetEdited =
    draft.synthesisType !== 'custom' &&
    draft.synthInstructions !== undefined &&
    draft.synthInstructions !== COUNCIL_SYNTHESIS_PRESETS[draft.synthesisType].instructions;

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

      <div className="min-h-0 flex-1 overflow-auto px-3 py-2.5">
        <CouncilSynthesizerCard
          synthProvider={draft.synthProvider}
          synthModel={draft.synthModel}
          onSynthChange={(synthProvider, synthModel) => commit({ synthProvider, synthModel })}
          synthesisType={draft.synthesisType}
          onTypeChange={changeType}
          instructions={shownInstructions}
          edited={presetEdited}
          onInstructionsChange={changeInstructions}
          onResetInstructions={() => commit({ synthInstructions: undefined })}
          topic={topic}
          onGenerate={runGenerate}
          generating={generate.isPending}
          generateError={generateError}
        />

        <div className="mt-4">
          <CouncilMemberCount
            count={draft.members.length}
            cap={cap}
            onChange={(count) => setMembers(resizeMembers(draft.members, count, draft.synthesisType), { cascade: true })}
            onLocked={() => setUpgradeOpen(true)}
          />
        </div>

        <div className="mt-2 flex flex-col gap-1.5">
          <SortableList ids={draft.members.map((m) => m.id)} onReorder={reorderMembers}>
            {draft.members.map((member, index) => {
              const order = reveal.get(member.id);
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  index={index}
                  total={draft.members.length}
                  expanded={expanded.has(member.id)}
                  onToggle={() => toggle(member.id)}
                  revealDelayMs={order === undefined ? null : order * CASCADE_STEP_MS}
                  onRevealed={() =>
                    setReveal((current) => {
                      if (!current.has(member.id)) return current;
                      const next = new Map(current);
                      next.delete(member.id);
                      return next;
                    })
                  }
                  canRemove={draft.members.length > COUNCIL_MIN_MEMBERS}
                  onChange={(patch) => updateMember(index, patch)}
                  onRemove={() => removeMember(index)}
                  onMove={(direction) => moveMember(index, direction)}
                />
              );
            })}
          </SortableList>
        </div>
      </div>

      {upgradeOpen ? <CouncilUpgradeDialog onClose={() => setUpgradeOpen(false)} /> : null}
    </div>
  );
}

/**
 * One member as an accordion (Theme C): the header carries the drag handle,
 * the expand toggle (name), the agent/model picker and the trash, all usable
 * while collapsed; the body holds the name and perspective fields. The toggle
 * is its own button rather than the whole header, so the header's other
 * controls are siblings of it, not nested interactive content.
 */
function MemberRow({
  member,
  index,
  total,
  expanded,
  onToggle,
  revealDelayMs,
  onRevealed,
  canRemove,
  onChange,
  onRemove,
  onMove,
}: {
  member: CouncilMember;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  /** Where this member sits in a cascade reveal, or `null` when it is not being revealed. */
  revealDelayMs: number | null;
  onRevealed: () => void;
  canRemove: boolean;
  onChange: (patch: MemberPatch) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const row = useSortableRow(member.id);
  const { ProviderModelPicker } = useCouncilsHost();
  const { providers } = useCouncilProviders();
  const bodyId = `council-member-body-${member.id}`;
  const label = member.name || 'member';

  return (
    <div
      ref={row.setNodeRef}
      style={{ ...row.style, ...(revealDelayMs === null ? {} : { animationDelay: `${revealDelayMs}ms` }) }}
      data-testid="council-member"
      className={`rounded-md border border-border ${revealDelayMs === null ? '' : 'animate-fade-in-up'}`}
      onAnimationEnd={revealDelayMs === null ? undefined : onRevealed}
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
      <div className="px-1.5 py-1">
        <div className="flex items-center gap-1">
          {/*
            A dedicated drag handle, not the row itself — spreading
            useSortableRow's listeners onto the whole card would swallow clicks
            on the toggle, the picker and the fields.
          */}
          <button
            type="button"
            {...row.attributes}
            {...row.listeners}
            aria-label={`Reorder ${label} — member ${index + 1} of ${total}`}
            className="shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:bg-accent active:cursor-grabbing"
          >
            <LuGripVertical className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onClick={onToggle}
            className="flex min-w-0 flex-1 items-center gap-1 rounded px-0.5 py-0.5 text-left text-xs font-medium hover:bg-accent"
          >
            <LuChevronRight
              aria-hidden
              className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
            <span className="truncate">{member.name || 'Unnamed member'}</span>
          </button>
          <IconButton
            icon={LuTrash2}
            label={canRemove ? `Remove ${label}` : `A council needs at least ${COUNCIL_MIN_MEMBERS} members`}
            size="sm"
            disabled={!canRemove}
            onClick={onRemove}
          />
        </div>
        {/* The agent and model, on the header's second line so a long model label never squeezes the name. */}
        <div className="pl-5">
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
      </div>
      <div id={bodyId} hidden={!expanded} className="border-t border-border px-2 pb-2 pt-1.5">
        <input
          value={member.name}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-label="Member name"
          className="w-full rounded border border-input bg-background px-1.5 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
        />
        <textarea
          value={member.role}
          rows={3}
          aria-label="Member perspective"
          onChange={(event) => onChange({ role: event.target.value })}
          className="mt-1.5 w-full resize-y rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
    </div>
  );
}
