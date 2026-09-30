import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LuTriangleAlert } from 'react-icons/lu';

import {
  OLLAMA_CATALOGUE,
  OLLAMA_CATALOGUE_TIERS,
  ollamaRamFit,
  planSetupInstall,
  setupItem,
  type OllamaCatalogueModel,
  type OllamaCatalogueTier,
  type OllamaRamFit,
} from '@midnite/studio-shared';

import { bridge } from '../../../services/bridge';
import { useUiStore } from '../../../store/ui-store';
import { useModelsPullQueueStore } from '../../models/models-pull-queue-store';
import { useOllamaModels, useOllamaStatus } from '../../models/use-models';
import { submitCommand } from '../../terminal/submit-command';
import { useInstallRunner, useSetupProbe } from '../install-runner';
import { resolveSetupIcon } from '../setup-icons';
import { useSetupStore } from '../setup-store';
import { SetupStatusRow, setupRowStatus } from '../setup-status-row';

const TIER_LABEL: Record<OllamaCatalogueTier, string> = {
  small: 'Small',
  coder: 'Coder',
  reasoning: 'Reasoning',
};

const FIT_LABEL: Record<OllamaRamFit, string> = { fits: 'Fits', tight: 'Tight', 'too-big': 'Too big' };
const FIT_STYLE: Record<OllamaRamFit, string> = {
  fits: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  tight: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'too-big': 'bg-red-500/15 text-red-700 dark:text-red-300',
};

