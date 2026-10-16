import { bridge, useFrameChrome } from '@midnite/studio-frame';
import { SECRET_KEYS, type SecretKey } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

/** What each stored secret is for — the label the list shows. */
export const SECRET_LABELS = {
  'finance.twelveData': 'Twelve Data API key',
  'ollama.apiKey': 'Ollama cloud API key',
  'media.geminiApiKey': 'Gemini API key',
  'media.openaiApiKey': 'OpenAI API key',
  'media.huggingFaceToken': 'Hugging Face token',
  'media.mapTilerApiKey': 'MapTiler API key',
} as const satisfies Record<SecretKey, string>;

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
      title: `Remove ${SECRET_LABELS[key]}?`,
      body: 'Anything that uses it stops working until you set it again.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'secrets',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        // An empty value clears the entry (the `secretsSet` contract).
        void bridge()?.secrets.set({ key, value: '' }).then(refresh);
      },
    });

  return (
    <section aria-labelledby="vault-secrets" className="rounded-lg border border-border p-4">
      <h2 id="vault-secrets" className="mb-1 text-sm font-medium">Secrets</h2>
      <p className="mb-3 text-xs text-muted-foreground">Values are write-only: they are never shown again once saved.</p>
      <ul className="divide-y divide-border">
        {SECRET_KEYS.map((key) => (
          <li key={key} className="flex items-center gap-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{SECRET_LABELS[key]}</span>
              <span className="block text-muted-foreground">{key}</span>
            </span>
            {editing === key ? (
              <>
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={`New value for ${SECRET_LABELS[key]}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-56 rounded border border-border bg-background px-2 py-1"
                />
                <button type="button" onClick={() => void save(key)}>Save</button>
                <button type="button" onClick={() => { setEditing(null); setDraft(''); }}>Cancel</button>
              </>
            ) : (
              <>
                <span>{isSet === null ? '…' : isSet[key] ? 'Set' : 'Not set'}</span>
                <button type="button" onClick={() => setEditing(key)}>{isSet?.[key] ? 'Rotate' : 'Set'}</button>
                {isSet?.[key] ? <button type="button" onClick={() => remove(key)}>Remove</button> : null}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
