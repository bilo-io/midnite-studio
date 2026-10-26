import { bridge, useFrameChrome } from '@midnite/studio-frame';
import {
  BUILTIN_AGENTS,
  SECRET_KEYS,
  agentSecretKey,
  type SecretKey,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SecretMaskedValue, type SecretMaskedValueHandle } from './secret-masked-value';

/** What each stored secret is for — the label the list shows. */
export const SECRET_LABELS = {
  'finance.twelveData': 'Twelve Data API key',
  'ollama.apiKey': 'Ollama cloud API key',
  'media.geminiApiKey': 'Gemini API key',
  'media.openaiApiKey': 'OpenAI API key',
  'media.huggingFaceToken': 'Hugging Face token',
  'media.mapTilerApiKey': 'MapTiler API key',
  'media.tmdbApiKey': 'TMDB API key',
} as const satisfies Partial<Record<SecretKey, string>>;

/** The LLM agent keys (`agent.<id>.apiKey`), labelled by the agent they belong to. */
const AGENT_KEYS: { key: SecretKey; label: string }[] = BUILTIN_AGENTS.flatMap((a) => {
  const key = agentSecretKey(a.id);
  return key ? [{ key, label: `${a.label} API key` }] : [];
});
const LLM_KEYS = new Set<SecretKey>(AGENT_KEYS.map((a) => a.key));
const OTHER_KEYS = SECRET_KEYS.filter((k) => !LLM_KEYS.has(k));

function labelOf(key: SecretKey): string {
  return (
    (SECRET_LABELS as Partial<Record<SecretKey, string>>)[key] ??
    AGENT_KEYS.find((a) => a.key === key)?.label ??
    key
  );
}

/**
 * Every app secret: set or not, and a way to write a new value or remove it.
 * The value goes one way — a password input into `secrets.set` — and is never
 * read back: this section only ever calls `secrets.has` (a boolean).
 */
