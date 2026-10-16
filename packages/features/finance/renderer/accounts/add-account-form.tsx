import { useState } from 'react';

import type { AccountConnectorId, AccountConnectorInfo, AccountEnvironment } from '@midnite/studio-shared';

import { useAddAccount, useTestAccount, type AccountDraft } from './accounts-queries';

/**
 * Add a read-only account: pick a connector, type its credentials into write-only inputs, test, save.
 *
 * Every credential input is a password field whose draft lives only in this component's state; it is
 * cleared the moment the account is saved, and there is no control anywhere that reads a stored one
 * back. The form says up front what kind of key to create at the provider.
 */
const INPUT =
  'h-8 min-w-0 rounded border border-input bg-background px-2 text-xs outline-none focus-visible:border-primary';

export function AddAccountForm({
  connectors,
  onDone,
}: {
  connectors: AccountConnectorInfo[];
  onDone: () => void;
}) {
  const [connectorId, setConnectorId] = useState<AccountConnectorId | ''>(connectors[0]?.id ?? '');
  const [label, setLabel] = useState('');
  const [environment, setEnvironment] = useState<AccountEnvironment>('paper');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const test = useTestAccount();
  const add = useAddAccount();

  const connector = connectors.find((c) => c.id === connectorId);
  if (!connector) return null;

  const draft = (): AccountDraft => ({ connector: connector.id, environment, fields });
  const complete = connector.inputs.every((input) => (fields[input.name] ?? '').trim() !== '');
  const busy = test.isPending || add.isPending;

  const run = async (kind: 'test' | 'add'): Promise<void> => {
    setNotice(null);
    try {
      if (kind === 'test') {
        const { summary } = await test.mutateAsync(draft());
        setNotice({ tone: 'ok', text: summary });
        return;
      }
      await add.mutateAsync({ ...draft(), label: label.trim() || connector.label });
      // Drop every typed credential before anything else can render it.
      setFields({});
      setLabel('');
      onDone();
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Something went wrong.' });
    }
  };

  return (
    <form
      aria-label="Add account"
      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (complete && !busy) void run('add');
      }}
    >
      <p className="text-xs text-muted-foreground">{connector.readOnlyHint}</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Connector"
          value={connector.id}
          onChange={(event) => {
            setConnectorId(event.target.value as AccountConnectorId);
            setFields({});
            setNotice(null);
          }}
          className={INPUT}
        >
          {connectors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.assetClass})
            </option>
          ))}
        </select>
        <input
          aria-label="Account label"
          value={label}
          maxLength={60}
          placeholder={connector.label}
          onChange={(event) => setLabel(event.target.value)}
          className={`${INPUT} flex-1`}
        />
        {connector.supportsEnvironment ? (
          <select
            aria-label="Environment"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as AccountEnvironment)}
            className={INPUT}
          >
            <option value="paper">Paper</option>
            <option value="live">Live</option>
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {connector.inputs.map((input) => (
          <input
            key={`${connector.id}.${input.name}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label={input.label}
            placeholder={input.label}
            value={fields[input.name] ?? ''}
            onChange={(event) => setFields((prev) => ({ ...prev, [input.name]: event.target.value }))}
            className={`${INPUT} min-w-[180px] flex-1 font-mono`}
          />
        ))}
      </div>
      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`text-xs ${notice.tone === 'error' ? 'text-destructive' : 'text-success'}`}>
          {notice.text}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="h-8 rounded px-3 text-xs text-muted-foreground hover:text-foreground">
          Cancel
        </button>
        <button
          type="button"
          disabled={!complete || busy}
          onClick={() => void run('test')}
          className="h-8 rounded border border-border px-3 text-xs disabled:opacity-50"
        >
          Test connection
        </button>
        <button type="submit" disabled={!complete || busy} className="h-8 rounded bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">
          Add account
        </button>
      </div>
    </form>
  );
}
