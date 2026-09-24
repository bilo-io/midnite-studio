import type { OllamaModel, OllamaModelDetail, OllamaRunningModel } from '@midnite/studio-shared';
import {
  AGENT_MIN_CONTEXT_LENGTH,
  BUILTIN_AGENTS,
  agentFitness,
  deriveEmbeddingLength,
  effectiveContextLength,
  supportsOllamaBackend,
} from '@midnite/studio-shared';
import { useState } from 'react';
import {
  LuCircleCheckBig,
  LuMaximize2,
  LuRocket,
  LuSquare,
  LuTrash2,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu';
import { SiOllama } from 'react-icons/si';

import { useDialogs } from '../../components/dialog-host';
import { Modal } from '../../components/modal';
import { Spinner } from '../../components/skeleton';
import { useUiStore } from '../../store/ui-store';
import { formatBytes } from '../monitor/format-bytes';
import { CodePreview } from '../files/preview/code-preview';
import { useCreateModel, useDeleteModel, useOllamaShow, useUnloadModel } from './use-models';

const TABS = ['modelfile', 'template', 'parameters', 'license'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  modelfile: 'Modelfile',
  template: 'Template',
  parameters: 'Parameters',
  license: 'Licence',
};

function tabContent(detail: OllamaModelDetail | null | undefined, tab: Tab): string {
  if (!detail) return '';
  switch (tab) {
    case 'modelfile':
      return detail.modelfile ?? '';
    case 'template':
      return detail.template ?? '';
    case 'parameters':
      return detail.parameters ?? '';
    case 'license':
      return Array.isArray(detail.license) ? detail.license.join('\n\n---\n\n') : (detail.license ?? '');
  }
}

/**
 * Theme E — the model detail modal, opened from an Installed row (`models-
 * view.tsx`'s `ModelRow.onOpenDetail`, Theme C's own stub for this). Takes
 * the full `OllamaModel` tags-list row rather than just a name: size and
 * modified-date live only there, `show` (Theme B) carries everything else.
 *
 * A Discover/Cloud row that is not installed yet (Themes D/F, not built in
 * this PR) is not wired up here — `model` always comes from the Installed
 * list today, so every section below assumes `show` will eventually resolve.
 * Once Discover/Cloud pass in a not-yet-installed row, the natural extension
 * is an `installed` prop that swaps the `show`-backed sections for a Pull
 * button, per the phase doc's own Theme E bullet — left as a documented
 * follow-up rather than guessed at against a shape that doesn't exist on
 * `main` yet.
 */
export function ModelDetailModal({
  open,
  onClose,
  model,
  running,
}: {
  open: boolean;
  onClose: () => void;
  model: OllamaModel | null;
  running?: OllamaRunningModel | undefined;
}) {
  const [tab, setTab] = useState<Tab>('modelfile');
  const [launchAgent, setLaunchAgent] = useState('');
  const dialogs = useDialogs();
  const setAgentBackend = useUiStore((s) => s.setAgentBackend);

  const detailQuery = useOllamaShow(open && model ? model.model : null);
  const unload = useUnloadModel();
  const remove = useDeleteModel();
  const create = useCreateModel();

  if (!model) return null;

  const detail = detailQuery.data;
  const effectiveCtx = detail ? effectiveContextLength(detail) : null;
  const fitness = detail && effectiveCtx !== null ? agentFitness(detail, effectiveCtx) : null;
  const embeddingLength = detail ? deriveEmbeddingLength(detail.modelInfo) : null;
  const capabilities = detail?.capabilities ?? [];
  const already64k = model.model.endsWith('-64k');
  const variantName = `${model.model}-64k`;

  const ollamaAgents = BUILTIN_AGENTS.filter((agent) => supportsOllamaBackend(agent.id));

  const deleteModel = () => {
    dialogs.confirm({
      title: `Delete "${model.name}"?`,
      body: `This removes ${formatBytes(model.size)} from disk. This cannot be undone.${
        running ? ' This model is currently loaded and will be unloaded first.' : ''
      }`,
      confirmLabel: 'Delete',
      danger: true,
      blastRadius: null,
      onConfirm: () => remove.mutate(model.model, { onSuccess: (result) => result.ok && onClose() }),
    });
  };

  const make64k = () => {
    dialogs.confirm({
      title: 'Make a 64k-context variant?',
      body: `Creates "${variantName}" from "${model.name}" with a 65536-token context window (${'PARAMETER num_ctx 65536'}), using roughly another ${formatBytes(
        model.size,
      )} of disk. "${model.name}" itself is left untouched.`,
      confirmLabel: 'Create variant',
      danger: false,
      blastRadius: null,
      onConfirm: () =>
        create.mutate({ from: model.model, name: variantName, parameters: { num_ctx: AGENT_MIN_CONTEXT_LENGTH } }),
    });
  };

  const setDefault = () => {
    if (!launchAgent) return;
    setAgentBackend(launchAgent, { backend: 'ollama', model: model.model });
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title={model.name} testId="model-detail-modal">
      <div className="flex max-h-[80vh] flex-col">
        <header className="flex items-start gap-3 border-b border-border/60 p-4">
          <SiOllama aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-mono text-sm font-semibold">{model.name}</h2>
            <p className="text-[11px] text-muted-foreground">
              {formatBytes(model.size)}
              {model.modifiedAt ? ` · modified ${new Date(model.modifiedAt).toLocaleDateString()}` : ''}
              {running ? ` · running${running.sizeVram ? ` · ${formatBytes(running.sizeVram)} VRAM` : ''}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-accent/40 hover:text-foreground"
          >
            <LuX className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <Spinner className="h-3.5 w-3.5" />
              Reading model details…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <Stat label="Parameters" value={model.details?.parameterSize ?? '—'} />
                <Stat label="Quantisation" value={model.details?.quantizationLevel ?? '—'} />
                <Stat label="Architecture" value={model.details?.family ?? '—'} />
                <Stat
                  label="Context"
                  value={
                    detail?.contextLength
                      ? `${detail.contextLength.toLocaleString()} max`
                      : '—'
                  }
                  sub={effectiveCtx !== null ? `${effectiveCtx.toLocaleString()} effective` : undefined}
                />
                {embeddingLength !== null ? (
                  <Stat label="Embedding" value={embeddingLength.toLocaleString()} />
                ) : null}
              </div>

              <div className="flex flex-wrap gap-1.5 px-4 pb-2">
                {capabilities.length > 0 ? (
                  capabilities.map((cap) => <Chip key={cap}>{cap}</Chip>)
                ) : (
                  <span className="text-[11px] text-muted-foreground">No reported capabilities.</span>
                )}
              </div>

              {fitness ? (
                <div
                  className={`mx-4 mb-3 flex flex-col gap-1 rounded-md border p-2.5 text-[11px] ${
                    fitness.fit
                      ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {fitness.fit ? (
                      <LuCircleCheckBig className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <LuTriangleAlert className="h-3.5 w-3.5 shrink-0" />
                    )}
                    {fitness.fit ? 'Fit for agents' : 'Not agent-ready'}
                  </div>
                  {!fitness.fit ? (
                    <ul className="list-disc pl-5">
                      {fitness.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {!fitness.fit && !already64k && effectiveCtx !== null && effectiveCtx < AGENT_MIN_CONTEXT_LENGTH ? (
                    <button
                      type="button"
                      onClick={make64k}
                      disabled={create.isPending}
                      className="mt-1 flex w-fit items-center gap-1.5 rounded-md border border-current px-2 py-1 text-[11px] font-medium hover:bg-current/10 disabled:opacity-50"
                    >
                      {create.isPending ? (
                        <Spinner className="h-3 w-3" />
                      ) : (
                        <LuMaximize2 className="h-3 w-3" />
                      )}
                      Make {variantName}
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center gap-1 border-b border-border/60 px-4">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={`border-b-2 px-2 py-1.5 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
              </div>

              <div className="flex h-64 flex-col">
                {tabContent(detail, tab) ? (
                  <CodePreview content={tabContent(detail, tab)} language={null} showGutter={false} />
                ) : (
                  <p className="p-4 text-xs text-muted-foreground">Nothing reported for this tab.</p>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-border/60 p-3">
          {running ? (
            <button
              type="button"
              onClick={() => unload.mutate(model.model)}
              disabled={unload.isPending}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent/40 disabled:opacity-50"
            >
              <LuSquare className="h-3.5 w-3.5" />
              Unload
            </button>
          ) : null}
          <button
            type="button"
            onClick={deleteModel}
            disabled={remove.isPending}
            aria-label={`Delete ${model.name}`}
            className="flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            <LuTrash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>

          {/* "Launch with…" (Theme I) has no session-opening wiring yet — a
              real, disabled hook rather than an omitted button, the same
              precedent `ModelRow.onOpenDetail` set for this modal itself. */}
          <button
            type="button"
            disabled
            title="Opens a new session on this model — Theme I"
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium opacity-50"
          >
            <LuRocket className="h-3.5 w-3.5" />
            Launch with…
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <select
              value={launchAgent}
              onChange={(event) => setLaunchAgent(event.target.value)}
              aria-label="Agent to set this model as default for"
              className="h-7 rounded border border-input bg-background px-1.5 text-[11px] outline-none focus-visible:border-primary"
            >
              <option value="">Set as default for…</option>
              {ollamaAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={setDefault}
              disabled={!launchAgent}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-accent/40 disabled:opacity-50"
            >
              Set
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
      {sub ? <span className="text-[10px] text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
      {children}
    </span>
  );
}
