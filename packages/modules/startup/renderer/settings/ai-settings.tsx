import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { DEFAULT_STARTUP_AI_SETTINGS, type StartupAiAgent, type StartupAiSettings, type StartupAiTest } from '@midnite/studio-shared';

import { STARTUP_KEY, startupBridge, StartupError, unwrap } from '../data/use-startup';

/** A host's settings render outside the pane's providers, so the page brings its own client. */
export const settingsClient = new QueryClient();
const SETTINGS_KEY = [...STARTUP_KEY, 'aiSettings'] as const;
const AGENTS_KEY = [...STARTUP_KEY, 'aiAgents'] as const;
const OLLAMA = '__ollama__';

const unavailable = () => Promise.reject(new StartupError('io', 'Midnite Startup is not available here.'));

/**
 * Settings ▸ AI (Phase 153 Theme D): which model drafts the investor update — an installed agent CLI, or an Ollama
 * model by name. Kept in Startup's own app settings, never the workspace. "Test" sends one short prompt to the
 * choice as it stands (saved or not) so a missing CLI or a stopped Ollama shows up here, not mid-draft.
 */
function AiPage() {
  const client = useQueryClient();
  const settings = useQuery<StartupAiSettings>({
    queryKey: SETTINGS_KEY,
    queryFn: async () => unwrap(await (startupBridge()?.getAiSettings() ?? unavailable())),
  });
  const agents = useQuery<StartupAiAgent[]>({
    queryKey: AGENTS_KEY,
    queryFn: async () => unwrap(await (startupBridge()?.listAiAgents() ?? unavailable())),
  });
  const saved = settings.data ?? DEFAULT_STARTUP_AI_SETTINGS;
  const [choice, setChoice] = useState<string | null>(null);
  const [ollama, setOllama] = useState<string | null>(null);
  const selected = choice ?? (saved.ollamaModel !== '' ? OLLAMA : saved.agentId);
  const modelName = ollama ?? saved.ollamaModel;
  const usingOllama = selected === OLLAMA;

  const next: StartupAiSettings = usingOllama
    ? { agentId: saved.agentId, ollamaModel: modelName.trim() }
    : { agentId: selected, ollamaModel: '' };
  const dirty = next.agentId !== saved.agentId || next.ollamaModel !== saved.ollamaModel;
  const incomplete = usingOllama && next.ollamaModel === '';

  const save = useMutation({
    mutationFn: async () => unwrap(await (startupBridge()?.setAiSettings({ settings: next }) ?? unavailable())),
    onSuccess: (value) => {
      client.setQueryData(SETTINGS_KEY, value);
      setChoice(null);
      setOllama(null);
    },
  });
  const test = useMutation<StartupAiTest>({
    mutationFn: async () => {
      const bridge = startupBridge();
      if (bridge === undefined) return unavailable();
      return unwrap(await bridge.testAiModel(usingOllama ? { ollamaModel: next.ollamaModel } : { agentId: next.agentId }));
    },
  });

  const installed = agents.data ?? [];
  const known = installed.some((a) => a.id === saved.agentId || a.id === selected);
  const options: StartupAiAgent[] = known || usingOllama ? installed : [{ id: selected, label: `${selected} (not installed)` }, ...installed];
  const busy = settings.isPending || save.isPending;

  return (
    <section className="flex flex-col gap-3 p-4" aria-label="AI">
      <header>
        <h2 className="text-sm font-semibold">AI</h2>
        <p className="text-xs text-muted-foreground">
          The model that drafts your monthly investor update. It sees only the figures gathered from this workspace and the notes you type. Claude by default.
        </p>
      </header>
      <label className="flex flex-col gap-1 text-xs">
        <span className="font-medium">Model</span>
        <select
          aria-label="Model"
          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          value={selected}
          disabled={busy}
          onChange={(e) => setChoice(e.target.value)}
        >
          {options.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
          <option value={OLLAMA}>Ollama (local model)</option>
        </select>
      </label>
      {usingOllama ? (
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Ollama model name</span>
          <input
            aria-label="Ollama model name"
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            placeholder="llama3.1"
            value={modelName}
            disabled={busy}
            onChange={(e) => setOllama(e.target.value)}
          />
        </label>
      ) : null}
      {agents.isSuccess && installed.length === 0 && !usingOllama ? (
        <p className="text-xs text-muted-foreground">No agent CLI (claude, codex or agy) was found on this machine; pick Ollama or install one.</p>
      ) : null}
      <div className="flex items-center gap-2">
        <button type="button" className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50" disabled={busy || !dirty || incomplete} onClick={() => save.mutate()}>
          Save
        </button>
        <button type="button" className="h-8 rounded-md border border-border px-3 text-xs font-medium disabled:opacity-50" disabled={busy || incomplete || test.isPending} onClick={() => test.mutate()}>
          {test.isPending ? 'Testing…' : 'Test'}
        </button>
      </div>
      {test.isSuccess ? <p role="status" className="text-xs text-emerald-500">{test.data.model} answered: {test.data.reply}</p> : null}
      {test.isError ? <p role="alert" className="text-xs text-red-500">{test.error.message}</p> : null}
      {settings.isError ? <p role="alert" className="text-xs text-red-500">{settings.error.message}</p> : null}
      {save.isError ? <p role="alert" className="text-xs text-red-500">{save.error.message}</p> : null}
    </section>
  );
}

export function StartupAiSettings() {
  return (
    <QueryClientProvider client={settingsClient}>
      <AiPage />
    </QueryClientProvider>
  );
}
