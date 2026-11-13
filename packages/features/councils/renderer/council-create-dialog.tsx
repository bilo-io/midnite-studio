import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LuSparkles, LuTrash2 } from 'react-icons/lu';

import { RingSpinner as Spinner, useFeatureFlag, useFocusTrap } from '@midnite/studio-frame';
import {
  COUNCIL_MEMBER_PROVIDERS,
  councilMemberCap,
  modelsForAgent,
  type CouncilMember,
  type CouncilMemberProvider,
  type CouncilRecommendedMember,
} from '@midnite/studio-shared';

import { councilModelOptions, DEFAULT_MODEL_ID, useCouncilProviders } from './council-providers';
import { useCouncilsHost } from './host';
import { IconButton } from './ui';
import { useCreateCouncil, useRecommendCouncil } from './use-council';

/** What Create hands back: a name, and the panel the user accepted from a recommendation, if any. */
export type NewCouncilInput = {
  name: string;
  description?: string;
  members?: CouncilMember[];
  synthProvider?: CouncilMemberProvider;
  synthModel?: string;
};

const isProvider = (id: string): id is CouncilMemberProvider => (COUNCIL_MEMBER_PROVIDERS as readonly string[]).includes(id);

/** A picker model id as stored: absent for the CLI's default. */
const storedModel = (id: string): string | undefined => (id === DEFAULT_MODEL_ID ? undefined : id);

const FIELD =
  'mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring';

/**
 * The new-council modal. A name (and optional description) creates a council
 * seeded with the starter members, as before. "Recommend members" (Phase 133
 * Theme E) takes a one-line brief, asks a small, fast model in main for a panel,
 * and lists it here for the user to edit or trim before Create — nothing is
 * created until then.
 *
 * Portalled to the body: it opens from the rail, whose sliding panel-stack pane
 * is transformed, and a `fixed` overlay inside a transformed ancestor is
 * confined to that pane instead of the window.
 */