function formatGb(bytes: number): string {
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

/** This Mac's installed RAM, read once — RAM does not change while the app runs. */
function useSystemMemory(): number | null {
  const { data } = useQuery({
    queryKey: ['system-memory'],
    queryFn: async () => (await window.midniteStudio?.systemMemory?.())?.totalBytes ?? null,
    staleTime: Infinity,
  });
  return data ?? null;
}

/**
 * Local models with Ollama (Phase 98 Theme I), a page over Phase 96's pieces:
 * `ollamaStatus` for the daemon, the Theme D probe + install runner for the
 * app itself, `ollamaPull` and the module-level pull queue for downloads.
 *
 * A pull started here is not owned by this page. Its progress feeds
 * `useModelsPullQueueStore` from the app-level subscription
 * (`useRefetchModelsOnPullDone`, mounted in `Shell`), so it keeps running —
 * and the Models view shows it — after the wizard moves on or closes.
 */
export function OllamaPage() {
  const totalBytes = useSystemMemory();
  const probe = useSetupProbe(['homebrew', 'ollama']);
  const status = useOllamaStatus();
  const installed = useOllamaModels();
  const pulls = useModelsPullQueueStore((s) => s.pulls);
  const queued = useModelsPullQueueStore((s) => s.queued);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const installer = useInstallRunner(() => void probe.refetch());
  const item = setupItem('ollama');
  const ollamaProbe = probe.data?.['ollama'];
  const brewInstalled = probe.data?.['homebrew']?.installed ?? false;
  const daemonUp = status.data?.reachable ?? false;

  const rowStatus = setupRowStatus({
    loading: probe.isLoading,
    installing: installer.running,
    installed: probe.isLoading ? undefined : (ollamaProbe?.installed ?? false) || daemonUp,
  });

  const installPlan = item ? planSetupInstall([item], brewInstalled) : [];
  const installedNames = new Set((installed.data ?? []).map((model) => model.name));
  const hasModel = (tag: string): boolean =>
    installedNames.has(tag) || [...installedNames].some((name) => name === `${tag}:latest`);
  const pullFor = (tag: string) => Object.values(pulls).find((pull) => pull.model === tag && !pull.failed);

  const toggle = (tag: string): void =>
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });

  const startDaemon = async (): Promise<void> => {
    setStarting(true);
    submitCommand('open -a Ollama', 'Start Ollama');
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await status.refetch();
    }
    setStarting(false);
  };

  const download = async (): Promise<void> => {
    const api = bridge();
    if (!api) return;
    setError(null);
    for (const tag of ticked) {
      if (hasModel(tag) || pullFor(tag)) continue;
      const result = await api.ollama.pull({ model: tag });
      if (result.ok) queued(result.value.pullId, result.value.model);
      else setError(result.kind === 'error' ? result.message : `Couldn't start ${tag}`);
    }
    setTicked(new Set());
  };

  const openModels = (): void => {
    useUiStore.getState().setActiveView('models');
    useSetupStore.getState().stepAside();
  };

  const tickedCount = [...ticked].filter((tag) => !hasModel(tag) && !pullFor(tag)).length;
  const tickedTooBig = OLLAMA_CATALOGUE.some(
    (model) => ticked.has(model.tag) && totalBytes !== null && ollamaRamFit(totalBytes, model.minRamGb) === 'too-big',
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Ollama</span> runs language models on this Mac, so an agent can
          work with no API key and no code leaving the machine.
        </p>
        <p>
          16 GB of memory is comfortable; 8 GB is enough for the small models. This Mac has{' '}
          <span className="font-medium text-foreground">
            {totalBytes === null ? '…' : `${Math.round(totalBytes / 2 ** 30)} GB`}
          </span>
          . You can manage models any time in the{' '}
          <button type="button" onClick={openModels} className="text-primary underline underline-offset-2">
            Models view
          </button>
          .
        </p>
      </div>

      <SetupStatusRow
        label="Ollama"
        status={rowStatus}
        icon={item ? resolveSetupIcon(item.icon) : undefined}
        detail={
          rowStatus === 'ready'
            ? daemonUp
              ? `Running${status.data?.version ? ` · ${status.data.version}` : ''}`
              : 'Installed, not running'
            : rowStatus === 'missing'
              ? 'Not installed'
              : undefined
        }
        onRevealTerminal={installer.reveal}
        action={
          rowStatus === 'missing' ? (
            <div className="flex gap-1.5">
              {installPlan.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => installer.run(option.command, `Setup: ${option.label}`)}
                  className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null
        }
      />
      {rowStatus === 'ready' && !daemonUp && !status.isLoading ? (
        <div>
          <button
            type="button"
            disabled={starting}
            onClick={() => void startDaemon()}
            className="rounded border border-primary bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start Ollama'}
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3" data-testid="setup-ollama-catalogue">
        {OLLAMA_CATALOGUE_TIERS.map((tier) => (
          <section key={tier} aria-label={TIER_LABEL[tier]} className="flex flex-col gap-1">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {TIER_LABEL[tier]}
            </h3>
            {OLLAMA_CATALOGUE.filter((model) => model.tier === tier).map((model) => (
              <ModelRow
                key={model.tag}
                model={model}
                fit={totalBytes === null ? null : ollamaRamFit(totalBytes, model.minRamGb)}
                checked={ticked.has(model.tag)}
                has={hasModel(model.tag)}
                progress={pullFor(model.tag)}
                onToggle={() => toggle(model.tag)}
              />
            ))}
          </section>
        ))}
      </div>

      {tickedTooBig ? (
        <p role="note" className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <LuTriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A ticked model needs more memory than this Mac has. It may run very slowly or not at all.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={tickedCount === 0 || !daemonUp}
          onClick={() => void download()}
          className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {tickedCount > 0 ? `Download ${tickedCount} model${tickedCount === 1 ? '' : 's'}` : 'Download'}
        </button>
        <span className="text-[11px] text-muted-foreground">
          {daemonUp ? 'Downloads keep going if you move on or close setup.' : 'Start Ollama to download.'}
        </span>
      </div>
    </div>
  );
}

function ModelRow({
  model,
  fit,
  checked,
  has,
  progress,
  onToggle,
}: {
  model: OllamaCatalogueModel;
  fit: OllamaRamFit | null;
  checked: boolean;
  has: boolean;
  progress: { status: string; total?: number; completed?: number; done: boolean } | undefined;
  onToggle: () => void;
}) {
  const percent =
    progress && progress.total && progress.completed !== undefined
      ? Math.min(100, Math.round((progress.completed / progress.total) * 100))
      : null;
  const pulling = progress !== undefined && !progress.done;
  return (
    <label className="flex items-center gap-2.5 rounded-md border border-border/60 bg-card/50 px-2.5 py-1.5">
      <input
        type="checkbox"
        checked={checked}
        disabled={has || pulling}
        onChange={onToggle}
        aria-label={model.label}
        className="h-3.5 w-3.5"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium">
          {model.label} <span className="font-mono text-[10px] text-muted-foreground">{model.tag}</span>
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {model.blurb} · {formatGb(model.sizeBytes)}
        </span>
        {pulling ? (
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded bg-muted">
              <span className="block h-full bg-primary" style={{ width: `${percent ?? 4}%` }} />
            </span>
            <span className="text-[10px] text-muted-foreground">{percent === null ? progress.status : `${percent}%`}</span>
          </span>
        ) : null}
      </span>
      {has || progress?.done ? (
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
          Installed
        </span>
      ) : fit ? (
        <span data-testid="ram-badge" className={`rounded-full px-2 py-0.5 text-[10px] ${FIT_STYLE[fit]}`}>
          {FIT_LABEL[fit]}
        </span>
      ) : null}
    </label>
  );
}