export function SecretsSection() {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const [isSet, setIsSet] = useState<Partial<Record<SecretKey, boolean>> | null>(null);
  const [editing, setEditing] = useState<SecretKey | null>(null);
  const [draft, setDraft] = useState('');
  const [breachResult, setBreachResult] = useState<{ breached: boolean; count: number } | null>(null);
  const [checkingBreach, setCheckingBreach] = useState(false);
  const [revealedKey, setRevealedKey] = useState<SecretKey | null>(null);
  const [copiedKey, setCopiedKey] = useState<SecretKey | null>(null);
  const [actionError, setActionError] = useState<{ key: SecretKey; message: string } | null>(null);
  const maskedRefs = useRef<Map<SecretKey, SecretMaskedValueHandle>>(new Map());

  const checkBreach = async () => {
    if (!draft.trim()) return;
    setCheckingBreach(true);
    try {
      const res = await bridge()?.vaultBreach?.check({ password: draft });
      if (res) setBreachResult({ breached: res.breached, count: res.count });
    } catch {
      // Ignore
    } finally {
      setCheckingBreach(false);
    }
  };

  const refresh = useCallback(async () => {
    const secrets = bridge()?.secrets;
    if (!secrets) return setIsSet({});
    const rows = await Promise.all(
      SECRET_KEYS.map(async (key) => [key, (await secrets.has({ key })).hasKey] as const),
    );
    setIsSet(Object.fromEntries(rows));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = async (key: SecretKey) => {
    if (!draft.trim()) return;
    await bridge()?.secrets.set({ key, value: draft });
    setDraft('');
    setEditing(null);
    await refresh();
  };

  const remove = (key: SecretKey) =>
    dialogs.confirm({
      title: `Remove ${labelOf(key)}?`,
      body: 'Anything that uses it stops working until you set it again.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'credentials',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        // An empty value clears the entry (the `secretsSet` contract).
        void bridge()?.secrets.set({ key, value: '' }).then(refresh);
      },
    });

  const handleReveal = async (key: SecretKey) => {
    setActionError(null);
    if (revealedKey === key) {
      maskedRefs.current.get(key)?.mask();
      setRevealedKey(null);
      return;
    }
    const api = bridge()?.vaultSecrets;
    if (!api) {
      setActionError({ key, message: 'Vault secrets service not available' });
      return;
    }
    try {
      const res = await api.revealOnce({ namespace: 'secrets', key });
      if (res.ok && res.revealed) {
        setRevealedKey(key);
        maskedRefs.current.get(key)?.reveal(res.revealed);
      } else {
        setActionError({ key, message: res.error ?? 'Reveal failed' });
      }
    } catch (e) {
      setActionError({ key, message: e instanceof Error ? e.message : 'Reveal failed' });
    }
  };

  const handleCopy = async (key: SecretKey) => {
    setActionError(null);
    const api = bridge()?.vaultSecrets;
    if (!api) {
      setActionError({ key, message: 'Vault secrets service not available' });
      return;
    }
    try {
      const res = await api.copyOnce({ namespace: 'secrets', key, timeoutSeconds: 30 });
      if (res.ok) {
        setCopiedKey(key);
        setTimeout(() => {
          setCopiedKey((curr) => (curr === key ? null : curr));
        }, 3000);
      } else {
        setActionError({ key, message: res.error ?? 'Copy failed' });
      }
    } catch (e) {
      setActionError({ key, message: e instanceof Error ? e.message : 'Copy failed' });
    }
  };

  const renderList = (keys: readonly SecretKey[]) => (
    <ul className="divide-y divide-border">
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{labelOf(key)}</span>
            <span className="block text-muted-foreground">{key}</span>
          </span>
          {editing === key ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="off"
                aria-label={`New value for ${labelOf(key)}`}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setBreachResult(null);
                }}
                className="w-48 rounded border border-border bg-background px-2 py-1 text-xs"
              />
              <button
                type="button"
                onClick={() => void checkBreach()}
                disabled={!draft.trim() || checkingBreach}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {checkingBreach ? 'Checking…' : 'Check breach'}
              </button>
              {breachResult ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    breachResult.breached ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {breachResult.breached
                    ? `⚠️ Breached in ${breachResult.count.toLocaleString()} leaks`
                    : '✓ Clean'}
                </span>
              ) : null}
              <button type="button" onClick={() => void save(key)} className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground">
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft('');
                  setBreachResult(null);
                }}
                className="rounded px-2 py-0.5 text-[11px] hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {isSet?.[key] ? (
                <SecretMaskedValue
                  ref={(el) => {
                    if (el) maskedRefs.current.set(key, el);
                    else maskedRefs.current.delete(key);
                  }}
                  onMask={() => setRevealedKey((curr) => (curr === key ? null : curr))}
                  className={revealedKey === key ? 'rounded bg-muted/60 px-2 py-0.5 text-xs' : 'hidden'}
                  ariaLabel={`Secret value for ${labelOf(key)}`}
                />
              ) : null}
              {revealedKey !== key ? <span>{isSet === null ? '…' : isSet[key] ? 'Set' : 'Not set'}</span> : null}
              {isSet?.[key] ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleReveal(key)}
                    className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {revealedKey === key ? 'Mask' : 'Reveal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCopy(key)}
                    className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                  >
                    {copiedKey === key ? 'Copied (clears in 30s)' : 'Copy'}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setEditing(key)}
                className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
              >
                {isSet?.[key] ? 'Rotate' : 'Set'}
              </button>
              {isSet?.[key] ? (
                <button
                  type="button"
                  onClick={() => remove(key)}
                  className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
                >
                  Remove
                </button>
              ) : null}
              {actionError && actionError.key === key ? (
                <span className="text-[11px] text-rose-400">{actionError.message}</span>
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <section aria-labelledby="vault-secrets" className="rounded-lg border border-border p-4">
      <h2 id="vault-secrets" className="mb-1 text-sm font-medium">
        Secrets
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Values are encrypted at rest. Reveal and copy require re-authentication and clear automatically.
      </p>
      {renderList(OTHER_KEYS)}
      <h3 id="vault-llm-keys" className="mb-1 mt-4 text-xs font-medium">
        LLM keys
      </h3>
      {renderList(AGENT_KEYS.map((a) => a.key))}
    </section>
  );
}
