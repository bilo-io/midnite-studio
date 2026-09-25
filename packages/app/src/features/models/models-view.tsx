import type { OllamaModel, OllamaRunningModel, OllamaSearchResultItem } from '@midnite/studio-shared';
import { isOllamaCloudModelName, toOllamaCloudModelName } from '@midnite/studio-shared';
import { useEffect, useState, type ReactNode } from 'react';
import {
  LuDownload,
  LuExternalLink,
  LuPlay,
  LuSearch,
  LuSquare,
  LuTerminal,
  LuTrash2,
  LuX,
} from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { LoadingRegion, Skeleton, Spinner } from '../../components/skeleton';
import { bridge } from '../../services/bridge';
import { openExternal } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { formatBytes } from '../monitor/format-bytes';
import { submitCommand } from '../settings/settings-pages/health-page';
import { ModelDetailModal } from './model-detail';
import { PullModelField } from './pull-model-field';
import { useModelsPullQueueStore, type PullEntry } from './models-pull-queue-store';
import {
  useDeleteModel,
  useOllamaApiKeyHasKey,
  useOllamaCloudList,
  useOllamaModels,
  useOllamaRunning,
  useOllamaSearch,
  useOllamaShow,
  useOllamaSignInStatus,
  useOllamaStatus,
  usePullCancel,
  usePullModel,
  useRefetchModelsOnFocus,
  useRefetchModelsOnPullDone,
  useUnloadModel,
} from './use-models';

/** ~300ms, matching `finance-panel.tsx`'s own search debounce. */
const SEARCH_DEBOUNCE_MS = 300;

type ModelsTab = 'installed' | 'discover' | 'cloud';

/**
 * Models (Phase 96 Themes C, D, F) — global, not per-repo, like Video Studio:
 * an Ollama daemon and its installed models are a property of the machine,
 * not of an open checkout.
 *
 * Three tabs: **Installed** (Theme C), **Discover** (Theme D — scraped
 * `ollama.com/search`) and **Cloud** (Theme F — `ollama.com/api/tags`). Theme
 * C shipped Installed alone deliberately (a tab strip with two disabled
 * placeholders is the "dead wiring" Theme B's own scope note argues against
 * for an unbacked channel) — this is where Discover and Cloud land.
 */
export function ModelsView() {
  const status = useOllamaStatus();
  const [tab, setTab] = useState<ModelsTab>('installed');
  useRefetchModelsOnPullDone();
  useRefetchModelsOnFocus();

  if (status.isLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!status.data?.reachable) {
    return <DaemonDownState onStarted={() => void status.refetch()} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <header className="flex items-center gap-2">
        <SiOllama aria-hidden className="h-5 w-5" />
        <h1 className="text-sm font-semibold">Models</h1>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {status.data.host}
          {status.data.version ? ` · v${status.data.version}` : ''}
        </span>
      </header>

      <TabStrip tab={tab} onChange={setTab} />

      {tab === 'installed' ? (
        <>
          <PullModelField />
          <PullQueuePanel />
          <InstalledList />
        </>
      ) : tab === 'discover' ? (
        <DiscoverTab />
      ) : (
        <CloudTab />
      )}
    </div>
  );
}

function TabStrip({ tab, onChange }: { tab: ModelsTab; onChange: (tab: ModelsTab) => void }) {
  const tabs: { id: ModelsTab; label: string }[] = [
    { id: 'installed', label: 'Installed' },
    { id: 'discover', label: 'Discover' },
    { id: 'cloud', label: 'Cloud' },
  ];
  return (
    <div role="tablist" className="flex items-center gap-1 border-b border-border/60">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors ${
            tab === t.id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function DaemonDownState({ onStarted }: { onStarted: () => void }) {
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    const health = await bridge()?.systemHealth();
    const isAppBundle = Boolean(health?.ollama?.path?.includes('/Applications/Ollama.app'));
    submitCommand(isAppBundle ? 'open -a Ollama' : 'ollama serve &', 'Start Ollama');
    // Bounded re-probe, mirroring the Health page's own Start Ollama button —
    // a fresh `ollama serve` is not instant.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      onStarted();
    }
    setStarting(false);
  };

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <EmptyState
          icon={SiOllama}
          title="Ollama isn't running"
          body="Start the daemon to see installed models, pull new ones, and point an agent at a local model."
        />
        <button
          type="button"
          onClick={() => void start()}
          disabled={starting}
          className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {starting ? <Spinner className="h-3.5 w-3.5" /> : <LuPlay className="h-3.5 w-3.5" />}
          Start Ollama
        </button>
      </div>
    </div>
  );
}

