import { bridge, useFrameChrome } from '@midnite/studio-frame';
import { agentSecretKey, type AgentDefinition } from '@midnite/studio-shared';
import { useCallback, useEffect, useState } from 'react';

/**
 * One agent's API key — write-only (Phase 113 Theme J slice 2; a vault-feature
 * component since slice 3, which Studio's Settings ▸ Agent renders per agent).
 *
 * The key lives in the vault (`agent.<id>.apiKey`); this field only ever asks
 * `secrets.has` whether one is set and writes a new value one way. It never
 * shows a stored key again, so there is no reveal toggle: the input is always a
 * password field and its draft is dropped on save. Replace is the same write;
 * Remove is confirmed, like every other secret removal.
 */
export function AgentKeyField({ agent }: { agent: AgentDefinition }) {
  const { useDialogs } = useFrameChrome();
  const dialogs = useDialogs();
  const key = agentSecretKey(agent.id);
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(async () => {
    const secrets = bridge()?.secrets;
    if (!key || !secrets) return setIsSet(false);
    setIsSet((await secrets.has({ key })).hasKey);
  }, [key]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!key) return null;

  const save = async () => {
    if (!draft.trim()) return;
    await bridge()?.secrets.set({ key, value: draft.trim() });
    setDraft('');
    setEditing(false);
    await refresh();
  };

  const remove = () =>
    dialogs.confirm({
      title: `Remove the ${agent.label} API key?`,
      body: 'The key is deleted from the vault. Anything that used it stops working until you set it again.',
      confirmLabel: 'Remove',
      danger: true,
      blastRadiusKind: 'credentials',
      blastRadius: { count: 1, sample: [] },
      onConfirm: () => {
        // An empty value clears the entry (the `secretsSet` contract).
        void bridge()?.secrets.set({ key, value: '' }).then(refresh);
      },
    });

  const showInput = editing || isSet === false;

  return (
    <div className="flex flex-1 min-w-[220px] items-center gap-2">
      <span className="text-[11px] font-medium text-muted-foreground shrink-0">
        {agent.apiKeyEnvVar ?? 'API Key'}:
      </span>
      {showInput ? (
        <>
          <input
            type="password"
            autoComplete="off"
            value={draft}
            placeholder={agent.apiKeyEnvVar ? `Enter ${agent.apiKeyEnvVar}` : 'Enter API Key'}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            aria-label={`${agent.label} API Key`}
            className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 font-mono text-xs outline-none focus-visible:border-primary"
          />
          <button
            type="button"
            onClick={() => void save()}
            disabled={!draft.trim()}
            aria-label={`Save ${agent.label} API Key`}
            className="px-1 text-[11px] text-foreground disabled:opacity-40"
          >
            Save
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft('');
              }}
              className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          ) : null}
        </>
      ) : (
        <>
          <span className="flex-1 text-[11px] text-muted-foreground">
            {isSet === null ? '…' : 'Stored in the vault'}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Replace ${agent.label} API Key`}
            className="px-1 text-[11px] text-foreground"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${agent.label} API Key`}
            className="px-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Remove
          </button>
        </>
      )}
    </div>
  );
}