export function CouncilCreateDialog({
  onCancel,
  onCreate,
  busy = false,
}: {
  onCancel: () => void;
  onCreate: (input: NewCouncilInput) => void;
  busy?: boolean;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brief, setBrief] = useState('');
  const [members, setMembers] = useState<CouncilRecommendedMember[] | null>(null);
  const [synthProvider, setSynthProvider] = useState<CouncilMemberProvider>('claude');
  const [synthModel, setSynthModel] = useState<string | undefined>(undefined);
  const [recommendError, setRecommendError] = useState<string | null>(null);
  const containerRef = useRef<HTMLFormElement>(null);
  useCouncilsHost().useOccluder(true);
  useFocusTrap(containerRef, true);
  const { providers, installed } = useCouncilProviders();
  const { ProviderModelPicker } = useCouncilsHost();
  const recommend = useRecommendCouncil();
  const cap = councilMemberCap(useFeatureFlag('councils.pro'));

  const trimmedName = name.trim();
  const accepted = (members ?? []).filter((m) => m.name.trim().length > 0 && m.role.trim().length > 0);
  const canCreate = trimmedName.length > 0 && !busy && (members === null || accepted.length > 0);

  const askForRecommendation = () => {
    if (trimmedName.length === 0 || recommend.isPending) return;
    setRecommendError(null);
    recommend.mutate(
      {
        name: trimmedName,
        ...(brief.trim() ? { brief: brief.trim() } : {}),
        providers: installed,
        maxMembers: cap,
        models: installed.map((provider) => ({
          provider,
          models: modelsForAgent(provider)
            .map((m) => m.id)
            .filter((id) => id !== DEFAULT_MODEL_ID),
        })),
      },
      {
        onSuccess: (result) => {
          if (!result.ok) {
            setRecommendError(result.kind === 'error' ? result.message : 'Could not get a recommendation.');
            return;
          }
          setMembers(result.value.members.slice(0, cap));
          setSynthProvider(result.value.synthProvider);
          setSynthModel(undefined);
          if (description.trim().length === 0 && result.value.description) setDescription(result.value.description);
        },
      },
    );
  };

  const submit = () => {
    if (!canCreate) return;
    onCreate({
      name: trimmedName,
      ...(description.trim().length > 0 ? { description: description.trim() } : {}),
      ...(members === null
        ? {}
        : {
            members: accepted.map((m) => ({
              id: crypto.randomUUID(),
              name: m.name.trim(),
              role: m.role.trim(),
              provider: m.provider,
              ...(m.model ? { model: m.model } : {}),
            })),
            synthProvider,
            ...(synthModel ? { synthModel } : {}),
          }),
    });
  };

  /** A recommended-member edit; an `undefined` model goes back to the CLI's default. */
  const patchMember = (index: number, patch: { [K in keyof CouncilRecommendedMember]?: CouncilRecommendedMember[K] | undefined }) =>
    setMembers((current) =>
      (current ?? []).map((m, i) => {
        if (i !== index) return m;
        const next: Record<string, unknown> = { ...m };
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) delete next[key];
          else next[key] = value;
        }
        return next as CouncilRecommendedMember;
      }),
    );

  return createPortal(
    <div
      className="fixed inset-0 z-dialog flex items-center justify-center bg-background/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="New council"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        ref={containerRef}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-border bg-popover p-4 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h2 className="text-sm font-semibold">New council</h2>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <label className="mt-3 block text-xs text-muted-foreground" htmlFor="council-name">
            Name
          </label>
          <input
            id="council-name"
            value={name}
            autoFocus
            placeholder="e.g. Architecture review"
            onChange={(event) => setName(event.target.value)}
            className={FIELD}
          />

          <label className="mt-3 block text-xs text-muted-foreground" htmlFor="council-description">
            Description (optional)
          </label>
          <textarea
            id="council-description"
            value={description}
            rows={2}
            placeholder="What this panel is for"
            onChange={(event) => setDescription(event.target.value)}
            className={`${FIELD} resize-none`}
          />

          <div className="mt-4 rounded-md border border-border p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <LuSparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
              Recommend members
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              A small, fast model proposes a panel for this council. You can edit or remove any member before Create.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    askForRecommendation();
                  }
                }}
                placeholder="One line on what it should weigh up (optional)"
                aria-label="Recommendation brief"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                type="button"
                onClick={askForRecommendation}
                disabled={trimmedName.length === 0 || recommend.isPending || installed.length === 0}
                title={trimmedName.length === 0 ? 'Name the council first' : undefined}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs transition-colors hover:bg-accent disabled:opacity-40"
              >
                {recommend.isPending ? <Spinner size="xs" tone="inherit" /> : null}
                {recommend.isPending ? 'Asking…' : members ? 'Recommend again' : 'Recommend'}
              </button>
            </div>
            {recommendError ? (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {recommendError}
              </p>
            ) : null}

            {members ? (
              <div className="mt-3 flex flex-col gap-2" data-testid="council-recommendation">
                {members.map((member, index) => (
                  <div key={index} className="rounded-md border border-border p-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        value={member.name}
                        onChange={(event) => patchMember(index, { name: event.target.value })}
                        aria-label="Recommended member name"
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs font-medium outline-none focus:border-input focus:bg-background"
                      />
                      <ProviderModelPicker
                        providers={providers}
                        provider={member.provider}
                        onProviderChange={(id) => isProvider(id) && patchMember(index, { provider: id, model: undefined })}
                        models={councilModelOptions(member.provider)}
                        model={member.model ?? DEFAULT_MODEL_ID}
                        onModelChange={(id) => patchMember(index, { model: storedModel(id) })}
                        testId={`council-recommended-picker-${index}`}
                      />
                      <IconButton
                        icon={LuTrash2}
                        label="Remove recommended member"
                        size="sm"
                        onClick={() => setMembers((current) => (current ?? []).filter((_, i) => i !== index))}
                      />
                    </div>
                    <textarea
                      value={member.role}
                      rows={2}
                      onChange={(event) => patchMember(index, { role: event.target.value })}
                      aria-label="Recommended member role"
                      className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Synthesize with</span>
                  <ProviderModelPicker
                    providers={providers}
                    provider={synthProvider}
                    onProviderChange={(id) => {
                      if (!isProvider(id)) return;
                      setSynthProvider(id);
                      setSynthModel(undefined);
                    }}
                    models={councilModelOptions(synthProvider)}
                    model={synthModel ?? DEFAULT_MODEL_ID}
                    onModelChange={(id) => setSynthModel(storedModel(id))}
                    testId="council-recommended-synth-picker"
                  />
                  <button
                    type="button"
                    onClick={() => setMembers(null)}
                    className="ml-auto text-[11px] underline-offset-2 hover:underline"
                  >
                    Use the starter members instead
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-muted-foreground">Without a recommendation the council starts as a Brainstorm with three starter members.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canCreate}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** The modal plus its create call — what both the council list and a council's thread rail open. */
export function NewCouncilDialog({ onCancel, onCreated }: { onCancel: () => void; onCreated: (councilId: string) => void }) {
  const create = useCreateCouncil();
  return (
    <CouncilCreateDialog
      onCancel={onCancel}
      busy={create.isPending}
      onCreate={(input) =>
        create.mutate(input, {
          onSuccess: (result) => {
            if (result.ok) onCreated(result.value.id);
          },
        })
      }
    />
  );
}
