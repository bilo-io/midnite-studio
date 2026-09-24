import type { OllamaModel, OllamaRunningModel } from '@midnite/studio-shared';
import { useState, type ReactNode } from 'react';
import { LuDownload, LuPlay, LuSquare, LuTrash2, LuX } from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { useDialogs } from '../../components/dialog-host';
import { EmptyState } from '../../components/empty-state';
import { IconButton } from '../../components/icon-button';
import { LoadingRegion, Skeleton, Spinner } from '../../components/skeleton';
import { bridge } from '../../services/bridge';
import { formatBytes } from '../monitor/format-bytes';
import { submitCommand } from '../settings/settings-pages/health-page';
import { ModelDetailModal } from './model-detail';
import { useModelsPullQueueStore, type PullEntry } from './models-pull-queue-store';
import {
  useDeleteModel,
  useOllamaModels,
  useOllamaRunning,
  useOllamaShow,
  useOllamaStatus,
  usePullCancel,
  usePullModel,
  useRefetchModelsOnFocus,
  useRefetchModelsOnPullDone,
  useUnloadModel,
} from './use-models';

/**
 * Models (Phase 96 Theme C) — global, not per-repo, like Video Studio: an
 * Ollama daemon and its installed models are a property of the machine, not
 * of an open checkout.
 *
 * The whole view is one pane rather than the eventual Installed/Discover/
 * Cloud tab strip the phase doc lays out — Discover (Theme D) and Cloud
 * (Theme F) do not exist yet in this PR, and a tab strip with two disabled
 * placeholders is exactly the "dead wiring" Theme B's own scope note argues
 * against for an unbacked channel. The tab strip lands with Theme D.
 */
export function ModelsView() {
  const status = useOllamaStatus();
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

      <PullByNameField />
      <PullQueuePanel />
      <InstalledList />
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

function PullByNameField() {
  const [name, setName] = useState('');
  const pull = usePullModel();
  const queued = useModelsPullQueueStore((s) => s.queued);

  const submit = () => {
    const model = name.trim();
    if (!model) return;
    pull.mutate(model, {
      onSuccess: (result) => {
        if (result.ok) queued(result.value.pullId, result.value.model);
      },
    });
    setName('');
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Pull by name — qwen3.5:14b, gpt-oss:120b-cloud…"
        className="h-7 flex-1 rounded-md border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      />
      <button
        type="submit"
        disabled={name.trim().length === 0 || pull.isPending}
        className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
      >
        {pull.isPending ? <Spinner className="h-3 w-3" /> : <LuDownload className="h-3 w-3" />}
        Pull
      </button>
    </form>
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
        body="Pull one by name above to get started."
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

function Chip({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'accent' }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
        tone === 'accent' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
      }`}
    >
      {children}
    </span>
  );
}