function PullQueuePanel() {
  const pulls = useModelsPullQueueStore((s) => s.pulls);
  const dismiss = useModelsPullQueueStore((s) => s.dismiss);
  const cancel = usePullCancel();
  const entries = Object.values(pulls).sort((a, b) => b.startedAt - a.startedAt);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 bg-card/40 p-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Pull queue
      </span>
      {entries.map((entry) => (
        <PullRow
          key={entry.pullId}
          entry={entry}
          onCancel={() => cancel.mutate(entry.pullId)}
          onDismiss={() => dismiss(entry.pullId)}
        />
      ))}
    </div>
  );
}

function PullRow({
  entry,
  onCancel,
  onDismiss,
}: {
  entry: PullEntry;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const fraction =
    entry.total && entry.total > 0 && entry.completed !== undefined
      ? Math.min(1, entry.completed / entry.total)
      : null;

  return (
    <div className="flex flex-col gap-1 rounded border border-border/50 p-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs">{entry.model}</span>
        <div className="flex items-center gap-1">
          {!entry.done ? (
            <IconButton icon={LuX} label="Cancel pull" size="sm" onClick={onCancel} />
          ) : (
            <IconButton icon={LuX} label="Dismiss" size="sm" onClick={onDismiss} />
          )}
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-[width] ${entry.failed ? 'bg-destructive' : 'bg-primary'}`}
          style={{ width: `${fraction !== null ? fraction * 100 : entry.done ? 100 : 4}%` }}
        />
      </div>
      <span className={`text-[11px] ${entry.failed ? 'text-destructive' : 'text-muted-foreground'}`}>
        {entry.status}
        {entry.total !== undefined && entry.completed !== undefined
          ? ` — ${formatBytes(entry.completed)} / ${formatBytes(entry.total)}`
          : ''}
      </span>
    </div>
  );
}

function InstalledList() {
  const models = useOllamaModels();
  const running = useOllamaRunning();
  const runningByName = new Map((running.data ?? []).map((row) => [row.model, row]));
  const [detailModel, setDetailModel] = useState<OllamaModel | null>(null);

  if (models.isLoading) {
    return (
      <LoadingRegion label="Loading installed models">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </LoadingRegion>
    );
  }

  if ((models.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={SiOllama}
        title="No models installed yet"
        body="Search ollama.com above and pull a variant to get started."
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {(models.data ?? []).map((model) => (
        <ModelRow
          key={model.digest}
          model={model}
          running={runningByName.get(model.model)}
          onOpenDetail={setDetailModel}
        />
      ))}
      <ModelDetailModal
        open={detailModel !== null}
        onClose={() => setDetailModel(null)}
        model={detailModel}
        running={detailModel ? runningByName.get(detailModel.model) : undefined}
      />
    </div>
  );
}

/**
 * `onOpenDetail` — Theme E's model-detail modal (`model-detail.tsx`), wired
 * from `InstalledList` above. Takes the full row (not just its name/tag) so
 * the modal has size/modified-date without a second `list` round-trip — the
 * `list`-fetched `OllamaModel` and the `show`-fetched `OllamaModelDetail`
 * are two different shapes on the wire (Theme B), and only the list carries
 * those two fields.
 */
function ModelRow({
  model,
  running,
  onOpenDetail = () => {},
}: {
  model: OllamaModel;
  running: OllamaRunningModel | undefined;
  onOpenDetail?: (model: OllamaModel) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detail = useOllamaShow(expanded ? model.model : null);
  const unload = useUnloadModel();
  const remove = useDeleteModel();
  const dialogs = useDialogs();

  const details = model.details;
  const capabilities = detail.data?.capabilities ?? [];

  const deleteModel = () => {
    dialogs.confirm({
      title: `Delete "${model.name}"?`,
      body: `This removes ${formatBytes(model.size)} from disk. This cannot be undone.${
        running ? ' This model is currently loaded and will be unloaded first.' : ''
      }`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => remove.mutate(model.model),
    });
  };

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border/60 p-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setExpanded((value) => !value);
            onOpenDetail(model);
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <SiOllama aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate font-mono text-xs font-medium">{model.name}</span>
          {running ? (
            <span className="shrink-0 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
              running{running.sizeVram ? ` · ${formatBytes(running.sizeVram)} VRAM` : ''}
            </span>
          ) : null}
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">{formatBytes(model.size)}</span>
        {running ? (
          <IconButton
            icon={LuSquare}
            label="Unload"
            size="sm"
            onClick={() => unload.mutate(model.model)}
            disabled={unload.isPending}
          />
        ) : null}
        <IconButton
          icon={LuTrash2}
          label="Delete"
          size="sm"
          onClick={deleteModel}
          disabled={remove.isPending}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pl-6 text-[11px] text-muted-foreground">
        {details?.family ? <Chip>{details.family}</Chip> : null}
        {details?.parameterSize ? <Chip>{details.parameterSize}</Chip> : null}
        {details?.quantizationLevel ? <Chip>{details.quantizationLevel}</Chip> : null}
        {model.modifiedAt ? <span>modified {new Date(model.modifiedAt).toLocaleDateString()}</span> : null}
      </div>

      {expanded ? (
        <div className="flex flex-wrap gap-1 pl-6">
          {detail.isLoading ? (
            <Spinner className="h-3 w-3" />
          ) : capabilities.length > 0 ? (
            capabilities.map((cap) => (
              <Chip key={cap} tone="accent">
                {cap}
              </Chip>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground">No reported capabilities.</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'accent' | 'selected';
}) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        tone === 'accent'
          ? 'bg-primary/10 text-primary'
          : tone === 'selected'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}

// --- Discover (Phase 96 Theme D) ---------------------------------------------

/** `name:variant`, or the bare name for a variant-less result — and the
 *  `-cloud` suffix a cloud result's own variant tags need (`gpt-oss:120b-cloud`,
 *  per the phase doc's own "Ollama facts"), never a bare `:cloud` on a sized tag. */
function searchResultPullTarget(item: OllamaSearchResultItem, variant: string | null): string {
  const tagged = variant ? `${item.name}:${variant}` : item.name;
  return item.cloud ? toOllamaCloudModelName(tagged) : tagged;
}

/** Whether a search/cloud result (or one of its variants) is already installed. */
function isResultInstalled(item: OllamaSearchResultItem, installed: Set<string>, variant: string | null): boolean {
  return installed.has(searchResultPullTarget(item, variant));
}

function DiscoverTab() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [scope, setScope] = useState<'local' | 'cloud'>('local');
  const [capabilityFilter, setCapabilityFilter] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const search = useOllamaSearch(debounced, scope);
  const installedModels = useOllamaModels();
  const installed = new Set((installedModels.data ?? []).map((m) => m.model));

  const items = search.data?.items ?? [];
  const capabilities = Array.from(new Set(items.flatMap((item) => item.capabilities ?? []))).sort();
  const filtered = capabilityFilter
    ? items.filter((item) => (item.capabilities ?? []).includes(capabilityFilter))
    : items;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <LuSearch
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ollama.com — qwen, llama, embedding…"
            className="h-7 w-full rounded-md border border-border bg-card pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-[11px]">
          {(['local', 'cloud'] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={`rounded px-2 py-0.5 font-medium capitalize transition-colors ${
                scope === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {capabilities.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {capabilities.map((cap) => (
            <button key={cap} type="button" onClick={() => setCapabilityFilter((f) => (f === cap ? null : cap))}>
              <Chip tone={capabilityFilter === cap ? 'selected' : 'accent'}>{cap}</Chip>
            </button>
          ))}
        </div>
      ) : null}

      {debounced.length === 0 ? (
        <EmptyState
          icon={SiOllama}
          title="Search ollama.com"
          body="Find a model by name or capability — local and cloud results, both filterable."
        />
      ) : search.isLoading ? (
        <LoadingRegion label="Searching ollama.com">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </LoadingRegion>
      ) : search.data?.parseFailed ? (
        <SearchFallback query={debounced} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={SiOllama} title="No results" body={`No models matched "${debounced}" on ollama.com.`} />
      ) : (
        <div className="flex flex-col gap-1.5">
          {search.data?.stale ? (
            <p className="text-[11px] text-muted-foreground">
              Showing a cached result — ollama.com could not be reached just now.
            </p>
          ) : null}
          {filtered.map((item) => (
            <SearchResultCard key={item.name} item={item} installed={installed} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The Discover checklist's own fallback for `{kind:'error', code:'parse'}` —
 *  a link out plus the always-visible pull-by-name field above the tab strip. */
function SearchFallback({ query }: { query: string }) {
  return (
    <EmptyState
      icon={SiOllama}
      title="Couldn't read ollama.com's results"
      body="Use the Installed tab's pull search, or open ollama.com directly."
      action={
        <button
          type="button"
          onClick={() => openExternal(`https://ollama.com/search?q=${encodeURIComponent(query)}`)}
          className="flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <LuExternalLink className="h-3 w-3" />
          Open ollama.com/search
        </button>
      }
    />
  );
}

/**
 * `onOpenDetail` — same no-op-by-default hook `ModelRow`'s Installed row
 * takes, so Theme E's model-detail modal has one consistent place to wire
 * into across all three tabs rather than plumbing it through fresh here.
 */
function SearchResultCard({
  item,
  installed,
  onOpenDetail = () => {},
}: {
  item: OllamaSearchResultItem;
  installed: Set<string>;
  onOpenDetail?: (model: string) => void;
}) {
  const variants = item.variants ?? [];
  const [variant, setVariant] = useState<string | null>(variants[0] ?? null);
  const pull = usePullModel();
  const queued = useModelsPullQueueStore((s) => s.queued);

  const alreadyInstalled = isResultInstalled(item, installed, variant);

  const doPull = () => {
    const target = searchResultPullTarget(item, variant);
    pull.mutate(target, {
      onSuccess: (result) => {
        if (result.ok) queued(result.value.pullId, result.value.model);
      },
    });
  };

  return (
    <div className="flex items-stretch justify-between gap-3 rounded-md border border-border/60 p-2">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <SiOllama aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenDetail(searchResultPullTarget(item, variant))}
            className="w-full text-left"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-medium">{item.name}</span>
              {item.cloud ? <Chip tone="accent">cloud</Chip> : null}
              {(item.capabilities ?? []).map((cap) => (
                <Chip key={cap}>{cap}</Chip>
              ))}
            </div>
            {item.description ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
            ) : null}
          </button>

          {variants.length > 1 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {variants.map((v) => (
                <button key={v} type="button" onClick={() => setVariant(v)}>
                  <Chip tone={variant === v ? 'selected' : 'muted'}>{v}</Chip>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between gap-1 text-right text-[11px] text-muted-foreground">
        <div>
          {alreadyInstalled ? (
            <Chip tone="accent">Installed</Chip>
          ) : (
            <button
              type="button"
              onClick={doPull}
              disabled={pull.isPending}
              className="flex h-6 items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {pull.isPending ? <Spinner className="h-3 w-3" /> : <LuDownload className="h-3 w-3" />}
              {item.cloud ? 'Use' : 'Pull'}
            </button>
          )}
        </div>
        <div className="my-auto">{item.pulls ? <span>{item.pulls} pulls</span> : null}</div>
        <div>{item.updatedAt ? <span>updated {item.updatedAt}</span> : null}</div>
      </div>
    </div>
  );
}

// --- Cloud (Phase 96 Theme F) -------------------------------------------------

function CloudTab() {
  const signIn = useOllamaSignInStatus();
  const hasKey = useOllamaApiKeyHasKey();
  const signedIn = signIn.data?.signedIn ?? false;
  const canList = signedIn || (hasKey.data?.hasKey ?? false);
  const cloud = useOllamaCloudList(canList);
  const installedModels = useOllamaModels();
  const installed = new Set((installedModels.data ?? []).map((m) => m.model));

  if (signIn.isLoading || hasKey.isLoading) {
    return (
      <LoadingRegion label="Checking cloud access">
        <Skeleton className="h-16 w-full" />
      </LoadingRegion>
    );
  }

  if (!canList) {
    return <CloudSignedOutState />;
  }

  if (cloud.isLoading) {
    return (
      <LoadingRegion label="Loading the cloud catalogue">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </LoadingRegion>
    );
  }

  const models = cloud.data ?? [];
  if (models.length === 0) {
    return (
      <EmptyState
        icon={SiOllama}
        title="No cloud models"
        body="ollama.com/api/tags returned nothing right now."
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {models.map((model) => (
        <CloudModelRow key={model.digest} model={model} installed={installed} />
      ))}
    </div>
  );
}

function CloudSignedOutState() {
  const goToSettings = () => {
    useUiStore.getState().setActiveView('settings');
    useUiStore.getState().setSettingsPage('ollama');
  };

  return (
    <EmptyState
      icon={SiOllama}
      title="Not signed in to ollama.com"
      body="Sign in from a terminal, or add a cloud API key in Settings ▸ Ollama, to browse the cloud catalogue."
      action={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => submitCommand('ollama signin', 'ollama sign in')}
            className="flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            <LuTerminal className="h-3 w-3" />
            Run ollama signin
          </button>
          <button
            type="button"
            onClick={goToSettings}
            className="flex items-center gap-1.5 rounded-md border border-primary bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            Settings ▸ Ollama
          </button>
        </div>
      }
    />
  );
}

function CloudModelRow({
  model,
  installed,
  onOpenDetail = () => {},
}: {
  model: OllamaModel;
  installed: Set<string>;
  onOpenDetail?: (model: string) => void;
}) {
  const pull = usePullModel();
  const queued = useModelsPullQueueStore((s) => s.queued);
  const target = isOllamaCloudModelName(model.model) ? model.model : toOllamaCloudModelName(model.model);
  const alreadyInstalled = installed.has(target);

  const doPull = () => {
    pull.mutate(target, {
      onSuccess: (result) => {
        if (result.ok) queued(result.value.pullId, result.value.model);
      },
    });
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 p-2">
      <SiOllama aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={() => onOpenDetail(target)}
        className="min-w-0 flex-1 truncate text-left font-mono text-xs font-medium"
      >
        {model.name}
      </button>
      {model.details?.parameterSize ? <Chip>{model.details.parameterSize}</Chip> : null}
      {alreadyInstalled ? (
        <Chip tone="accent">Installed</Chip>
      ) : (
        <button
          type="button"
          onClick={doPull}
          disabled={pull.isPending}
          className="flex h-6 items-center gap-1 rounded-md border border-primary bg-primary/10 px-2 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
        >
          {pull.isPending ? <Spinner className="h-3 w-3" /> : <LuDownload className="h-3 w-3" />}
          Use
        </button>
      )}
    </div>
  );
}
