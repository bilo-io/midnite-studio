import { useEffect, useState } from 'react';
import { LuCheck, LuExternalLink, LuKey, LuLock, LuTerminal, LuX } from 'react-icons/lu';

import {
  useOllamaApiKeyHasKey,
  useOllamaSettings,
  useOllamaSignInStatus,
  useOllamaStatus,
  useSetOllamaApiKey,
  useSetOllamaSettings,
} from '../../models/use-models';
import { openExternal } from '../../../services/queries';
import { submitCommand } from './health-page';

/**
 * Settings ▸ Ollama (Phase 96 Themes C, F) — host override and default model
 * (Theme C), cloud API key + sign-in status (Theme F), all persisted in main
 * so a configured host/key reaches every daemon/cloud call, not just this
 * page's own reads. The API key never round-trips back to this page —
 * `useOllamaApiKeyHasKey` only ever answers `hasKey: boolean`.
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

      <SignInRow />
      <ApiKeyRow />
    </div>
  );
}

/** Whether the local daemon can already reach a `:cloud` model via `ollama signin`. */
function SignInRow() {
  const signIn = useOllamaSignInStatus();
  const signedIn = signIn.data?.signedIn ?? false;

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">Cloud sign-in</p>
      <p className="text-[11px] text-muted-foreground">
        Signing in lets the local daemon proxy <code className="font-mono">:cloud</code> models
        with no API key stored here.
      </p>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          {signedIn ? (
            <LuCheck aria-hidden className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          ) : (
            <LuX aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {signIn.isLoading ? 'Checking…' : signedIn ? 'Signed in via `ollama signin`' : 'Not signed in'}
        </span>
        {!signedIn ? (
          <button
            type="button"
            onClick={() => submitCommand('ollama signin', 'ollama sign in')}
            className="flex items-center gap-1 rounded-md border border-border bg-accent/40 px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <LuTerminal aria-hidden className="h-3 w-3" />
            Run ollama signin
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Set/clear `ollama.apiKey` in the vault — the value never crosses back to this page. */
function ApiKeyRow() {
  const hasKey = useOllamaApiKeyHasKey();
  const setKey = useSetOllamaApiKey();
  const [value, setValue] = useState('');

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setKey.mutate(trimmed, { onSuccess: () => setValue('') });
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-foreground">Cloud API key</p>
      <p className="text-[11px] text-muted-foreground">
        For <code className="font-mono">ollama.com</code> cloud models when not signed in
        locally. Get one at{' '}
        <button
          type="button"
          onClick={() => openExternal('https://ollama.com/settings/keys')}
          className="inline-flex items-center gap-0.5 underline decoration-dotted hover:text-foreground"
        >
          ollama.com/settings/keys <LuExternalLink aria-hidden className="h-2.5 w-2.5" />
        </button>{' '}
        · see usage and plans on the{' '}
        <button
          type="button"
          onClick={() => openExternal('https://ollama.com/pricing')}
          className="inline-flex items-center gap-0.5 underline decoration-dotted hover:text-foreground"
        >
          pricing page <LuExternalLink aria-hidden className="h-2.5 w-2.5" />
        </button>{' '}
        — this app never reads or shows credit balances.
      </p>
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/40 px-2 py-1.5 text-xs">
        <LuLock aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        {hasKey.data?.hasKey ? (
          <>
            <span className="flex flex-1 items-center gap-1 text-foreground">
              <LuKey aria-hidden className="h-3.5 w-3.5" />
              Key set
            </span>
            <button
              type="button"
              onClick={() => setKey.mutate('')}
              disabled={setKey.isPending}
              className="rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
            >
              Clear
            </button>
          </>
        ) : (
          <>
            <input
              type="password"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
              placeholder="Paste an ollama.com API key"
              className="h-5 flex-1 bg-transparent text-xs placeholder:text-muted-foreground/70 focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={save}
              disabled={value.trim().length === 0 || setKey.isPending}
              className="rounded-md border border-primary bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}
