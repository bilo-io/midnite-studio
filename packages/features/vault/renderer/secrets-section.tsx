import { bridge, useFrameChrome } from '@midnite/studio-frame';
import {
  BUILTIN_AGENTS,
  SECRET_KEYS,
  agentSecretKey,
  type SecretKey,
} from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

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

  const renderList = (keys: readonly SecretKey[]) => (
    <ul className="divide-y divide-border">
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-3 py-2 text-xs">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{labelOf(key)}</span>
            <span className="block text-muted-foreground">{key}</span>
          </span>
          {editing === key ? (
            <>
              <input
                type="password"
                autoComplete="off"
                aria-label={`New value for ${labelOf(key)}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-56 rounded border border-border bg-background px-2 py-1"
              />
              <button type="button" onClick={() => void save(key)}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft('');
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <span>{isSet === null ? '…' : isSet[key] ? 'Set' : 'Not set'}</span>
              <button type="button" onClick={() => setEditing(key)}>
                {isSet?.[key] ? 'Rotate' : 'Set'}
              </button>
              {isSet?.[key] ? (
                <button type="button" onClick={() => remove(key)}>
                  Remove
                </button>
              ) : null}
            </>
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
        Values are write-only: they are never shown again once saved.
      </p>
      {renderList(OTHER_KEYS)}
      <h3 id="vault-llm-keys" className="mb-1 mt-4 text-xs font-medium">
        LLM keys
      </h3>
      {renderList(AGENT_KEYS.map((a) => a.key))}
    </section>
  );
}
