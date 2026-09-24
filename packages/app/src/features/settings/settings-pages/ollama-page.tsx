import { useEffect, useState } from 'react';
import { LuLock } from 'react-icons/lu';

import { useOllamaSettings, useOllamaStatus, useSetOllamaSettings } from '../../models/use-models';

/**
 * Settings ▸ Ollama (Phase 96 Theme C) — host override and default model,
 * both persisted in main (`ollama/settings-store.ts`) so a configured host
 * reaches every daemon call, not just this page's own reads.
 *
 * The cloud API key row is a disabled placeholder: Theme F owns
 * `SECRET_KEYS`/the vault write for it, and this page only reserves the
 * row so its layout doesn't shift once that theme lands (see the phase
 * doc's own "Theme F (M): widen `SECRET_KEYS` with `ollama.apiKey`").
 */
export function OllamaSettingsPage() {
  const settings = useOllamaSettings();
  const status = useOllamaStatus();
  const setSettings = useSetOllamaSettings();

  const [host, setHost] = useState('');
  const [defaultModel, setDefaultModel] = useState('');

  useEffect(() => {
    if (settings.data) {
      setHost(settings.data.host ?? '');
      setDefaultModel(settings.data.defaultModel ?? '');
    }
  }, [settings.data]);

  const saveHost = () => {
    const trimmed = host.trim();
    setSettings.mutate({ host: trimmed.length > 0 ? trimmed : null });
  };

  const saveDefaultModel = () => {
    const trimmed = defaultModel.trim();
    setSettings.mutate({ defaultModel: trimmed.length > 0 ? trimmed : null });
  };

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">Host</p>
        <p className="text-[11px] text-muted-foreground">
          Overrides <code className="font-mono">OLLAMA_HOST</code> for every call this app makes.
          Leave blank to use the daemon at <code className="font-mono">127.0.0.1:11434</code>{' '}
          (currently {status.data?.reachable ? 'reachable' : 'unreachable'} at{' '}
          {status.data?.host ?? '…'}).
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            onBlur={saveHost}
            placeholder="127.0.0.1:11434"
            className="h-7 flex-1 rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">Default model</p>
        <p className="text-[11px] text-muted-foreground">
          Pre-fills the model picker when a new agent binding is created (Phase 96 Theme H).
        </p>
        <input
          type="text"
          value={defaultModel}
          onChange={(event) => setDefaultModel(event.target.value)}
          onBlur={saveDefaultModel}
          placeholder="qwen3.5:14b"
          className="h-7 w-full rounded-md border border-border bg-card px-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">Cloud API key</p>
        <p className="text-[11px] text-muted-foreground">
          For `ollama.com` cloud models when not signed in locally. Coming with Theme F.
        </p>
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs text-muted-foreground">
          <LuLock aria-hidden className="h-3.5 w-3.5" />
          <input
            type="password"
            disabled
            placeholder="Not yet available"
            className="h-5 flex-1 bg-transparent text-xs placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </div>
  );
}
