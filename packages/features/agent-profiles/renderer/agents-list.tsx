import { useEffect, useMemo, useRef, useState } from 'react';
import { LuBot, LuCircleAlert, LuPlus, LuRotateCw, LuUpload } from 'react-icons/lu';

import { FilterInput, Skeleton, useFrameChrome } from '@midnite/studio-frame';
import { createBlankAgentProfile, duplicateAgentProfile, type AgentProfile } from '@midnite/studio-shared';

import { AgentCard } from './agent-card';
import { useAgentProfilesHost } from './host';
import { AGENT_PROFILE_TEMPLATES, type AgentProfileTemplate } from './templates';
import { TemplateMenu } from './template-menu';
import { useDeleteAgentProfile, useExportAgentProfile, useImportAgentProfile, useSaveAgentProfile } from './use-agent-profiles';
import { usePanelWidth } from './use-panel-width';
import { FOCUS_RING, PRIMARY_BUTTON, SECONDARY_BUTTON } from './ui';

/** The filter only earns its place once the list is long. */
const FILTER_MIN_AGENTS = 6;

type Focus = { kind: 'name'; id: string } | { kind: 'new' };

export type AgentsListProps = {
  profiles: AgentProfile[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Opens the Builder on `profile`; `isNew` marks an unsaved draft. */
  onOpen: (profile: AgentProfile, isNew: boolean) => void;
};

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 pl-4 motion-reduce:animate-none">
      <Skeleton className="h-4 w-2/5 motion-reduce:animate-none" />
      <Skeleton className="h-3 w-[70%] motion-reduce:animate-none" />
      <Skeleton className="h-3 w-[70%] motion-reduce:animate-none" />
      <div className="flex gap-1">
        <Skeleton className="h-4 w-16 rounded-full motion-reduce:animate-none" />
        <Skeleton className="h-4 w-12 rounded-full motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/** The Your agents tab: toolbar, then one card per saved agent, with loading, failed, empty and no-match states. */
export function AgentsList({ profiles, loading, error, onRetry, onOpen }: AgentsListProps) {
  const host = useAgentProfilesHost();
  const dialogs = useFrameChrome().useDialogs();
  const { agents } = host.useAgentRoster();
  const save = useSaveAgentProfile();
  const remove = useDeleteAgentProfile();
  const importer = useImportAgentProfile();
  const exporter = useExportAgentProfile();

  const root = useRef<HTMLDivElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const width = usePanelWidth(root);
  const [filter, setFilter] = useState('');
  const [focus, setFocus] = useState<Focus | null>(null);

  const sorted = useMemo(() => [...profiles].sort((a, b) => b.updatedAt - a.updatedAt), [profiles]);
  const baseLabel = (id: string): string => agents.find((a) => a.id === id)?.label ?? id;
  const showFilter = sorted.length > FILTER_MIN_AGENTS;
  const needle = filter.trim().toLowerCase();
  const visible = useMemo(
    () =>
      !showFilter || needle === ''
        ? sorted
        : sorted.filter((p) => `${p.name} ${p.description} ${baseLabel(p.baseAgentId)}`.toLowerCase().includes(needle)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, needle, showFilter, agents],
  );

  // Focus lands once the list has re-rendered with the card it points at.
  useEffect(() => {
    if (!focus) return;
    if (focus.kind === 'new') {
      newButton.current?.focus();
      setFocus(null);
      return;
    }
    const el = root.current?.querySelector<HTMLElement>(`[data-profile-name="${focus.id}"]`);
    if (el) {
      el.focus();
      setFocus(null);
    }
  }, [focus, visible]);

  const openTemplate = (template: AgentProfileTemplate): void => onOpen(template.apply(createBlankAgentProfile()), true);

  const duplicate = async (profile: AgentProfile): Promise<void> => {
    const copy = duplicateAgentProfile(
      profile,
      profiles.map((p) => p.name),
    );
    const outcome = await save.mutateAsync({ profile: copy, expectedUpdatedAt: null });
    if (outcome.status === 'saved') setFocus({ kind: 'name', id: outcome.profile.id });
  };

  const doImport = async (): Promise<void> => {
    const imported = await importer.mutateAsync();
    if (imported) setFocus({ kind: 'name', id: imported.id });
  };

  const confirmDelete = (profile: AgentProfile, live: number): void => {
    dialogs.confirm({
      title: `Delete ${profile.name}?`,
      body: 'This removes the agent and its saved prompt. It cannot be undone.',
      confirmLabel: 'Delete agent',
      danger: true,
      blastRadius: null,
      warnings: live > 0 ? [`${live} running session${live === 1 ? '' : 's'} keep going with the settings they started with.`] : [],
      onConfirm: () => {
        const index = sorted.findIndex((p) => p.id === profile.id);
        const neighbour = sorted[index + 1] ?? sorted[index - 1];
        void remove.mutateAsync(profile.id).then((ok) => {
          if (ok) setFocus(neighbour ? { kind: 'name', id: neighbour.id } : { kind: 'new' });
        });
      },
    });
  };

  const stacked = width < 560;
  let state: React.ReactNode = null;
  if (loading) {
    state = <p className="sr-only">Loading your agents…</p>;
  } else if (error !== null) {
    state = (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-2 py-10 text-center" data-testid="agents-error">
        <LuCircleAlert aria-hidden className="h-6 w-6 text-destructive" />
        <p className="text-sm">Couldn&apos;t load your agents.</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <button type="button" className={`inline-flex items-center gap-1.5 ${SECONDARY_BUTTON}`} onClick={onRetry}>
          <LuRotateCw aria-hidden className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  } else if (profiles.length === 0) {
    state = (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 py-8 text-center" data-testid="agents-empty">
        <LuBot aria-hidden className="h-8 w-8 text-muted-foreground" />
        <h2 className="text-sm font-medium">No agents yet</h2>
        <p className="text-xs text-muted-foreground">
          An agent is one of your CLIs with its own model, instructions, tools and limits. Start from a template or from scratch.
        </p>
        <div className={`grid w-full gap-3 text-left ${stacked ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {AGENT_PROFILE_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              data-testid={`agents-empty-template-${template.id}`}
              className={`flex flex-col gap-1 rounded-md border border-border bg-card p-3 transition-colors hover:border-foreground/20 ${FOCUS_RING}`}
              onClick={() => openTemplate(template)}
            >
              <span className="text-sm font-medium">{template.label}</span>
              <span className="text-xs text-muted-foreground">{template.summary}</span>
            </button>
          ))}
        </div>
        <button type="button" className={SECONDARY_BUTTON} onClick={() => onOpen(createBlankAgentProfile(), true)}>
          Start from scratch
        </button>
      </div>
    );
  } else if (visible.length === 0) {
    state = (
      <p className="py-6 text-center text-xs text-muted-foreground">
        No agents match &quot;{filter.trim()}&quot;.{' '}
        <button type="button" className={`rounded underline ${FOCUS_RING}`} onClick={() => setFilter('')}>
          Clear filter
        </button>
      </p>
    );
  }

  return (
    <div ref={root} className="flex flex-col gap-3" data-testid="agents-list">
      <div className="flex flex-wrap items-center gap-2">
        <button
          ref={newButton}
          type="button"
          data-testid="agents-new"
          className={`inline-flex items-center gap-1.5 ${PRIMARY_BUTTON}`}
          onClick={() => onOpen(createBlankAgentProfile(), true)}
        >
          <LuPlus aria-hidden className="h-3.5 w-3.5" />
          New agent
        </button>
        <TemplateMenu onPick={openTemplate} />
        <button
          type="button"
          data-testid="agents-import"
          disabled={importer.isPending}
          className={`inline-flex items-center gap-1.5 ${SECONDARY_BUTTON}`}
          onClick={() => void doImport()}
        >
          <LuUpload aria-hidden className="h-3.5 w-3.5" />
          Import
        </button>
        {showFilter ? <FilterInput value={filter} onChange={setFilter} placeholder="Filter agents…" className="ml-auto w-48" /> : null}
      </div>
      <div aria-live="polite" aria-busy={loading}>
        {state}
      </div>
      {loading ? (
        <div aria-busy="true" className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}
      {!loading && error === null && visible.length > 0 ? (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
          {visible.map((profile) => (
            <AgentCard
              key={profile.id}
              profile={profile}
              onEdit={(p) => onOpen(p, false)}
              onDuplicate={(p) => void duplicate(p)}
              onExport={(p) => void exporter.mutateAsync(p.id)}
              onDelete={confirmDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
